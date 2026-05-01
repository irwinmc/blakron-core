import { describe, it, expect } from 'vitest';
import { Point } from './Point.js';

describe('Point', () => {
	it('defaults to (0, 0)', () => {
		const p = new Point();
		expect(p.x).toBe(0);
		expect(p.y).toBe(0);
	});

	it('constructor accepts x, y', () => {
		const p = new Point(3, 4);
		expect(p.x).toBe(3);
		expect(p.y).toBe(4);
	});

	it('setTo updates x and y', () => {
		const p = new Point();
		p.setTo(5, 6);
		expect(p.x).toBe(5);
		expect(p.y).toBe(6);
	});

	it('clone returns a new equal instance', () => {
		const p = new Point(1, 2);
		const c = p.clone();
		expect(c).not.toBe(p);
		expect(c.equals(p)).toBe(true);
	});

	it('copyFrom copies values', () => {
		const a = new Point(10, 20);
		const b = new Point();
		b.copyFrom(a);
		expect(b.x).toBe(10);
		expect(b.y).toBe(20);
		a.x = 99;
		expect(b.x).toBe(10); // independent
	});

	it('equals compares values', () => {
		expect(new Point(1, 2).equals(new Point(1, 2))).toBe(true);
		expect(new Point(1, 2).equals(new Point(1, 3))).toBe(false);
	});

	it('length is Euclidean distance from origin', () => {
		expect(new Point(3, 4).length).toBe(5);
		expect(new Point(0, 0).length).toBe(0);
	});

	it('normalize scales to given thickness', () => {
		const p = new Point(3, 4);
		p.normalize(10);
		expect(p.length).toBeCloseTo(10, 10);
	});

	it('normalize on zero point does nothing', () => {
		const p = new Point(0, 0);
		p.normalize(5);
		expect(p.x).toBe(0);
		expect(p.y).toBe(0);
	});

	it('offset adds dx, dy', () => {
		const p = new Point(1, 2);
		p.offset(10, 20);
		expect(p.x).toBe(11);
		expect(p.y).toBe(22);
	});

	it('add returns new point', () => {
		const r = new Point(1, 2).add(new Point(3, 4));
		expect(r.x).toBe(4);
		expect(r.y).toBe(6);
	});

	it('subtract returns new point', () => {
		const r = new Point(5, 7).subtract(new Point(2, 3));
		expect(r.x).toBe(3);
		expect(r.y).toBe(4);
	});

	it('static distance', () => {
		expect(Point.distance(new Point(0, 0), new Point(3, 4))).toBe(5);
	});

	it('static interpolate', () => {
		const p = Point.interpolate(new Point(0, 0), new Point(10, 10), 0.5);
		expect(p.x).toBe(5);
		expect(p.y).toBe(5);
	});

	it('static polar (angle in degrees)', () => {
		const p = Point.polar(1, 0);
		expect(p.x).toBeCloseTo(1, 5);
		expect(p.y).toBeCloseTo(0, 5);

		const p90 = Point.polar(1, 90);
		expect(p90.x).toBeCloseTo(0, 5);
		expect(p90.y).toBeCloseTo(1, 5);
	});

	it('object pool create/release', () => {
		const p = Point.create(7, 8);
		expect(p.x).toBe(7);
		Point.release(p);
		const p2 = Point.create(0, 0);
		expect(p2).toBe(p); // reused
	});
});
