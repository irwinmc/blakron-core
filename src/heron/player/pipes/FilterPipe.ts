import type { DisplayObject } from '../../display/DisplayObject.js';
import type { Filter } from '../../filters/index.js';
import type { WebGLRenderBuffer } from '../webgl/WebGLRenderBuffer.js';
import type { Instruction } from '../InstructionSet.js';
import type { InstructionSet } from '../InstructionSet.js';
import type { RenderPipe } from '../RenderPipe.js';
import { ColorMatrixFilter } from '../../filters/index.js';
import { WebGLRenderBuffer as WGLBuf } from '../webgl/WebGLRenderBuffer.js';

// ── Instructions ──────────────────────────────────────────────────────────────

/** Marks the start of a filtered subtree. */
export interface FilterPushInstruction extends Instruction {
	readonly renderPipeId: 'filterPush';
	renderable: DisplayObject;
	filters: Filter[];
	offsetX: number;
	offsetY: number;
}

/** Marks the end of a filtered subtree — composites the offscreen result. */
export interface FilterPopInstruction extends Instruction {
	readonly renderPipeId: 'filterPop';
	renderable: DisplayObject;
	/** Back-reference to the matching push instruction. */
	push: FilterPushInstruction;
}

// ── Pipe ──────────────────────────────────────────────────────────────────────

const BLEND_MODES: Record<number, string> = {
	0: 'source-over',
	1: 'lighter',
	2: 'destination-out',
};

/**
 * Handles filter rendering for WebGL.
 *
 * The renderer calls pushFilter() before traversing the filtered subtree and
 * popFilter() after. The pop instruction composites the offscreen buffer back
 * onto the main buffer with the filter applied.
 *
 * This mirrors the old WebGLRenderer._drawWithFilter() logic but expressed as
 * a pair of instructions so the traversal and execution phases are separated.
 */
export class FilterPipe implements RenderPipe<DisplayObject> {
	public static readonly PUSH_ID = 'filterPush';
	public static readonly POP_ID = 'filterPop';

	// ── RenderPipe impl ───────────────────────────────────────────────────────

	public addToInstructionSet(_renderable: DisplayObject, _set: InstructionSet): void {
		// FilterPipe instructions are added by the renderer's traversal logic,
		// not by this method — see WebGLRenderer._buildInstructions().
	}

	public updateRenderable(_renderable: DisplayObject): void {}

	// ── Factory helpers used by the renderer ─────────────────────────────────

	public static makePush(
		renderable: DisplayObject,
		filters: Filter[],
		offsetX: number,
		offsetY: number,
	): FilterPushInstruction {
		return { renderPipeId: 'filterPush', renderable, filters, offsetX, offsetY };
	}

	public static makePop(renderable: DisplayObject, push: FilterPushInstruction): FilterPopInstruction {
		return { renderPipeId: 'filterPop', renderable, push };
	}

	// ── Execute ───────────────────────────────────────────────────────────────

	/**
	 * Called by the renderer when it encounters a filterPush instruction.
	 *
	 * Two paths:
	 * - ColorMatrix inline: sets activeFilter on the main buffer, returns null.
	 *   Subsequent leaf instructions draw directly to the main buffer with the
	 *   filter applied per-draw-call.
	 * - All other filters: allocates an offscreen buffer and activates it via
	 *   pushBuffer so that ALL subsequent draw calls (until filterPop) land in
	 *   the offscreen buffer, not the main buffer.
	 *
	 * Returns the offscreen buffer (or null for inline path).
	 */
	public executePush(inst: FilterPushInstruction, buffer: WebGLRenderBuffer): WebGLRenderBuffer | null {
		const filters = inst.filters;
		if (!filters.length) return null;

		const bounds = inst.renderable.getOriginalBounds();
		if (bounds.width <= 0 || bounds.height <= 0) return null;

		// Inline ColorMatrix optimisation: no offscreen buffer needed.
		if (!inst.renderable.internalMask && filters.length === 1 && filters[0] instanceof ColorMatrixFilter) {
			const hasBlend = inst.renderable.internalBlendMode !== 0;
			if (hasBlend) {
				buffer.context.setGlobalCompositeOperation(
					BLEND_MODES[inst.renderable.internalBlendMode] ?? 'source-over',
				);
			}
			buffer.context.activeFilter = filters[0];
			return null; // signal: inline mode, no offscreen
		}

		// Offscreen path: redirect all subsequent draw calls into this buffer.
		const offscreen = WGLBuf.create(buffer.context, bounds.width, bounds.height);
		// pushBuffer activates the offscreen FBO so WebGL draws land there.
		offscreen.context.pushBuffer(offscreen);
		return offscreen;
	}

	/**
	 * Called by the renderer when it encounters a filterPop instruction.
	 * Deactivates the offscreen buffer and composites it back onto the main buffer.
	 */
	public executePop(
		inst: FilterPopInstruction,
		buffer: WebGLRenderBuffer,
		offscreen: WebGLRenderBuffer | null,
	): void {
		const { renderable, push } = inst;
		const filters = push.filters;
		const hasBlend = renderable.internalBlendMode !== 0;
		const blendOp = BLEND_MODES[renderable.internalBlendMode] ?? 'source-over';

		// Inline ColorMatrix path — just clear the filter flag.
		if (!offscreen) {
			buffer.context.activeFilter = undefined;
			if (hasBlend) buffer.context.setGlobalCompositeOperation('source-over');
			return;
		}

		// Deactivate the offscreen buffer, restoring the main buffer as active.
		offscreen.context.popBuffer();

		const bounds = renderable.getOriginalBounds();
		const bx = bounds.x;
		const by = bounds.y;

		if (hasBlend) buffer.context.setGlobalCompositeOperation(blendOp);

		buffer.offsetX = push.offsetX + bx;
		buffer.offsetY = push.offsetY + by;
		buffer.saveTransform();
		buffer.useOffset();
		buffer.context.compositeFilterResult(filters, offscreen);
		buffer.restoreTransform();

		if (hasBlend) buffer.context.setGlobalCompositeOperation('source-over');

		WGLBuf.release(offscreen);
	}
}
