import { Rectangle } from '../../geom/Rectangle.js';
import { BitmapData } from './BitmapData.js';
import { Texture, textureScaleFactor } from './Texture.js';
import type { DisplayObject } from '../DisplayObject.js';

/**
 * RenderTexture is a dynamic texture that renders a DisplayObject tree into a texture.
 * The actual rendering is delegated to the renderer layer via the `renderer` callback.
 * Set `RenderTexture.renderer` before calling `drawToTexture()`.
 */
export class RenderTexture extends Texture {
	// ── Static fields ─────────────────────────────────────────────────────────

	/**
	 * Renderer integration point.
	 * The renderer layer should set this to a function that draws a DisplayObject
	 * into an offscreen canvas and returns it.
	 * TODO: replace with proper IRenderer interface when renderer layer is implemented.
	 */
	public static renderer:
		| ((
				displayObject: DisplayObject,
				width: number,
				height: number,
				offsetX: number,
				offsetY: number,
		  ) => HTMLCanvasElement)
		| undefined = undefined;

	// ── Instance fields ───────────────────────────────────────────────────────

	/** @internal The offscreen canvas used as the render target. */
	private _canvas: HTMLCanvasElement | undefined = undefined;

	// ── Constructor ───────────────────────────────────────────────────────────

	public constructor() {
		super();
	}

	// ── Public methods ────────────────────────────────────────────────────────

	/**
	 * Draws the specified display object into this texture.
	 * Requires `RenderTexture.renderer` to be set by the renderer layer.
	 * @param displayObject The display object to draw.
	 * @param clipBounds Optional clip rectangle.
	 * @param scale Scale factor.
	 * @returns true if drawing succeeded.
	 */
	public drawToTexture(displayObject: DisplayObject, clipBounds?: Rectangle, scale = 1): boolean {
		if (clipBounds && (clipBounds.width === 0 || clipBounds.height === 0)) return false;

		const bounds = clipBounds ?? displayObject.getOriginalBounds();
		if (bounds.width === 0 || bounds.height === 0) return false;

		const s = scale / textureScaleFactor;
		const width = clipBounds ? bounds.width * s : (bounds.x + bounds.width) * s;
		const height = clipBounds ? bounds.height * s : (bounds.y + bounds.height) * s;
		const offsetX = clipBounds ? -clipBounds.x : 0;
		const offsetY = clipBounds ? -clipBounds.y : 0;

		if (!RenderTexture.renderer) {
			// TODO: implement when renderer layer is available
			return false;
		}

		this._canvas = RenderTexture.renderer(displayObject, width, height, offsetX * s, offsetY * s);
		const bitmapData = new BitmapData(this._canvas);
		bitmapData.deleteSource = false;
		bitmapData.width = width;
		bitmapData.height = height;
		this.setBitmapData(bitmapData);
		this.initData(0, 0, width, height, 0, 0, width, height, width, height);
		return true;
	}

	public override getPixel32(x: number, y: number): number[] {
		if (!this._canvas) return [];
		const scale = textureScaleFactor;
		const ctx = this._canvas.getContext('2d');
		if (!ctx) return [];
		const data = ctx.getImageData(Math.round(x / scale), Math.round(y / scale), 1, 1).data;
		return [data[0], data[1], data[2], data[3]];
	}

	public override dispose(): void {
		super.dispose();
		this._canvas = undefined;
	}
}
