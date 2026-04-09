import { describe, it, expect } from 'vitest';
import { BlurFilter } from './BlurFilter.js';
import { ColorMatrixFilter } from './ColorMatrixFilter.js';
import { GlowFilter } from './GlowFilter.js';
import { DropShadowFilter } from './DropShadowFilter.js';

describe('BlurFilter', () => {
	it('default values', () => {
		const f = new BlurFilter();
		expect(f.blurX).toBe(4);
		expect(f.blurY).toBe(4);
		expect(f.quality).toBe(1);
		expect(f.type).toBe('blur');
	});

	it('constructor params', () => {
		const f = new BlurFilter(8, 12, 2);
		expect(f.blurX).toBe(8);
		expect(f.blurY).toBe(12);
		expect(f.quality).toBe(2);
	});

	it('setter updates uniforms', () => {
		const f = new BlurFilter();
		f.blurX = 10;
		expect(f.blurX).toBe(10);
		expect((f.uniforms as Record<string, number>).blurX).toBe(10);
	});

	it('padding matches blur values', () => {
		const f = new BlurFilter(5, 10);
		expect(f['paddingLeft']).toBe(5);
		expect(f['paddingTop']).toBe(10);
	});
});

describe('ColorMatrixFilter', () => {
	it('default is identity matrix', () => {
		const f = new ColorMatrixFilter();
		const m = f.matrix;
		expect(m[0]).toBe(1);
		expect(m[6]).toBe(1);
		expect(m[12]).toBe(1);
		expect(m[18]).toBe(1);
		expect(m[1]).toBe(0);
	});

	it('matrix getter returns copy', () => {
		const f = new ColorMatrixFilter();
		const m1 = f.matrix;
		m1[0] = 999;
		expect(f.matrix[0]).toBe(1); // internal not affected
	});

	it('matrix setter updates internal', () => {
		const custom = new Array(20).fill(0);
		custom[0] = 0.5;
		const f = new ColorMatrixFilter(custom);
		expect(f.matrix[0]).toBe(0.5);
	});

	it('type is colorTransform', () => {
		expect(new ColorMatrixFilter().type).toBe('colorTransform');
	});
});

describe('GlowFilter', () => {
	it('default values', () => {
		const f = new GlowFilter();
		expect(f.color).toBe(0xff0000);
		expect(f.alpha).toBe(1);
		expect(f.blurX).toBe(6);
		expect(f.blurY).toBe(6);
		expect(f.strength).toBe(2);
		expect(f.inner).toBe(false);
		expect(f.knockout).toBe(false);
		expect(f.type).toBe('glow');
	});

	it('constructor params', () => {
		const f = new GlowFilter(0x00ff00, 0.5, 10, 12, 3, 1, true, true);
		expect(f.color).toBe(0x00ff00);
		expect(f.alpha).toBe(0.5);
		expect(f.blurX).toBe(10);
		expect(f.blurY).toBe(12);
		expect(f.strength).toBe(3);
		expect(f.inner).toBe(true);
		expect(f.knockout).toBe(true);
	});

	it('color setter updates RGB uniforms', () => {
		const f = new GlowFilter();
		f.color = 0x0000ff;
		expect(f.color).toBe(0x0000ff);
		const c = (f.uniforms as Record<string, { x: number; y: number; z: number }>).color;
		expect(c.x).toBeCloseTo(0, 5);
		expect(c.y).toBeCloseTo(0, 5);
		expect(c.z).toBeCloseTo(1, 5);
	});

	it('padding matches blur values', () => {
		const f = new GlowFilter(0, 1, 8, 12);
		expect(f['paddingLeft']).toBe(8);
		expect(f['paddingTop']).toBe(12);
	});
});

describe('DropShadowFilter', () => {
	it('default values', () => {
		const f = new DropShadowFilter();
		expect(f.distance).toBe(4);
		expect(f.angle).toBe(45);
		expect(f.color).toBe(0);
		expect(f.alpha).toBe(1);
		expect(f.blurX).toBe(4);
		expect(f.blurY).toBe(4);
		expect(f.hideObject).toBe(false);
	});

	it('constructor params', () => {
		const f = new DropShadowFilter(10, 90, 0xff0000, 0.8, 6, 6, 2, 1, false, false, true);
		expect(f.distance).toBe(10);
		expect(f.angle).toBe(90);
		expect(f.color).toBe(0xff0000);
		expect(f.hideObject).toBe(true);
	});

	it('distance setter updates uniform', () => {
		const f = new DropShadowFilter();
		f.distance = 20;
		expect(f.distance).toBe(20);
		expect((f.uniforms as Record<string, number>).dist).toBe(20);
	});

	it('angle setter converts to radians in uniform', () => {
		const f = new DropShadowFilter();
		f.angle = 180;
		expect((f.uniforms as Record<string, number>).angle).toBeCloseTo(Math.PI, 10);
	});

	it('extends GlowFilter', () => {
		const f = new DropShadowFilter();
		expect(f).toBeInstanceOf(GlowFilter);
	});
});
