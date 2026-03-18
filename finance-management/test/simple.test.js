const chai = require('chai');
const chaiHttp = require('chai-http');
const { expect } = require('chai');
const server = require('../app');

chai.use(chaiHttp);

describe('Simple Test', () => {
    it('should return welcome message', async () => {
        const res = await chai.request(server)
            .get('/');

        expect(res).to.have.status(200);
        expect(res.body).to.equal('HEHHHH');
    });
});
