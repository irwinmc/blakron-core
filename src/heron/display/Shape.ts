import { Rectangle } from '../geom/Rectangle.js';
import { DisplayObject } from './DisplayObject.js';
import { Graphics } from './Graphics.js';
import type { Stage } from './Stage.js';

export class Shape extends DisplayObject {
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

	override hitTest(stageX: number, stageY: number): DisplayObject | undefined {
		const target = super.hitTest(stageX, stageY);
		if (target !== this) return target;
		// Pixel-perfect: transform stage coords to local space and test against graphics
		const m = this.getInvertedConcatenatedMatrix();
		const localX = m.a * stageX + m.c * stageY + m.tx;
		const localY = m.b * stageX + m.d * stageY + m.ty;
		return this._graphics.hitTest(localX, localY) ? this : undefined;
	}

	override onRemoveFromStage(): void {
		super.onRemoveFromStage();
		this._graphics.onRemoveFromStage();
	}
}
