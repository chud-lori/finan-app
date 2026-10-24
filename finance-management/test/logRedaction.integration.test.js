const chai = require('chai');
const chaiHttp = require('chai-http');
const { expect } = require('chai');
const crypto = require('crypto');
const server = require('../app');
const logger = require('../helpers/logger');
const { redactUrl } = require('../helpers/redactUrl');

chai.use(chaiHttp);

// Both middlewares write on the response's 'finish' event, which can land after the client has its reply.
const waitForLines = async (lines, count) => {
    for (let i = 0; i < 30 && lines.length < count; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
};

describe('Log redaction', () => {
    let lines;
    let originalInfo;

    beforeEach(() => {
        lines = [];
        originalInfo = logger.info;
        logger.info = (...args) => { lines.push(args); };
    });

    afterEach(() => {
        logger.info = originalInfo;
    });

    it('keeps the raw email-verification token out of both request logs', async () => {
        const token = crypto.randomBytes(32).toString('hex');

        const res = await chai.request(server).get(`/api/auth/verify-email/${token}`);
        await waitForLines(lines, 2);

        expect(res).to.have.status(400);

        const accessLog = lines.find(([message]) => message === 'accesslog');
        const requestLog = lines.find(([message]) => typeof message === 'string' && message.startsWith('HTTP '));

        expect(accessLog[1].url).to.equal('/api/auth/verify-email/[redacted]');
        expect(requestLog[0]).to.include('/api/auth/verify-email/[redacted]');
        expect(requestLog[1].metadata.url).to.equal('/api/auth/verify-email/[redacted]');
        expect(JSON.stringify(lines)).to.not.include(token);
    });

    it('leaves an ordinary path intact', async () => {
        await chai.request(server).get('/api/auth/check');
        await waitForLines(lines, 2);

        const requestLog = lines.find(([message]) => typeof message === 'string' && message.startsWith('HTTP '));

        expect(requestLog[1].metadata.url).to.equal('/api/auth/check');
    });
});

describe('redactUrl', () => {
    it('redacts the token segment of an absolute url as Sentry reports it', () => {
        expect(redactUrl('https://api.example.com/api/auth/verify-email/deadbeef'))
            .to.equal('https://api.example.com/api/auth/verify-email/[redacted]');
    });

    it('stops at the query string', () => {
        expect(redactUrl('/api/auth/verify-email/deadbeef?lang=id'))
            .to.equal('/api/auth/verify-email/[redacted]?lang=id');
    });
});
