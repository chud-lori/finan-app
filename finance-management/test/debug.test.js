const chai = require('chai');
const chaiHttp = require('chai-http');
const expect = chai.expect;

console.log('chai:', typeof chai);
console.log('chaiHttp:', typeof chaiHttp);
console.log('chai.request before use:', typeof chai.request);

chai.use(chaiHttp);

console.log('chai.request after use:', typeof chai.request);

describe('Debug Test', () => {
    it('should work', () => {
        console.log('chai.request in test:', typeof chai.request);
        expect(true).to.be.true;
    });
});
