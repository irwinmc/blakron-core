import { describe, it, expect } from 'vitest';
import { TouchEvent } from '../src/blakron/events/TouchEvent.js';
import { Event } from '../src/blakron/events/Event.js';
import { EventDispatcher } from '../src/blakron/events/EventDispatcher.js';

describe('TouchEvent', () => {
	it('has correct static constants', () => {
		expect(TouchEvent.TOUCH_MOVE).toBe('touchMove');
		expect(TouchEvent.TOUCH_BEGIN).toBe('touchBegin');
		expect(TouchEvent.TOUCH_END).toBe('touchEnd');
		expect(TouchEvent.TOUCH_TAP).toBe('touchTap');
		expect(TouchEvent.TOUCH_RELEASE_OUTSIDE).toBe('touchReleaseOutside');
	});

	it('constructor stores stageX/stageY/touchPointID', () => {
		const e = new TouchEvent('touchBegin', true, false, 100, 200, 5);
		expect(e.type).toBe('touchBegin');
		expect(e.bubbles).toBe(true);
		expect(e.stageX).toBe(100);
		expect(e.stageY).toBe(200);
		expect(e.touchPointID).toBe(5);
		expect(e.touchDown).toBe(false);
	});

	it('constructor defaults stageX/stageY to 0', () => {
		const e = new TouchEvent('tap');
		expect(e.stageX).toBe(0);
		expect(e.stageY).toBe(0);
	});

	it('initTo resets stageX/stageY/touchPointID', () => {
		const e = new TouchEvent('touchMove');
		e.initTo(300, 400, 7);
		expect(e.stageX).toBe(300);
		expect(e.stageY).toBe(400);
		expect(e.touchPointID).toBe(7);
	});

	it('localX/localY fall back to stageX/stageY when target lacks getInvertedConcatenatedMatrix', () => {
		const e = new TouchEvent('touchMove', false, false, 100, 200);
		// Dispatch to an EventDispatcher (no getInvertedConcatenatedMatrix)
		const d = new EventDispatcher();
		d.dispatchEvent(e);

		// Since EventDispatcher doesn't have getInvertedConcatenatedMatrix,
		// localX/Y should equal stageX/Y
		expect(e.localX).toBe(100);
		expect(e.localY).toBe(200);
	});

	it('setDispatchContext marks targetChanged for lazy recompute', () => {
		const e = new TouchEvent('touchMove', false, false, 100, 200);
		const d = new EventDispatcher();
		e.setDispatchContext(d, 2);
		// localX access should not throw
		expect(e.localX).toBe(100);
	});

	it('dispatchTouchEvent dispatches event with correct properties', () => {
		const d = new EventDispatcher();
		let receivedStageX = 0;
		let receivedTouchID = 0;

		d.addEventListener('touchBegin', (ev: Event) => {
			const te = ev as TouchEvent;
			receivedStageX = te.stageX;
			receivedTouchID = te.touchPointID;
		});

		TouchEvent.dispatchTouchEvent(d, 'touchBegin', false, false, 200, 300, 42);
		expect(receivedStageX).toBe(200);
		expect(receivedTouchID).toBe(42);
	});

	it('dispatchTouchEvent short-circuits when no listeners and non-bubbling', () => {
		const d = new EventDispatcher();
		expect(TouchEvent.dispatchTouchEvent(d, 'nonexistent', false)).toBe(true);
	});

	it('dispatchTouchEvent sets touchDown', () => {
		const d = new EventDispatcher();
		let down = false;
		d.addEventListener('touchBegin', (ev: Event) => {
			down = (ev as TouchEvent).touchDown;
		});
		TouchEvent.dispatchTouchEvent(d, 'touchBegin', false, false, 0, 0, 0, true);
		expect(down).toBe(true);
	});

	it('extends Event and works with object pool', () => {
		const e1 = Event.create(TouchEvent, 'tap', true, false);
		expect(e1).toBeInstanceOf(TouchEvent);
		expect(e1.type).toBe('tap');
		expect(e1.bubbles).toBe(true);

		Event.release(e1);
		const e2 = Event.create(TouchEvent, 'move', false);
		expect(e2).toBe(e1);
		expect(e2.type).toBe('move');
	});

	it('updateAfterEvent does not throw', () => {
		expect(() => new TouchEvent('touchMove').updateAfterEvent()).not.toThrow();
	});
});
