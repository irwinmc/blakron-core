import { EventDispatcher } from '../events/EventDispatcher.js';
import { TimerEvent } from '../events/TimerEvent.js';
import { ticker, getTimer } from '../player/SystemTicker.js';

/**
 * Timer lets you run code on a specified time sequence.
 * Use start() to begin, and listen for TimerEvent.TIMER / TimerEvent.TIMER_COMPLETE.
 */
export class Timer extends EventDispatcher {
	public repeatCount: number;

	private _delay = 0;
	private _currentCount = 0;
	private _running = false;
	private _updateInterval = 1000;
	private _lastCount = 1000;
	private _lastTimeStamp = 0;

	public constructor(delay: number, repeatCount = 0) {
		super();
		this.delay = delay;
		this.repeatCount = repeatCount | 0;
	}

	public get delay(): number {
		return this._delay;
	}
	public set delay(value: number) {
		if (value < 1) value = 1;
		if (this._delay === value) return;
		this._delay = value;
		this._lastCount = this._updateInterval = Math.round(60 * value);
	}

	public get currentCount(): number {
		return this._currentCount;
	}

	public get running(): boolean {
		return this._running;
	}

	public reset(): void {
		this.stop();
		this._currentCount = 0;
	}

	public start(): void {
		if (this._running) return;
		this._lastCount = this._updateInterval;
		this._lastTimeStamp = getTimer();
		ticker.startTick(this._update, this);
		this._running = true;
	}

	public stop(): void {
		if (!this._running) return;
		ticker.stopTick(this._update, this);
		this._running = false;
	}

	private _update = (timeStamp: number): boolean => {
		const deltaTime = timeStamp - this._lastTimeStamp;
		if (deltaTime >= this._delay) {
			this._lastCount = this._updateInterval;
		} else {
			this._lastCount -= 1000;
			if (this._lastCount > 0) return false;
			this._lastCount += this._updateInterval;
		}
		this._lastTimeStamp = timeStamp;
		this._currentCount++;
		const complete = this.repeatCount > 0 && this._currentCount >= this.repeatCount;
		if (this.repeatCount === 0 || this._currentCount <= this.repeatCount) {
			TimerEvent.dispatchTimerEvent(this, TimerEvent.TIMER);
		}
		if (complete) {
			this.stop();
			TimerEvent.dispatchTimerEvent(this, TimerEvent.TIMER_COMPLETE);
		}
		return false;
	};
}
