import type { Graphics } from '../../display/Graphics.js';
import type { DisplayObject } from '../../display/DisplayObject.js';
import type { WebGLRenderBuffer } from '../webgl/WebGLRenderBuffer.js';
import type { Instruction } from '../InstructionSet.js';
import type { InstructionSet } from '../InstructionSet.js';
import type { RenderPipe } from '../RenderPipe.js';
import type { CanvasRenderer } from '../CanvasRenderer.js';
import { Rectangle } from '../../geom/index.js';
import { RenderBuffer } from '../RenderBuffer.js';

// Shared scratch rectangle — avoids per-execute allocation.
const _scratchBounds = new Rectangle();

// ── Instruction ───────────────────────────────────────────────────────────────

export interface GraphicsInstruction extends Instruction {
	readonly renderPipeId: 'graphics';
	renderable: DisplayObject; // Shape or Sprite
	/** The Graphics object attached to the renderable. */
	graphics: Graphics;
	offsetX: number;
	offsetY: number;
}

// ── Cache entry ───────────────────────────────────────────────────────────────

interface GraphicsCache {
	renderBuffer: RenderBuffer;
	texture: WebGLTexture | undefined;
	textureWidth: number;
	textureHeight: number;
	/** Bounds origin in local space — needed to position the texture. */
	boundsX: number;
	boundsY: number;
}

// ── Pipe ──────────────────────────────────────────────────────────────────────

/**
 * Handles WebGL rendering of Shape / Sprite graphics.
 *
 * Rasterizes the Graphics commands to an offscreen Canvas, uploads as a
 * WebGL texture, and caches it. The cache is invalidated when
 * `graphics.canvasCacheDirty` is true (set by Graphics.dirty()).
 */
export class GraphicsPipe implements RenderPipe<DisplayObject> {
	public static readonly PIPE_ID = 'graphics';

	private readonly _canvasRenderer: CanvasRenderer;
	/** WeakMap so entries are GC'd automatically when Graphics is collected. */
	private readonly _cache = new WeakMap<Graphics, GraphicsCache>();

	private static readonly _pool: GraphicsInstruction[] = [];

	public constructor(canvasRenderer: CanvasRenderer) {
		this._canvasRenderer = canvasRenderer;
	}

	private static _alloc(renderable: DisplayObject, graphics: Graphics, ox: number, oy: number): GraphicsInstruction {
		const inst = GraphicsPipe._pool.pop() ?? {
			renderPipeId: 'graphics',
			renderable,
			graphics,
			offsetX: ox,
			offsetY: oy,
		};
		inst.renderable = renderable;
		inst.graphics = graphics;
		inst.offsetX = ox;
		inst.offsetY = oy;
		return inst;
	}

	public static release(inst: GraphicsInstruction): void {
		GraphicsPipe._pool.push(inst);
	}

	// ── RenderPipe impl ───────────────────────────────────────────────────────

	public addToInstructionSet(renderable: DisplayObject, set: InstructionSet): void {
		const graphics = renderable.graphics;
		if (!graphics || graphics.commands.length === 0) return;
		set.add(GraphicsPipe._alloc(renderable, graphics, 0, 0));
	}

	public updateRenderable(_renderable: DisplayObject): void {
		// Cache invalidation is driven by graphics.canvasCacheDirty,
		// which is checked at execute time — nothing to pre-upload here.
	}

	public destroyRenderable(renderable: DisplayObject): void {
		const graphics = renderable.graphics;
		if (graphics) this._cache.delete(graphics);
	}

	// ── Execute ───────────────────────────────────────────────────────────────

	public execute(inst: GraphicsInstruction, buffer: WebGLRenderBuffer): void {
		const { graphics } = inst;
		if (graphics.commands.length === 0) return;

		const bounds = _scratchBounds;
		bounds.setEmpty();
		graphics.measureContentBounds(bounds);
		const w = Math.ceil(bounds.width);
		const h = Math.ceil(bounds.height);
		if (w <= 0 || h <= 0) return;

		const ox = inst.offsetX;
		const oy = inst.offsetY;
		buffer.offsetX = 0;
		buffer.offsetY = 0;

		// ── Cache lookup / rebuild ────────────────────────────────────────────
		let cache = this._cache.get(graphics);
		if (!cache) {
			cache = {
				renderBuffer: new RenderBuffer(w, h),
				texture: undefined,
				textureWidth: 0,
				textureHeight: 0,
				boundsX: bounds.x,
				boundsY: bounds.y,
			};
			this._cache.set(graphics, cache);
		}

		const needsRebuild = graphics.canvasCacheDirty || cache.textureWidth !== w || cache.textureHeight !== h;

		if (needsRebuild) {
			if (cache.renderBuffer.width !== w || cache.renderBuffer.height !== h) {
				cache.renderBuffer.resize(w, h);
			}
			cache.renderBuffer.clear();
			// skipCache=true: we are the cache owner, bypass CanvasRenderer's own
			// offscreen canvas layer to avoid a redundant intermediate rasterization.
			this._canvasRenderer.renderGraphicsToContext(
				graphics,
				cache.renderBuffer.context,
				-bounds.x,
				-bounds.y,
				false,
				true,
			);
			const surface = cache.renderBuffer.surface;
			if (!cache.texture) {
				cache.texture = buffer.context.createTexture(surface);
			} else {
				buffer.context.updateTexture(cache.texture, surface);
			}
			cache.textureWidth = w;
			cache.textureHeight = h;
			cache.boundsX = bounds.x;
			cache.boundsY = bounds.y;
			// Consume the dirty flag — Phase 1 set it, we've now rebuilt.
			graphics.canvasCacheDirty = false;
		}

		if (!cache.texture) return;

		// ── Draw cached texture ───────────────────────────────────────────────
		// ox/oy are already baked into globalMatrix via _applyTransform.
		// Only add bounds origin (content may start at non-zero local coords).
		buffer.saveTransform();
		if (cache.boundsX !== 0 || cache.boundsY !== 0) {
			buffer.globalMatrix.append(1, 0, 0, 1, cache.boundsX, cache.boundsY);
		}

		buffer.context.drawTexture(cache.texture, 0, 0, w, h, 0, 0, w, h, w, h);

		buffer.restoreTransform();
	}
}
