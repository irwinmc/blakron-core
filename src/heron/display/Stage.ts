import { Event } from '../events/Event.js';
import { DisplayObjectContainer } from './DisplayObjectContainer.js';
import { OrientationMode } from './OrientationMode.js';
import { StageScaleMode } from './StageScaleMode.js';

export class Stage extends DisplayObjectContainer {
	// ── Instance fields ───────────────────────────────────────────────────────

	private _stageWidth = 0;
	private _stageHeight = 0;
	private _scaleMode: StageScaleMode = StageScaleMode.SHOW_ALL;
	private _orientation: OrientationMode = OrientationMode.AUTO;
	private _maxTouches = 99;
	private _textureScaleFactor = 1;

	// frameRate is managed by the player/ticker layer
	// TODO: connect to ticker when player layer is implemented
	private _frameRate = 30;

	// ── Constructor ───────────────────────────────────────────────────────────

	public constructor() {
		super();
		this.internalStage = this;
		this.nestLevel = 1;
	}

	// ── Getters / Setters ─────────────────────────────────────────────────────

	public get stageWidth(): number {
		return this._stageWidth;
	}
	public get stageHeight(): number {
		return this._stageHeight;
	}

	public get frameRate(): number {
		return this._frameRate;
	}
	public set frameRate(value: number) {
		// TODO: delegate to ticker when player layer is implemented
		this._frameRate = value;
	}

	public get scaleMode(): StageScaleMode {
		return this._scaleMode;
	}
	public set scaleMode(value: StageScaleMode) {
		if (this._scaleMode === value) return;
		this._scaleMode = value;
		this.onScreenSizeChanged();
	}

	public get orientation(): OrientationMode {
		return this._orientation;
	}
	public set orientation(value: OrientationMode) {
		if (this._orientation === value) return;
		this._orientation = value;
		this.onScreenSizeChanged();
	}

	public get maxTouches(): number {
		return this._maxTouches;
	}
	public set maxTouches(value: number) {
		if (this._maxTouches === value) return;
		this._maxTouches = value;
		this.onMaxTouchesChanged();
	}

	public get textureScaleFactor(): number {
		return this._textureScaleFactor;
	}
	public set textureScaleFactor(value: number) {
		this._textureScaleFactor = value;
	}

	// ── Public methods ────────────────────────────────────────────────────────

	/**
	 * Marks the display list as needing a re-render.
	 * Triggers Event.RENDER to be dispatched on the next frame.
	 */
	public invalidate(): void {
		// TODO: set sys.$invalidateRenderFlag when player layer is implemented
	}

	/**
	 * Sets the logical content size of the stage.
	 * Called by the player/screen adapter when the viewport changes.
	 */
	public setContentSize(width: number, height: number): void {
		this.onScreenSizeChanged();
		this.resize(width, height);
	}

	// ── Internal methods (called by player/renderer) ──────────────────────────

	/**
	 * Called by the renderer when the canvas/viewport is resized.
	 */
	resize(width: number, height: number): void {
		this._stageWidth = width;
		this._stageHeight = height;
		this.dispatchEventWith(Event.RESIZE);
	}

	// ── Protected hooks (override in platform adapters) ───────────────────────

	protected onScreenSizeChanged(): void {
		// TODO: notify screen adapter when player layer is implemented
	}

	protected onMaxTouchesChanged(): void {
		// TODO: notify input system when player layer is implemented
	}
}
