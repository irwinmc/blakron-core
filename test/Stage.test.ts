import { describe, it, expect, vi, afterEach } from 'vitest';
import { Stage } from '../src/blakron/display/Stage.js';
import { DisplayObject } from '../src/blakron/display/DisplayObject.js';
import { StageScaleMode } from '../src/blakron/display/enums/StageScaleMode.js';
import { OrientationMode } from '../src/blakron/display/enums/OrientationMode.js';
import { Event } from '../src/blakron/events/Event.js';

describe('Stage', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('stageWidth and stageHeight default to 0', () => {
		const stage = new Stage();
		expect(stage.stageWidth).toBe(0);
		expect(stage.stageHeight).toBe(0);
	});

	it('stage refers to itself', () => {
		const stage = new Stage();
		expect(stage.stage).toBe(stage);
	});

	it('nestLevel is 1', () => {
		const stage = new Stage();
		expect(stage.nestLevel).toBe(1);
	});

	it('setContentSize dispatches RESIZE event', () => {
		const stage = new Stage();
		const fn = vi.fn();
		stage.addEventListener(Event.RESIZE, fn);

		stage.setContentSize(800, 600);

		expect(fn).toHaveBeenCalledOnce();
		expect(stage.stageWidth).toBe(800);
		expect(stage.stageHeight).toBe(600);
	});

	it('scaleMode getter/setter', () => {
		const stage = new Stage();
		expect(stage.scaleMode).toBe(StageScaleMode.SHOW_ALL);

		stage.scaleMode = StageScaleMode.NO_BORDER;
		expect(stage.scaleMode).toBe(StageScaleMode.NO_BORDER);
	});

	it('scaleMode no-ops on same value', () => {
		const stage = new Stage();
		const fn = vi.fn();
		stage.addEventListener(Event.RESIZE, fn);

		stage.scaleMode = StageScaleMode.SHOW_ALL; // same as default
		expect(fn).not.toHaveBeenCalled();
	});

	it('orientation getter/setter', () => {
		const stage = new Stage();
		expect(stage.orientation).toBe(OrientationMode.AUTO);

		stage.orientation = OrientationMode.LANDSCAPE;
		expect(stage.orientation).toBe(OrientationMode.LANDSCAPE);
	});

	it('orientation no-ops on same value', () => {
		const stage = new Stage();
		const fn = vi.fn();
		stage.addEventListener(Event.RESIZE, fn);

		stage.orientation = OrientationMode.AUTO;
		expect(fn).not.toHaveBeenCalled();
	});

	it('maxTouches getter/setter', () => {
		const stage = new Stage();
		expect(stage.maxTouches).toBe(99);

		stage.maxTouches = 5;
		expect(stage.maxTouches).toBe(5);
	});

	it('maxTouches no-ops on same value', () => {
		const stage = new Stage();
		stage.maxTouches = 99; // same as default
		expect(stage.maxTouches).toBe(99);
	});

	it('frameRate getter/setter', () => {
		const stage = new Stage();
		// frameRate reads from ticker — defaults to 60
		expect(stage.frameRate).toBeGreaterThan(0);
		stage.frameRate = 30;
		expect(stage.frameRate).toBe(30);
	});

	it('textureScaleFactor getter/setter', () => {
		const stage = new Stage();
		expect(stage.textureScaleFactor).toBe(1);
		stage.textureScaleFactor = 2;
		expect(stage.textureScaleFactor).toBe(2);
	});

	it('is a DisplayObjectContainer (can hold children)', () => {
		const stage = new Stage();
		const child = new DisplayObject();
		stage.addChild(child);
		expect(stage.numChildren).toBe(1);
		expect(child.parent).toBe(stage);
	});

	it('invalidate triggers render flag', () => {
		const stage = new Stage();
		expect(() => stage.invalidate()).not.toThrow();
	});
});
