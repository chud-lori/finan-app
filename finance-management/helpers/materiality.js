const MATERIALITY_FRACTION = 0.02;

const magnitude = (n) => Math.abs(Number(n) || 0);

const materialityFloor = (...bases) => Math.max(0, ...bases.map(magnitude)) * MATERIALITY_FRACTION;

const isMaterial = (amount, floor) => {
    const size = magnitude(amount);
    return size > 0 && size >= magnitude(floor);
};

module.exports = { MATERIALITY_FRACTION, materialityFloor, isMaterial };
