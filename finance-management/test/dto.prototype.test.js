const { expect } = require('chai');
const { BaseRequestDTO } = require('../dtos/base.dto');

describe('BaseRequestDTO — a JSON body cannot strip the instance', () => {
    it('keeps its methods when the body carries __proto__', () => {
        const body = JSON.parse('{"__proto__":{"injected":1},"kind":"widget"}');
        const dto = new BaseRequestDTO(body);
        expect(typeof dto.validate).to.equal('function');
        expect(dto.validate()).to.deep.equal([]);
        expect(dto.kind).to.equal('widget');
    });

    it('leaves Object.prototype alone', () => {
        new BaseRequestDTO(JSON.parse('{"__proto__":{"polluted":"yes"}}'));
        expect({}.polluted).to.equal(undefined);
    });

    it('drops constructor and prototype keys without dropping real fields', () => {
        const dto = new BaseRequestDTO(JSON.parse('{"constructor":"x","prototype":"y","amount":500}'));
        expect(dto.amount).to.equal(500);
        expect(dto.constructor).to.equal(BaseRequestDTO);
    });

    it('survives a null or undefined body', () => {
        expect(typeof new BaseRequestDTO(null).validate).to.equal('function');
        expect(typeof new BaseRequestDTO(undefined).validate).to.equal('function');
    });
});
