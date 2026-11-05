const { expect } = require('chai');

// The limiter is a no-op under NODE_ENV=test, so build the middleware under a
// production env and restore it immediately.
const buildAsProd = (make) => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try { return make(require('../middleware/rateLimit')); }
    finally { process.env.NODE_ENV = prev; }
};

const run = (mw, userId) => {
    let status = 200;
    const res = { status(c) { status = c; return this; }, json() { return this; } };
    mw({ user: { id: userId }, ip: '203.0.113.1' }, res, () => {});
    return status;
};

describe('Rate limiter buckets', () => {
    it('does not let a busy endpoint spend another endpoint\'s budget', () => {
        const browse = buildAsProd(l => l.byUser(60));
        const exportCsv = buildAsProd(l => l.byUser(10));

        for (let i = 0; i < 30; i++) expect(run(browse, 'u1')).to.equal(200);

        expect(run(exportCsv, 'u1')).to.equal(200);
    });

    it('still limits an endpoint on its own count', () => {
        const exportCsv = buildAsProd(l => l.byUser(10));

        for (let i = 0; i < 10; i++) expect(run(exportCsv, 'u2')).to.equal(200);

        expect(run(exportCsv, 'u2')).to.equal(429);
    });

    it('keeps one user out of another user\'s bucket', () => {
        const exportCsv = buildAsProd(l => l.byUser(10));

        for (let i = 0; i < 11; i++) run(exportCsv, 'u3');

        expect(run(exportCsv, 'u4')).to.equal(200);
    });
});
