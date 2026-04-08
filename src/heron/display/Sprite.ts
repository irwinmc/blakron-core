import { Rectangle } from '../geom/Rectangle.js';
import { DisplayObjectContainer } from './DisplayObjectContainer.js';
import { Graphics } from './Graphics.js';

export class Sprite extends DisplayObjectContainer {
	// ── Instance fields ───────────────────────────────────────────────────────

	private _graphics: Graphics;

	// ── Constructor ───────────────────────────────────────────────────────────

	public constructor() {
		super();
		this._graphics = new Graphics();
		this._graphics.targetDisplay = this;
	}

	// ── Getters ───────────────────────────────────────────────────────────────

	public get graphics(): Graphics {
		return this._graphics;
	}

	// ── Internal methods ──────────────────────────────────────────────────────

	override measureContentBounds(bounds: Rectangle): void {
		this._graphics.measureContentBounds(bounds);
	}

	override onRemoveFromStage(): void {
		super.onRemoveFromStage();
		this._graphics.onRemoveFromStage();
	}
}
