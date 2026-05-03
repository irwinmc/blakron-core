import { Rectangle } from '../geom/Rectangle.js';
import { DisplayObjectContainer } from './DisplayObjectContainer.js';
import { DisplayObject, RenderObjectType } from './DisplayObject.js';
import { Graphics } from './Graphics.js';

export class Sprite extends DisplayObjectContainer {
	// ── Instance fields ───────────────────────────────────────────────────────

	protected override _graphics: Graphics;

	// ── Constructor ───────────────────────────────────────────────────────────

	public constructor() {
		super();
		this.renderObjectType = RenderObjectType.SPRITE;
		this._graphics = new Graphics();
		this._graphics.targetDisplay = this;
	}

	// ── Getters ───────────────────────────────────────────────────────────────

	public override get graphics(): Graphics {
		return this._graphics;
	}

	// ── Internal methods ──────────────────────────────────────────────────────

	override measureContentBounds(bounds: Rectangle): void {
		this.graphics.measureContentBounds(bounds);
	}

	override hitTest(stageX: number, stageY: number): DisplayObject | undefined {
		const target = super.hitTest(stageX, stageY);
		const isDebug = this.constructor?.name === 'CheckBox' || this.constructor?.name === 'RadioButton' || this.constructor?.name === 'Button';
		if (isDebug) {
			console.log(`[hitTest:Sprite] ${this.constructor?.name} super.hitTest → ${target?.constructor?.name ?? 'undefined'} (=== this: ${target === this}) graphics.commands=${this.graphics.commands.length}`);
		}
		if (target !== this) return target;
		if (this.graphics.commands.length === 0) {
			if (isDebug) console.log(`  → no commands, returning this`);
			return this;
		}
		const m = this.getInvertedConcatenatedMatrix();
		const localX = m.a * stageX + m.c * stageY + m.tx;
		const localY = m.b * stageX + m.d * stageY + m.ty;
		const pixelResult = this.graphics.hitTest(localX, localY);
		if (isDebug) console.log(`  → pixel hitTest(${localX.toFixed(1)}, ${localY.toFixed(1)}) = ${pixelResult}`);
		return pixelResult ? this : undefined;
	}

	override onRemoveFromStage(): void {
		super.onRemoveFromStage();
		this.graphics.onRemoveFromStage();
	}
}
