import { PercentSlot } from '@core/monitoring/metrics/slots/percent';

describe('PercentSlot', () => {
    let slot: PercentSlot;

    beforeEach(() => {
        slot = new PercentSlot();
    });

    it('should accept valid percentage values', () => {
        expect(() => slot.set(0)).not.toThrow();
        expect(() => slot.set(0.5)).not.toThrow();
        expect(() => slot.set(1)).not.toThrow();
    });

    it('should throw error for invalid percentage values', () => {
        expect(() => slot.set(-0.1)).toThrow('Percentage value must be between 0 and 1');
        expect(() => slot.set(1.1)).toThrow('Percentage value must be between 0 and 1');
    });

    it('should store and retrieve percentage values correctly', () => {
        slot.set(0.5);
        expect(slot.value).toBe(0.5);

        slot.set(1);
        expect(slot.value).toBe(1);

        slot.set(0);
        expect(slot.value).toBe(0);
    });
});