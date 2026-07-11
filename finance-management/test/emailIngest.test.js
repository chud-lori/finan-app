const chai = require('chai');
const chaiHttp = require('chai-http');
const { expect } = require('chai');
const server = require('../app');
const User = require('../models/user.model');
const PendingTransaction = require('../models/pendingTransaction.model');
const { parseBankEmail, identifySource, parseIdrAmount } = require('../services/emailIngest/parser');
const { ingestEmail, extractIngestToken } = require('../services/emailIngest/ingest');

chai.use(chaiHttp);

const BCA_TRANSFER_TEXT = `Nasabah Yth.,

Transaksi Anda telah berhasil dilakukan.

Tanggal         : 10/07/2026
Jam             : 14:32:11
Jenis Transaksi : TRANSFER ANTAR REKENING
Kepada          : BUDI SANTOSO
Nomor Rekening  : 1234567890
Jumlah          : Rp 150.000,00
Berita          : Bayar makan siang

Terima kasih,
Bank BCA`;

const BCA_INCOMING_TEXT = `Nasabah Yth.,

Anda menerima dana transfer masuk sebesar Rp 2.500.000,00 dari ANDI WIJAYA.

Terima kasih,
Bank BCA`;

const JAGO_HTML = `<html><body><div style="font-family:sans-serif">
<p>Hi Lori,</p>
<p>You've successfully transferred <b>Rp100.000</b> to <b>KOPI KENANGAN</b></p>
<p>Jago - Bank Artos Indonesia</p>
</div></body></html>`;

const bcaEmail = (overrides = {}) => ({
    from: 'notifikasi@bca.co.id',
    subject: 'Notifikasi Transaksi BCA',
    text: BCA_TRANSFER_TEXT,
    html: '',
    date: new Date('2026-07-10T07:32:11Z'),
    messageId: '<bca-msg-1@bca.co.id>',
    recipients: ['finan+abcdef0123456789@test.local'],
    ...overrides,
});

describe('Email Ingest — parser', () => {
    describe('parseIdrAmount', () => {
        it('parses Indonesian thousands format', () => {
            expect(parseIdrAmount('150.000')).to.equal(150000);
            expect(parseIdrAmount('1.234.567')).to.equal(1234567);
        });
        it('parses Indonesian decimal format', () => {
            expect(parseIdrAmount('1.234.567,89')).to.equal(1234567.89);
            expect(parseIdrAmount('150000,50')).to.equal(150000.5);
        });
        it('parses English format', () => {
            expect(parseIdrAmount('150,000.00')).to.equal(150000);
        });
        it('handles Rp prefix and trailing ,-', () => {
            expect(parseIdrAmount('Rp 150.000,-')).to.equal(150000);
            expect(parseIdrAmount('IDR 75.500')).to.equal(75500);
        });
        it('rejects garbage', () => {
            expect(parseIdrAmount('abc')).to.equal(null);
            expect(parseIdrAmount('')).to.equal(null);
            expect(parseIdrAmount(null)).to.equal(null);
        });
    });

    describe('identifySource', () => {
        it('identifies BCA and Jago sender domains', () => {
            expect(identifySource('notifikasi@bca.co.id')).to.equal('bca');
            expect(identifySource('no-reply@klikbca.com')).to.equal('bca');
            expect(identifySource('Bank Jago <noreply@jago.com>')).to.equal('jago');
        });
        it('rejects lookalike and unrelated domains', () => {
            expect(identifySource('evil@bca.co.id.evil.com')).to.equal(null);
            expect(identifySource('friend@gmail.com')).to.equal(null);
            expect(identifySource('')).to.equal(null);
        });
    });

    describe('parseBankEmail', () => {
        it('parses a BCA outgoing transfer as expense', () => {
            const r = parseBankEmail(bcaEmail());
            expect(r.source).to.equal('bca');
            expect(r.parsed).to.equal(true);
            expect(r.amount).to.equal(150000);
            expect(r.type).to.equal('expense');
            expect(r.currency).to.equal('idr');
            expect(r.description).to.equal('BUDI SANTOSO');
            expect(r.time.toISOString()).to.equal('2026-07-10T07:32:11.000Z');
        });

        it('parses a BCA incoming transfer as income', () => {
            const r = parseBankEmail(bcaEmail({ text: BCA_INCOMING_TEXT, subject: 'Notifikasi Dana Masuk' }));
            expect(r.parsed).to.equal(true);
            expect(r.amount).to.equal(2500000);
            expect(r.type).to.equal('income');
        });

        it('parses a Jago HTML-only email via prose template', () => {
            const r = parseBankEmail(bcaEmail({
                from: 'noreply@jago.com',
                subject: 'Transaction successful',
                text: '',
                html: JAGO_HTML,
            }));
            expect(r.source).to.equal('jago');
            expect(r.parsed).to.equal(true);
            expect(r.amount).to.equal(100000);
            expect(r.type).to.equal('expense');
            expect(r.description).to.equal('KOPI KENANGAN');
        });

        it('returns parsed:false for a bank email without an amount', () => {
            const r = parseBankEmail(bcaEmail({ text: 'Promo spesial untuk Anda!', subject: 'Promo BCA' }));
            expect(r.source).to.equal('bca');
            expect(r.parsed).to.equal(false);
            expect(r.snippet).to.be.a('string');
        });

        it('returns null for non-bank senders', () => {
            expect(parseBankEmail(bcaEmail({ from: 'newsletter@shop.com' }))).to.equal(null);
        });
    });

    describe('extractIngestToken', () => {
        it('extracts the token from a matching plus address', () => {
            expect(extractIngestToken(['finan+abcdef0123456789@test.local'], 'finan@test.local'))
                .to.equal('abcdef0123456789');
        });
        it('rejects wrong domain, wrong mailbox, and malformed tokens', () => {
            expect(extractIngestToken(['finan+abcdef0123456789@other.com'], 'finan@test.local')).to.equal(null);
            expect(extractIngestToken(['other+abcdef0123456789@test.local'], 'finan@test.local')).to.equal(null);
            expect(extractIngestToken(['finan+short@test.local'], 'finan@test.local')).to.equal(null);
            expect(extractIngestToken([], 'finan@test.local')).to.equal(null);
        });
    });
});

describe('Email Ingest — pipeline', () => {
    let user;

    beforeEach(async () => {
        await PendingTransaction.init(); // ensure unique index exists before dedupe test
        user = await User.create({
            name: 'Ingest User',
            username: 'ingestuser',
            email: 'ingest@example.com',
            emailIngestToken: 'abcdef0123456789',
        });
    });

    it('creates a pending transaction for a routed bank email', async () => {
        const outcome = await ingestEmail(bcaEmail());
        expect(outcome).to.equal('created');
        const docs = await PendingTransaction.find({ user: user._id });
        expect(docs).to.have.length(1);
        expect(docs[0].source).to.equal('bca');
        expect(docs[0].parsed).to.equal(true);
        expect(docs[0].amount).to.equal(150000);
        expect(docs[0].emailMessageId).to.equal('<bca-msg-1@bca.co.id>');
    });

    it('dedupes on emailMessageId', async () => {
        expect(await ingestEmail(bcaEmail())).to.equal('created');
        expect(await ingestEmail(bcaEmail())).to.equal('duplicate');
        expect(await PendingTransaction.countDocuments({ user: user._id })).to.equal(1);
    });

    it('skips emails without a routable token or known user', async () => {
        expect(await ingestEmail(bcaEmail({ recipients: ['someone@else.com'] }))).to.equal('no-token');
        expect(await ingestEmail(bcaEmail({ recipients: ['finan+ffffffffffffffff@test.local'] }))).to.equal('no-user');
        expect(await ingestEmail(bcaEmail({ from: 'spam@spam.com' }))).to.equal('not-bank');
        expect(await PendingTransaction.countDocuments()).to.equal(0);
    });

    it('surfaces the Gmail forward-confirmation email with its verification link', async () => {
        const outcome = await ingestEmail(bcaEmail({
            from: 'forwarding-noreply@google.com',
            subject: 'Gmail Forwarding Confirmation',
            text: 'To allow this, click the link below:\nhttps://mail-settings.google.com/mail/vf-abc123-def',
            messageId: '<gmail-confirm-1@google.com>',
        }));
        expect(outcome).to.equal('created');
        const doc = await PendingTransaction.findOne({ user: user._id });
        expect(doc.source).to.equal('gmail');
        expect(doc.parsed).to.equal(false);
        expect(doc.snippet).to.equal('https://mail-settings.google.com/mail/vf-abc123-def');
    });

    it('stores unparseable bank emails as manual-entry stubs', async () => {
        const outcome = await ingestEmail(bcaEmail({ text: 'Pengumuman layanan.', subject: 'Info BCA' }));
        expect(outcome).to.equal('created');
        const doc = await PendingTransaction.findOne({ user: user._id });
        expect(doc.parsed).to.equal(false);
        expect(doc.subject).to.equal('Info BCA');
    });
});

describe('Email Ingest — API', () => {
    let authCookie;
    let userId;

    beforeEach(async () => {
        const testUser = {
            name: 'Test User',
            username: 'testuser',
            email: 'test@example.com',
            password: 'password123',
        };
        await chai.request(server).post('/api/auth/register').send(testUser);
        const loginRes = await chai.request(server)
            .post('/api/auth/login')
            .send({ username: testUser.username, password: testUser.password });
        // Auth token is HttpOnly-cookie-only — read it from Set-Cookie
        authCookie = loginRes.headers['set-cookie']
            .find(c => c.startsWith('token='))
            .split(';')[0];
        userId = loginRes.body.data.user.id;
    });

    describe('GET /api/email-ingest/pending', () => {
        it('lists the user\'s pending transactions, newest first', async () => {
            await PendingTransaction.create([
                { user: userId, source: 'bca', emailMessageId: '<a@x>', parsed: true, description: 'WARUNG', amount: 25000, currency: 'idr', type: 'expense', time: new Date(), subject: 's1', receivedAt: new Date('2026-07-09') },
                { user: userId, source: 'jago', emailMessageId: '<b@x>', parsed: false, subject: 's2', snippet: 'unparsed', receivedAt: new Date('2026-07-10') },
            ]);
            const res = await chai.request(server)
                .get('/api/email-ingest/pending')
                .set('Cookie', authCookie);
            expect(res).to.have.status(200);
            expect(res.body.data.total).to.equal(2);
            expect(res.body.data.pending[0].source).to.equal('jago');
            expect(res.body.data.pending[1].description).to.equal('WARUNG');
        });

        it('returns 401 without auth', async () => {
            const res = await chai.request(server).get('/api/email-ingest/pending');
            expect(res).to.have.status(401);
        });
    });

    describe('DELETE /api/email-ingest/pending/:id', () => {
        it('dismisses an own pending transaction', async () => {
            const doc = await PendingTransaction.create({ user: userId, source: 'bca', emailMessageId: '<c@x>', subject: 's' });
            const res = await chai.request(server)
                .delete(`/api/email-ingest/pending/${doc._id}`)
                .set('Cookie', authCookie);
            expect(res).to.have.status(200);
            expect(await PendingTransaction.countDocuments()).to.equal(0);
        });

        it('returns 404 for another user\'s pending transaction', async () => {
            const other = await User.create({ name: 'Other', username: 'other', email: 'other@example.com' });
            const doc = await PendingTransaction.create({ user: other._id, source: 'bca', emailMessageId: '<d@x>', subject: 's' });
            const res = await chai.request(server)
                .delete(`/api/email-ingest/pending/${doc._id}`)
                .set('Cookie', authCookie);
            expect(res).to.have.status(404);
            expect(await PendingTransaction.countDocuments()).to.equal(1);
        });
    });

    describe('GET /api/email-ingest/address', () => {
        it('creates a stable per-user forwarding address', async () => {
            const res1 = await chai.request(server)
                .get('/api/email-ingest/address')
                .set('Cookie', authCookie);
            expect(res1).to.have.status(200);
            expect(res1.body.data.address).to.match(/^finan\+[a-f0-9]{16}@test\.local$/);

            const res2 = await chai.request(server)
                .get('/api/email-ingest/address')
                .set('Cookie', authCookie);
            expect(res2.body.data.address).to.equal(res1.body.data.address);
        });
    });
});
