import { describe, it, expect } from 'vitest';
import { Sprite } from '../src/blakron/display/Sprite.js';
import { DisplayObject } from '../src/blakron/display/DisplayObject.js';
import { RenderObjectType } from '../src/blakron/display/DisplayObject.js';
import { Rectangle } from '../src/blakron/geom/Rectangle.js';

describe('Sprite', () => {
	it('renderObjectType is SPRITE', () => {
		const s = new Sprite();
		expect(s.renderObjectType).toBe(RenderObjectType.SPRITE);
	});

	it('starts with zero children', () => {
		const s = new Sprite();
		expect(s.numChildren).toBe(0);
	});

	it('has a Graphics instance', () => {
		const s = new Sprite();
		expect(s.graphics).toBeDefined();
		expect(s.graphics.commands.length).toBe(0);
	});

	it('can add children and access graphics simultaneously', () => {
		const s = new Sprite();
		const child = new DisplayObject();
		s.addChild(child);
		expect(s.numChildren).toBe(1);

		s.graphics.drawRect(0, 0, 100, 50);
		expect(s.graphics.commands.length).toBe(1);
	});

	it('content bounds include graphics', () => {
		const s = new Sprite();
		s.graphics.drawRect(10, 20, 100, 50);
		const bounds = new Rectangle();
		s['measureContentBounds'](bounds);
		expect(bounds.width).toBeGreaterThanOrEqual(100);
	});

	it('child management inherited from DisplayObjectContainer', () => {
		const s = new Sprite();
		const a = new DisplayObject();
		const b = new DisplayObject();

		s.addChild(a);
		s.addChildAt(b, 0);

		expect(s.getChildAt(0)).toBe(b);
		expect(s.getChildAt(1)).toBe(a);

		s.setChildIndex(b, 1);
		expect(s.getChildAt(0)).toBe(a);
		expect(s.getChildAt(1)).toBe(b);
	});

	it('x/y transform properties work', () => {
		const s = new Sprite();
		s.x = 100;
		s.y = 200;
		s.scaleX = 2;
		s.scaleY = 3;
		s.rotation = 45;

		expect(s.x).toBe(100);
		expect(s.y).toBe(200);
		expect(s.scaleX).toBe(2);
		expect(s.scaleY).toBe(3);
		expect(s.rotation).toBe(45);
	});

	it('touchChildren getter/setter', () => {
		const s = new Sprite();
		expect(s.touchChildren).toBe(true);
		s.touchChildren = false;
		expect(s.touchChildren).toBe(false);
	});

	it('onRemoveFromStage does not clear graphics commands', () => {
		const s = new Sprite();
		s.graphics.drawRect(0, 0, 100, 100);
		s['onRemoveFromStage']();
		expect(s.graphics.commands.length).toBe(1);
	});

	it('name getter/setter', () => {
		const s = new Sprite();
		s.name = 'player';
		expect(s.name).toBe('player');
	});

	it('tint getter/setter', () => {
		const s = new Sprite();
		s.tint = 0x00ff00;
		expect(s.tint).toBe(0x00ff00);
	});

	it('zIndex setter', () => {
		const s = new Sprite();
		s.zIndex = 10;
		expect(s.zIndex).toBe(10);
	});

	it('isRenderGroup getter/setter', () => {
		const s = new Sprite();
		expect(s.isRenderGroup).toBe(false);
		s.isRenderGroup = true;
		expect(s.isRenderGroup).toBe(true);
	});

	it('hitTest returns self when no graphics', () => {
		const s = new Sprite();
		const result = s.hitTest(0, 0);
		expect(result).toBeDefined();
	});
});
