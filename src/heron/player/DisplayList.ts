import { BitmapData } from '../display/texture/BitmapData.js';
import { RenderBuffer } from './RenderBuffer.js';
import type { DisplayObject } from '../display/DisplayObject.js';

/**
 * DisplayList provides per-object offscreen caching for DisplayObjects with
 * cacheAsBitmap = true. When the object is not dirty, the cached canvas is
 * reused directly, avoiding re-traversal of the subtree.
 *
 * Equivalent to Egret's sys.DisplayList (non-stage variant).
 */
export class DisplayList {
	public readonly root: DisplayObject;

	public offsetX = 0;
	public offsetY = 0;

	/** The offscreen render buffer for this cached object. */
	public renderBuffer: RenderBuffer;

	/** The BitmapData wrapping the offscreen canvas, used by the renderer. */
	public bitmapData: BitmapData | undefined = undefined;

	private static _pool: DisplayList[] = [];

	public static create(target: DisplayObject): DisplayList | undefined {
		try {
			const dl = DisplayList._pool.pop() ?? new DisplayList(target);
			dl._reset(target);
			return dl;
		} catch {
			return undefined;
		}
	}

	public static release(dl: DisplayList): void {
		dl.renderBuffer.resize(0, 0);
		dl.bitmapData = undefined;
		if (DisplayList._pool.length < 8) DisplayList._pool.push(dl);
	}

	private constructor(root: DisplayObject) {
		this.root = root;
		this.renderBuffer = new RenderBuffer();
	}

	private _reset(root: (typeof this)['root']): void {
		(this as { root: DisplayObject }).root = root;
		this.offsetX = 0;
		this.offsetY = 0;
	}

	/**
	 * Resizes the offscreen buffer to fit the root object's bounds.
	 * Returns false if the object has zero size.
	 */
	public updateSurfaceSize(): boolean {
		const bounds = this.root.getOriginalBounds();
		const w = Math.max(1, Math.ceil(bounds.width));
		const h = Math.max(1, Math.ceil(bounds.height));
		this.offsetX = -bounds.x;
		this.offsetY = -bounds.y;

		if (this.renderBuffer.width !== w || this.renderBuffer.height !== h) {
			this.renderBuffer.resize(w, h);
		}
		return w > 0 && h > 0;
	}

	/**
	 * Updates the BitmapData reference after rendering into the buffer.
	 */
	public updateBitmapData(): void {
		const surface = this.renderBuffer.surface;
		if (!this.bitmapData) {
			this.bitmapData = new BitmapData(surface);
			this.bitmapData.deleteSource = false;
		} else {
			this.bitmapData.source = surface;
			this.bitmapData.width = surface.width;
			this.bitmapData.height = surface.height;
		}
	}
}
