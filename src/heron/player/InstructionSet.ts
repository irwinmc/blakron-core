import type { DisplayObject } from '../display/DisplayObject.js';

/**
 * A single renderable instruction in the instruction set.
 * Each instruction captures everything needed to execute one draw operation
 * without re-reading the scene graph.
 *
 * Inspired by Pixi.js 8's Instruction / InstructionSet pattern.
 */
export interface Instruction {
	/** Identifies which pipe should execute this instruction. */
	readonly renderPipeId: string;
	/**
	 * The display object this instruction was built from.
	 * Used by updateRenderable() to patch GPU data without rebuilding the set.
	 */
	renderable: DisplayObject;
}

/**
 * An ordered list of render instructions for one frame.
 *
 * Key design points (from Pixi.js 8):
 * - `instructions` array never shrinks — reuse slots across frames.
 * - `instructionSize` is the true length; slots beyond it are stale.
 * - `structureDirty` signals that the scene graph changed and the set must
 *   be fully rebuilt before the next render.
 * - `dirtyRenderables` holds objects whose GPU data changed but whose
 *   position in the instruction list is still valid — only those need
 *   updateRenderable(), not a full rebuild.
 */
export class InstructionSet {
	/** Flat array of instructions. May contain stale entries past instructionSize. */
	public readonly instructions: Instruction[] = [];

	/** True length of the instructions array. */
	public instructionSize = 0;

	/**
	 * When true the renderer must call buildInstructions() before executing.
	 * Set to true whenever the scene structure changes (add/remove child,
	 * visibility toggle, filter added, etc.).
	 */
	public structureDirty = true;

	/**
	 * Objects whose visual data changed this frame but whose instruction-set
	 * position is still valid. The renderer calls pipe.updateRenderable() for
	 * each entry instead of rebuilding the whole set.
	 */
	public readonly dirtyRenderables: DisplayObject[] = [];
	public dirtyRenderableCount = 0;

	/**
	 * Maps a DisplayObject to its leaf instruction index so that
	 * _updateDirtyRenderables can patch the transform snapshot in O(1).
	 * Only populated for leaf instructions (bitmap / mesh / graphics).
	 */
	public readonly renderableIndex: Map<DisplayObject, number> = new Map<DisplayObject, number>();

	/** Reset the instruction list (does not shrink the backing array). */
	public reset(): void {
		this.instructionSize = 0;
		this.dirtyRenderableCount = 0;
		this.renderableIndex.clear();
	}

	/** Append an instruction. */
	public add(instruction: Instruction): void {
		this.instructions[this.instructionSize++] = instruction;
	}

	/**
	 * Append a leaf instruction and register it in the renderable index
	 * so transform snapshots can be patched without a full rebuild.
	 */
	public addLeaf(instruction: Instruction): void {
		this.renderableIndex.set(instruction.renderable, this.instructionSize);
		this.instructions[this.instructionSize++] = instruction;
	}

	/** Mark a renderable as needing a data update this frame. */
	public markRenderableDirty(obj: DisplayObject): void {
		this.dirtyRenderables[this.dirtyRenderableCount++] = obj;
	}
}
