import { describe, it, expect } from 'vitest';
import { BlendMode, blendModeToNumber, numberToBlendMode } from '../src/blakron/display/enums/BlendMode.js';

describe('BlendMode', () => {
	it('NORMAL is source-over', () => {
		expect(BlendMode.NORMAL).toBe('source-over');
	});

	it('ADD is lighter', () => {
		expect(BlendMode.ADD).toBe('lighter');
	});

	it('ERASE is destination-out', () => {
		expect(BlendMode.ERASE).toBe('destination-out');
	});

	it('has all expected blend modes', () => {
		expect(BlendMode.MULTIPLY).toBe('multiply');
		expect(BlendMode.SCREEN).toBe('screen');
		expect(BlendMode.OVERLAY).toBe('overlay');
		expect(BlendMode.DARKEN).toBe('darken');
		expect(BlendMode.LIGHTEN).toBe('lighten');
	});

	it('blendModeToNumber returns sequential indices', () => {
		const a = blendModeToNumber(BlendMode.NORMAL);
		const b = blendModeToNumber(BlendMode.ADD);
		expect(a).toBeGreaterThanOrEqual(0);
		expect(b).toBeGreaterThan(a);
	});

	it('blendModeToNumber for unknown string returns 0', () => {
		expect(blendModeToNumber('nonexistent')).toBe(0);
		expect(blendModeToNumber('')).toBe(0);
	});

	it('numberToBlendMode round-trips for all modes', () => {
		for (const mode of Object.values(BlendMode)) {
			const num = blendModeToNumber(mode);
			expect(numberToBlendMode(num)).toBe(mode);
		}
	});

	it('numberToBlendMode for out-of-range returns source-over', () => {
		expect(numberToBlendMode(-1)).toBe('source-over');
		expect(numberToBlendMode(999)).toBe('source-over');
	});
});
