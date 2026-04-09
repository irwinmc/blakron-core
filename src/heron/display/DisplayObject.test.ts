import { describe, it, expect, vi } from 'vitest';
import { DisplayObject, RenderMode, RenderObjectType } from './DisplayObject.js';
import { Rectangle } from '../geom/Rectangle.js';
import { BlurFilter } from '../filters/BlurFilter.js';

describe('DisplayObject', () => {
	it('default property values', () => {
		const obj = new DisplayObject();
		expect(obj.x).toBe(0);
		expect(obj.y).toBe(0);
		expect(obj.scaleX).toBe(1);
		expect(obj.scaleY).toBe(1);
		expect(obj.rotation).toBe(0);
		expect(obj.alpha).toBe(1);
		expect(obj.visible).toBe(true);
		expect(obj.parent).toBeUndefined();
		expect(obj.stage).toBeUndefined();
		expect(obj.renderObjectType).toBe(RenderObjectType.NONE);
	});

	it('x/y setter triggers renderDirty', () => {
		const obj = new DisplayObject();
		obj.renderDirty = false;
		obj.x = 10;
		expect(obj.x).toBe(10);
		expect(obj.renderDirty).toBe(true);
	});

	it('x setter no-op for same value', () => {
		const obj = new DisplayObject();
		obj.x = 5;
		obj.renderDirty = false;
		obj.x = 5;
		expect(obj.renderDirty).toBe(false);
	});

	it('scaleX/Y setter updates useTranslate', () => {
		const obj = new DisplayObject();
		expect(obj.useTranslate).toBe(false);
		obj.scaleX = 2;
		expect(obj.useTranslate).toBe(true);
		obj.scaleX = 1;
		expect(obj.useTranslate).toBe(false);
	});

	it('rotation setter updates matrix dirty', () => {
		const obj = new DisplayObject();
		obj.rotation = 45;
		expect(obj.rotation).toBe(45);
		expect(obj.useTranslate).toBe(true);
	});

	it('alpha setter triggers markDirty', () => {
		const obj = new DisplayObject();
		obj.renderDirty = false;
		obj.alpha = 0.5;
		expect(obj.alpha).toBe(0.5);
		expect(obj.renderDirty).toBe(true);
	});

	it('visible=false sets renderMode NONE', () => {
		const obj = new DisplayObject();
		obj.visible = false;
		expect(obj.renderMode).toBe(RenderMode.NONE);
	});

	it('filters sets renderMode FILTER', () => {
		const obj = new DisplayObject();
		obj.visible = true;
		obj.filters = [new BlurFilter(4, 4)];
		expect(obj.renderMode).toBe(RenderMode.FILTER);
	});

	it('filters empty restores renderMode', () => {
		const obj = new DisplayObject();
		obj.filters = [new BlurFilter()];
		expect(obj.renderMode).toBe(RenderMode.FILTER);
		obj.filters = [];
		expect(obj.renderMode).toBeUndefined();
	});

	it('mask with Rectangle sets SCROLLRECT mode', () => {
		const obj = new DisplayObject();
		obj.mask = new Rectangle(0, 0, 100, 100);
		expect(obj.renderMode).toBe(RenderMode.SCROLLRECT);
	});

	it('mask with DisplayObject sets CLIP mode', () => {
		const obj = new DisplayObject();
		const maskObj = new DisplayObject();
		// Need to simulate maskObj being on stage for CLIP mode
		maskObj.internalStage = {} as any;
		obj.mask = maskObj;
		expect(obj.renderMode).toBe(RenderMode.CLIP);
	});

	it('mask=undefined clears mask', () => {
		const obj = new DisplayObject();
		obj.mask = new Rectangle(0, 0, 100, 100);
		obj.mask = undefined;
		expect(obj.internalMaskRect).toBeUndefined();
		expect(obj.renderMode).toBeUndefined();
	});

	it('name getter/setter', () => {
		const obj = new DisplayObject();
		obj.name = 'test';
		expect(obj.name).toBe('test');
	});

	it('tint setter updates tintRGB', () => {
		const obj = new DisplayObject();
		obj.tint = 0xff0000;
		expect(obj.tint).toBe(0xff0000);
		// tintRGB is byte-swapped: R and B swapped for GPU
		expect(obj.tintRGB).toBe((0xff0000 >> 16) + (0xff0000 & 0xff00) + ((0xff0000 & 0xff) << 16));
	});

	it('blendMode getter/setter', () => {
		const obj = new DisplayObject();
		obj.blendMode = 'source-over';
		expect(obj.blendMode).toBe('source-over');
	});

	it('getMatrix returns correct matrix for translation', () => {
		const obj = new DisplayObject();
		obj.x = 10;
		obj.y = 20;
		const m = obj.getMatrix();
		expect(m.tx).toBe(10);
		expect(m.ty).toBe(20);
	});

	it('worldAlpha is computed in markDirty', () => {
		const obj = new DisplayObject();
		obj.alpha = 0.5;
		expect(obj.worldAlpha).toBeCloseTo(0.5, 10);
	});

	it('_onRenderableDirty callback is called', () => {
		const fn = vi.fn();
		const unsub = DisplayObject.addRenderableDirtyListener(fn);
		const obj = new DisplayObject();
		obj.x = 99;
		expect(fn).toHaveBeenCalledWith(obj);
		unsub();
	});

	it('_onStructureChange callback is called on renderMode change', () => {
		const fn = vi.fn();
		const unsub = DisplayObject.addStructureChangeListener(fn);
		const obj = new DisplayObject();
		obj.visible = false; // triggers updateRenderMode → _onStructureChange
		expect(fn).toHaveBeenCalled();
		unsub();
	});

	it('anchorOffsetX/Y', () => {
		const obj = new DisplayObject();
		obj.anchorOffsetX = 10;
		obj.anchorOffsetY = 20;
		expect(obj.anchorOffsetX).toBe(10);
		expect(obj.anchorOffsetY).toBe(20);
	});

	it('scrollRect', () => {
		const obj = new DisplayObject();
		const rect = new Rectangle(10, 20, 100, 200);
		obj.scrollRect = rect;
		expect(obj.scrollRect).toBeDefined();
		expect(obj.scrollRect!.x).toBe(10);
		expect(obj.renderMode).toBe(RenderMode.SCROLLRECT);
	});

	it('touchEnabled', () => {
		const obj = new DisplayObject();
		obj.touchEnabled = true;
		expect(obj.touchEnabled).toBe(true);
		obj.touchEnabled = false;
		expect(obj.touchEnabled).toBe(false);
	});

	it('zIndex setter', () => {
		const obj = new DisplayObject();
		obj.zIndex = 5;
		expect(obj.zIndex).toBe(5);
	});
});
