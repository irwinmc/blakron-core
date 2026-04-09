import type { Bitmap } from '../../display/Bitmap.js';
import type { DisplayObject } from '../../display/DisplayObject.js';
import type { WebGLRenderBuffer } from '../webgl/WebGLRenderBuffer.js';
import type { WebGLRenderContext } from '../webgl/WebGLRenderContext.js';
import type { Instruction } from '../InstructionSet.js';
import type { InstructionSet } from '../InstructionSet.js';
import type { RenderPipe } from '../RenderPipe.js';

// ── Instruction ───────────────────────────────────────────────────────────────

export interface BitmapInstruction extends Instruction {
	readonly renderPipeId: 'bitmap';
	renderable: Bitmap;
	/** Snapshot of the buffer state at build time — updated each frame. */
	offsetX: number;
	offsetY: number;
}

// ── Pipe ──────────────────────────────────────────────────────────────────────

/**
 * Handles WebGL rendering of Bitmap display objects.
 *
 * addToInstructionSet  — called once when the scene structure changes.
 * updateRenderable     — called every frame when only data changed.
 * execute              — issues the actual WebGL draw call.
 */
export class BitmapPipe implements RenderPipe<Bitmap> {
	public static readonly PIPE_ID = 'bitmap';

	// Pool of reusable instruction objects to avoid per-frame allocation.
	private static readonly _pool: BitmapInstruction[] = [];

	private static _alloc(bitmap: Bitmap, offsetX: number, offsetY: number): BitmapInstruction {
		const inst = BitmapPipe._pool.pop() ?? {
			renderPipeId: 'bitmap',
			renderable: bitmap,
			offsetX,
			offsetY,
		};
		inst.renderable = bitmap;
		inst.offsetX = offsetX;
		inst.offsetY = offsetY;
		return inst;
	}

	public static release(inst: BitmapInstruction): void {
		BitmapPipe._pool.push(inst);
	}

	// ── RenderPipe impl ───────────────────────────────────────────────────────

	public addToInstructionSet(bitmap: Bitmap, set: InstructionSet): void {
		// offsetX/Y are patched at execute time from the buffer state;
		// store 0 as placeholder — the renderer sets them before calling execute.
		set.add(BitmapPipe._alloc(bitmap, 0, 0));
	}

	public updateRenderable(_bitmap: Bitmap): void {
		// Bitmap data is read directly from the DisplayObject at execute time,
		// so no pre-upload step is needed here.
	}

	public destroyRenderable(_bitmap: Bitmap): void {
		// BitmapData GPU textures are managed by WebGLRenderContext.getWebGLTexture()
		// and released when BitmapData itself is destroyed — nothing to do here.
	}

	// ── Execute ───────────────────────────────────────────────────────────────

	/**
	 * Issue the draw call for a BitmapInstruction.
	 * Called by WebGLRenderer._executeInstructions().
	 */
	public execute(inst: BitmapInstruction, buffer: WebGLRenderBuffer): void {
		const bitmap = inst.renderable;
		const bd = bitmap.bitmapData;
		if (!bd?.source) return;

		const destW = !isNaN(bitmap.width) ? bitmap.width : bitmap.textureWidth;
		const destH = !isNaN(bitmap.height) ? bitmap.height : bitmap.textureHeight;
		if (destW <= 0 || destH <= 0) return;

		buffer.offsetX = inst.offsetX;
		buffer.offsetY = inst.offsetY;

		buffer.context.drawImage(
			bd,
			bitmap.bitmapX,
			bitmap.bitmapY,
			bitmap.bitmapWidth,
			bitmap.bitmapHeight,
			bitmap.bitmapOffsetX,
			bitmap.bitmapOffsetY,
			destW,
			destH,
			bitmap.sourceWidth,
			bitmap.sourceHeight,
			bitmap.texture?.rotated ?? false,
			bitmap.smoothing,
		);

		buffer.offsetX = 0;
		buffer.offsetY = 0;
	}
}
