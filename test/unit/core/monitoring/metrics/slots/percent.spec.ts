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

    it('should set value from raw percentage', () => {
        slot.setFromRawPercent(50);
        expect(slot.get()).toBe(0.5);

        slot.setFromRawPercent(100);
        expect(slot.get()).toBe(1);

        slot.setFromRawPercent(0);
        expect(slot.get()).toBe(0);
    });

    it('should get raw percentage value', () => {
        slot.set(0.5);
        expect(slot.getRawPercent()).toBe(50);

        slot.set(1);
        expect(slot.getRawPercent()).toBe(100);

        slot.set(0);
        expect(slot.getRawPercent()).toBe(0);
    });

    it('should throw error for invalid raw percentage values', () => {
        expect(() => slot.setFromRawPercent(-10)).toThrow();
        expect(() => slot.setFromRawPercent(110)).toThrow();
    });
});