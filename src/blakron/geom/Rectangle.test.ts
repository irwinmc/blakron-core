import { describe, it, expect } from 'vitest';
import { Rectangle } from './Rectangle.js';
import { Point } from './Point.js';

describe('Rectangle', () => {
	it('defaults to (0,0,0,0)', () => {
		const r = new Rectangle();
		expect(r.x).toBe(0);
		expect(r.y).toBe(0);
		expect(r.width).toBe(0);
		expect(r.height).toBe(0);
	});

	it('constructor accepts x, y, w, h', () => {
		const r = new Rectangle(1, 2, 3, 4);
		expect(r.x).toBe(1);
		expect(r.y).toBe(2);
		expect(r.width).toBe(3);
		expect(r.height).toBe(4);
	});

	it('setTo updates all fields', () => {
		const r = new Rectangle();
		r.setTo(10, 20, 30, 40);
		expect(r.x).toBe(10);
		expect(r.width).toBe(30);
	});

	it('copyFrom deep copies', () => {
		const a = new Rectangle(1, 2, 3, 4);
		const b = new Rectangle();
		b.copyFrom(a);
		expect(b.equals(a)).toBe(true);
		a.x = 99;
		expect(b.x).toBe(1);
	});

	it('clone returns new equal instance', () => {
		const r = new Rectangle(1, 2, 3, 4);
		const c = r.clone();
		expect(c).not.toBe(r);
		expect(c.equals(r)).toBe(true);
	});

	it('right/bottom getters', () => {
		const r = new Rectangle(10, 20, 30, 40);
		expect(r.right).toBe(40);
		expect(r.bottom).toBe(60);
	});

	it('right/bottom setters', () => {
		const r = new Rectangle(10, 20, 30, 40);
		r.right = 50;
		expect(r.width).toBe(40);
		r.bottom = 100;
		expect(r.height).toBe(80);
	});

	it('topLeft/bottomRight getters', () => {
		const r = new Rectangle(1, 2, 3, 4);
		const tl = r.topLeft;
		expect(tl.x).toBe(1);
		expect(tl.y).toBe(2);
		const br = r.bottomRight;
		expect(br.x).toBe(4);
		expect(br.y).toBe(6);
	});

	it('contains point inside', () => {
		const r = new Rectangle(0, 0, 100, 100);
		expect(r.contains(50, 50)).toBe(true);
	});

	it('contains point on edge', () => {
		const r = new Rectangle(0, 0, 100, 100);
		expect(r.contains(0, 0)).toBe(true);
		expect(r.contains(100, 100)).toBe(true);
	});

	it('does not contain point outside', () => {
		const r = new Rectangle(0, 0, 100, 100);
		expect(r.contains(-1, 50)).toBe(false);
		expect(r.contains(101, 50)).toBe(false);
	});

	it('containsPoint delegates to contains', () => {
		const r = new Rectangle(0, 0, 10, 10);
		expect(r.containsPoint(new Point(5, 5))).toBe(true);
		expect(r.containsPoint(new Point(11, 5))).toBe(false);
	});

	it('containsRect fully contained', () => {
		const outer = new Rectangle(0, 0, 100, 100);
		const inner = new Rectangle(10, 10, 20, 20);
		expect(outer.containsRect(inner)).toBe(true);
	});

	it('containsRect partial overlap returns false', () => {
		const a = new Rectangle(0, 0, 50, 50);
		const b = new Rectangle(25, 25, 50, 50);
		expect(a.containsRect(b)).toBe(false);
	});

	it('intersects detects overlap', () => {
		const a = new Rectangle(0, 0, 50, 50);
		const b = new Rectangle(25, 25, 50, 50);
		expect(a.intersects(b)).toBe(true);
	});

	it('intersects returns false for non-overlapping', () => {
		const a = new Rectangle(0, 0, 10, 10);
		const b = new Rectangle(20, 20, 10, 10);
		expect(a.intersects(b)).toBe(false);
	});

	it('intersection returns overlap rect', () => {
		const a = new Rectangle(0, 0, 50, 50);
		const b = new Rectangle(25, 25, 50, 50);
		const i = a.intersection(b);
		expect(i.x).toBe(25);
		expect(i.y).toBe(25);
		expect(i.width).toBe(25);
		expect(i.height).toBe(25);
	});

	it('intersection returns empty for non-overlapping', () => {
		const a = new Rectangle(0, 0, 10, 10);
		const b = new Rectangle(20, 20, 10, 10);
		const i = a.intersection(b);
		expect(i.isEmpty()).toBe(true);
	});

	it('union merges two rects', () => {
		const a = new Rectangle(0, 0, 10, 10);
		const b = new Rectangle(5, 5, 10, 10);
		const u = a.union(b);
		expect(u.x).toBe(0);
		expect(u.y).toBe(0);
		expect(u.width).toBe(15);
		expect(u.height).toBe(15);
	});

	it('inflate expands symmetrically', () => {
		const r = new Rectangle(10, 10, 20, 20);
		r.inflate(5, 5);
		expect(r.x).toBe(5);
		expect(r.y).toBe(5);
		expect(r.width).toBe(30);
		expect(r.height).toBe(30);
	});

	it('isEmpty for zero/negative dimensions', () => {
		expect(new Rectangle(0, 0, 0, 10).isEmpty()).toBe(true);
		expect(new Rectangle(0, 0, 10, -1).isEmpty()).toBe(true);
		expect(new Rectangle(0, 0, 10, 10).isEmpty()).toBe(false);
	});

	it('setEmpty resets to (0,0,0,0)', () => {
		const r = new Rectangle(1, 2, 3, 4);
		r.setEmpty();
		expect(r.x).toBe(0);
		expect(r.width).toBe(0);
	});

	it('equals compares values', () => {
		const a = new Rectangle(1, 2, 3, 4);
		const b = new Rectangle(1, 2, 3, 4);
		expect(a.equals(b)).toBe(true);
		b.x = 99;
		expect(a.equals(b)).toBe(false);
	});

	it('equals same reference', () => {
		const a = new Rectangle(1, 2, 3, 4);
		expect(a.equals(a)).toBe(true);
	});

	it('offset shifts position', () => {
		const r = new Rectangle(10, 20, 30, 40);
		r.offset(5, 10);
		expect(r.x).toBe(15);
		expect(r.y).toBe(30);
		expect(r.width).toBe(30); // unchanged
	});

	it('object pool create/release', () => {
		const r = Rectangle.create();
		Rectangle.release(r);
		const r2 = Rectangle.create();
		expect(r2).toBe(r);
	});
});
