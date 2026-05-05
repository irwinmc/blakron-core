import { describe, it, expect } from 'vitest';
import { CustomFilter } from '../src/blakron/filters/CustomFilter.js';

describe('CustomFilter', () => {
	it('type is custom', () => {
		const f = new CustomFilter('void main() {}', 'void main() {}');
		expect(f.type).toBe('custom');
	});

	it('stores vertex and fragment source', () => {
		const f = new CustomFilter('vertex code', 'fragment code');
		expect(f.vertexSrc).toBe('vertex code');
		expect(f.fragmentSrc).toBe('fragment code');
	});

	it('generates a shaderKey', () => {
		const f = new CustomFilter('v', 'f');
		expect(f.shaderKey).toBeDefined();
		expect(typeof f.shaderKey).toBe('string');
		expect(f.shaderKey.length).toBeGreaterThan(0);
	});

	it('same vertex+fragment gets same shaderKey', () => {
		const f1 = new CustomFilter('a', 'b');
		const f2 = new CustomFilter('a', 'b');
		expect(f1.shaderKey).toBe(f2.shaderKey);
	});

	it('different vertex+fragment gets different shaderKey', () => {
		const f1 = new CustomFilter('a', 'b');
		const f2 = new CustomFilter('c', 'd');
		expect(f1.shaderKey).not.toBe(f2.shaderKey);
	});

	it('default padding is 0', () => {
		const f = new CustomFilter('v', 'f');
		expect(f.padding).toBe(0);
	});

	it('padding setter updates all edges', () => {
		const f = new CustomFilter('v', 'f');
		f.padding = 5;
		expect(f.padding).toBe(5);
		const p = f.getPadding();
		expect(p.left).toBe(5);
		expect(p.right).toBe(5);
		expect(p.top).toBe(5);
		expect(p.bottom).toBe(5);
	});

	it('padding setter no-ops on same value', () => {
		const f = new CustomFilter('v', 'f');
		f.padding = 8;
		f.padding = 8;
		expect(f.padding).toBe(8);
	});

	it('accepts custom uniforms', () => {
		const f = new CustomFilter('v', 'f', { myUniform: 42, another: 'test' });
		expect(f.uniforms).toEqual({ myUniform: 42, another: 'test' });
	});

	it('uniforms default to empty object', () => {
		const f = new CustomFilter('v', 'f');
		expect(f.uniforms).toEqual({});
	});
});
