import { describe, it, expect, vi } from 'vitest';
import { DisplayObject } from '../src/blakron/display/DisplayObject.js';
import { DisplayObjectContainer } from '../src/blakron/display/DisplayObjectContainer.js';
import { Event } from '../src/blakron/events/Event.js';

describe('DisplayObjectContainer', () => {
	it('starts with zero children', () => {
		const c = new DisplayObjectContainer();
		expect(c.numChildren).toBe(0);
	});

	it('addChild adds and sets parent', () => {
		const parent = new DisplayObjectContainer();
		const child = new DisplayObject();
		parent.addChild(child);
		expect(parent.numChildren).toBe(1);
		expect(child.parent).toBe(parent);
	});

	it('addChild removes from previous parent', () => {
		const p1 = new DisplayObjectContainer();
		const p2 = new DisplayObjectContainer();
		const child = new DisplayObject();
		p1.addChild(child);
		p2.addChild(child);
		expect(p1.numChildren).toBe(0);
		expect(p2.numChildren).toBe(1);
		expect(child.parent).toBe(p2);
	});

	it('addChildAt inserts at index', () => {
		const parent = new DisplayObjectContainer();
		const a = new DisplayObject();
		const b = new DisplayObject();
		const c = new DisplayObject();
		parent.addChild(a);
		parent.addChild(c);
		parent.addChildAt(b, 1);
		expect(parent.getChildAt(0)).toBe(a);
		expect(parent.getChildAt(1)).toBe(b);
		expect(parent.getChildAt(2)).toBe(c);
	});

	it('removeChild removes and clears parent', () => {
		const parent = new DisplayObjectContainer();
		const child = new DisplayObject();
		parent.addChild(child);
		parent.removeChild(child);
		expect(parent.numChildren).toBe(0);
		expect(child.parent).toBeUndefined();
	});

	it('removeChild returns undefined for non-child', () => {
		const parent = new DisplayObjectContainer();
		const stranger = new DisplayObject();
		expect(parent.removeChild(stranger)).toBeUndefined();
	});

	it('removeChildAt removes by index', () => {
		const parent = new DisplayObjectContainer();
		const a = new DisplayObject();
		const b = new DisplayObject();
		parent.addChild(a);
		parent.addChild(b);
		const removed = parent.removeChildAt(0);
		expect(removed).toBe(a);
		expect(parent.numChildren).toBe(1);
		expect(parent.getChildAt(0)).toBe(b);
	});

	it('removeChildren clears all', () => {
		const parent = new DisplayObjectContainer();
		parent.addChild(new DisplayObject());
		parent.addChild(new DisplayObject());
		parent.addChild(new DisplayObject());
		parent.removeChildren();
		expect(parent.numChildren).toBe(0);
	});

	it('getChildIndex returns correct index', () => {
		const parent = new DisplayObjectContainer();
		const a = new DisplayObject();
		const b = new DisplayObject();
		parent.addChild(a);
		parent.addChild(b);
		expect(parent.getChildIndex(a)).toBe(0);
		expect(parent.getChildIndex(b)).toBe(1);
	});

	it('getChildByName finds by name', () => {
		const parent = new DisplayObjectContainer();
		const child = new DisplayObject();
		child.name = 'hero';
		parent.addChild(child);
		expect(parent.getChildByName('hero')).toBe(child);
		expect(parent.getChildByName('villain')).toBeUndefined();
	});

	it('contains checks descendants', () => {
		const root = new DisplayObjectContainer();
		const mid = new DisplayObjectContainer();
		const leaf = new DisplayObject();
		root.addChild(mid);
		mid.addChild(leaf);
		expect(root.contains(leaf)).toBe(true);
		expect(root.contains(mid)).toBe(true);
		expect(root.contains(root)).toBe(true);
		expect(mid.contains(root)).toBe(false);
	});

	it('setChildIndex reorders', () => {
		const parent = new DisplayObjectContainer();
		const a = new DisplayObject();
		const b = new DisplayObject();
		const c = new DisplayObject();
		parent.addChild(a);
		parent.addChild(b);
		parent.addChild(c);
		parent.setChildIndex(a, 2);
		expect(parent.getChildAt(0)).toBe(b);
		expect(parent.getChildAt(1)).toBe(c);
		expect(parent.getChildAt(2)).toBe(a);
	});

	it('swapChildren swaps positions', () => {
		const parent = new DisplayObjectContainer();
		const a = new DisplayObject();
		const b = new DisplayObject();
		parent.addChild(a);
		parent.addChild(b);
		parent.swapChildren(a, b);
		expect(parent.getChildAt(0)).toBe(b);
		expect(parent.getChildAt(1)).toBe(a);
	});

	it('swapChildrenAt swaps by index', () => {
		const parent = new DisplayObjectContainer();
		const a = new DisplayObject();
		const b = new DisplayObject();
		parent.addChild(a);
		parent.addChild(b);
		parent.swapChildrenAt(0, 1);
		expect(parent.getChildAt(0)).toBe(b);
		expect(parent.getChildAt(1)).toBe(a);
	});

	it('addChild dispatches ADDED event', () => {
		const parent = new DisplayObjectContainer();
		const child = new DisplayObject();
		const fn = vi.fn();
		child.addEventListener(Event.ADDED, fn);
		parent.addChild(child);
		expect(fn).toHaveBeenCalledOnce();
	});

	it('removeChild dispatches REMOVED event', () => {
		const parent = new DisplayObjectContainer();
		const child = new DisplayObject();
		parent.addChild(child);
		const fn = vi.fn();
		child.addEventListener(Event.REMOVED, fn);
		parent.removeChild(child);
		expect(fn).toHaveBeenCalledOnce();
	});

	it('_onContainerStructureChange fires on add/remove', () => {
		const fn = vi.fn();
		const unsub = DisplayObjectContainer.addContainerStructureChangeListener(fn);
		const parent = new DisplayObjectContainer();
		const child = new DisplayObject();
		parent.addChild(child);
		expect(fn).toHaveBeenCalledWith(parent);
		fn.mockClear();
		parent.removeChild(child);
		expect(fn).toHaveBeenCalledWith(parent);
		unsub();
	});

	it('touchChildren getter/setter', () => {
		const c = new DisplayObjectContainer();
		expect(c.touchChildren).toBe(true);
		c.touchChildren = false;
		expect(c.touchChildren).toBe(false);
	});

	it('addChild same child twice moves to end', () => {
		const parent = new DisplayObjectContainer();
		const a = new DisplayObject();
		const b = new DisplayObject();
		parent.addChild(a);
		parent.addChild(b);
		parent.addChild(a); // move a to end
		expect(parent.numChildren).toBe(2);
		expect(parent.getChildAt(0)).toBe(b);
		expect(parent.getChildAt(1)).toBe(a);
	});
});
