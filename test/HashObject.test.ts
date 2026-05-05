import { describe, it, expect } from 'vitest';
import { HashObject } from '../src/blakron/utils/HashObject.js';

describe('HashObject', () => {
	it('each instance gets a unique hashCode', () => {
		const a = new HashObject();
		const b = new HashObject();
		const c = new HashObject();
		expect(a.hashCode).not.toBe(b.hashCode);
		expect(b.hashCode).not.toBe(c.hashCode);
		expect(a.hashCode).not.toBe(c.hashCode);
	});

	it('hashCode is a positive integer', () => {
		const obj = new HashObject();
		expect(obj.hashCode).toBeGreaterThan(0);
		expect(Number.isInteger(obj.hashCode)).toBe(true);
	});

	it('hashCodes increment monotonically', () => {
		const a = new HashObject();
		const b = new HashObject();
		const c = new HashObject();
		expect(a.hashCode).toBeLessThan(b.hashCode);
		expect(b.hashCode).toBeLessThan(c.hashCode);
	});

	it('many instances produce unique codes', () => {
		const set = new Set<number>();
		for (let i = 0; i < 1000; i++) {
			const obj = new HashObject();
			expect(set.has(obj.hashCode)).toBe(false);
			set.add(obj.hashCode);
		}
	});
});
