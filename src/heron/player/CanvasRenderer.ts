import {
	DisplayObject,
	RenderMode,
	Bitmap,
	Shape,
	Sprite,
	Mesh,
	Graphics,
	PathCommandType,
	type GraphicsCommand,
	setGraphicsHitTest,
} from '../display/index.js';
import { Matrix } from '../geom/index.js';
import { RenderBuffer, hitTestBuffer } from './RenderBuffer.js';
import { DisplayList } from './DisplayList.js';
import { BlurFilter, ColorMatrixFilter, GlowFilter, DropShadowFilter } from '../filters/index.js';

const CAPS_MAP: Record<string, CanvasLineCap> = { none: 'butt', square: 'square', round: 'round' };

/**
 * Canvas 2D renderer. Traverses the DisplayObject tree and draws each node
 * using the Canvas 2D API. Equivalent to Egret's `CanvasRenderer`.
 *
 * Performance notes:
 * - Currently does full-tree traversal and full-canvas redraw every frame.
 *   Egret used a DisplayList with dirty-region tracking to only redraw changed areas.
 *   This should be added when performance becomes a concern.
 * - Egret used a RenderNode intermediate layer (BitmapNode, GraphicsNode, etc.)
 *   to cache rendering instructions. Heron reads DisplayObject data directly,
 *   which is simpler but skips the caching benefit. If profiling shows the JS-side
 *   traversal is a bottleneck, consider adding a lightweight render command cache.
 * - For high-performance scenarios, a WebGL renderer with batch rendering should
 *   be implemented as an alternative backend.
 */
export class CanvasRenderer {
	// ── Public methods ────────────────────────────────────────────────────────

	/**
	 * Renders a display object tree into the given buffer.
	 */
	public render(displayObject: DisplayObject, buffer: RenderBuffer, matrix?: Matrix): number {
		const ctx = buffer.context;
		if (matrix) {
			ctx.save();
			ctx.transform(matrix.a, matrix.b, matrix.c, matrix.d, matrix.tx, matrix.ty);
		}
		const drawCalls = this.drawDisplayObject(displayObject, ctx, 0, 0, true);
		if (matrix) ctx.restore();
		return drawCalls;
	}

	/** @internal Used by WebGLRenderer for offscreen DisplayList rendering. */
	public renderToContext(
		displayObject: DisplayObject,
		ctx: CanvasRenderingContext2D,
		offsetX: number,
		offsetY: number,
	): void {
		this.drawDisplayObject(displayObject, ctx, offsetX, offsetY, true);
	}

	/** @internal Used by WebGLRenderer to rasterize a Graphics object into a Canvas 2D context. */
	public renderGraphicsToContext(
		graphics: Graphics,
		ctx: CanvasRenderingContext2D,
		offsetX: number,
		offsetY: number,
		forHitTest = false,
	): void {
		this.renderGraphics(graphics, ctx, offsetX, offsetY, forHitTest);
	}
	// ── Private: tree traversal ───────────────────────────────────────────────

	private drawDisplayObject(
		displayObject: DisplayObject,
		ctx: CanvasRenderingContext2D,
		offsetX: number,
		offsetY: number,
		_isStage = false,
	): number {
		let drawCalls = 0;

		// DisplayList cache (cacheAsBitmap)
		const displayList = displayObject.displayList;
		if (displayList && !_isStage) {
			if (displayObject.cacheDirty || displayObject.renderDirty) {
				if (displayList.updateSurfaceSize()) {
					displayList.renderBuffer.clear();
					this.drawDisplayObject(
						displayObject,
						displayList.renderBuffer.context,
						displayList.offsetX,
						displayList.offsetY,
						true,
					);
					displayList.updateBitmapData();
				}
				displayObject.cacheDirty = false;
				displayObject.renderDirty = false;
			}
			// Draw cached result and skip children
			if (displayList.bitmapData?.source) {
				ctx.drawImage(
					displayList.bitmapData.source as CanvasImageSource,
					offsetX - displayList.offsetX,
					offsetY - displayList.offsetY,
				);
				drawCalls++;
			}
			return drawCalls;
		}

		// Draw self
		drawCalls += this.renderSelf(displayObject, ctx, offsetX, offsetY);

		// Draw children
		const children = displayObject.children;
		if (!children) return drawCalls;

		for (let i = 0; i < children.length; i++) {
			const child = children[i];
			if (child.renderMode === RenderMode.NONE) continue;

			let childOffsetX: number;
			let childOffsetY: number;

			if (child.useTranslate) {
				const m = child.getMatrix();
				childOffsetX = offsetX + child.internalX;
				childOffsetY = offsetY + child.internalY;
				ctx.save();
				ctx.transform(m.a, m.b, m.c, m.d, childOffsetX, childOffsetY);
				childOffsetX = -child.internalAnchorOffsetX;
				childOffsetY = -child.internalAnchorOffsetY;
			} else {
				childOffsetX = offsetX + child.internalX - child.internalAnchorOffsetX;
				childOffsetY = offsetY + child.internalY - child.internalAnchorOffsetY;
			}

			let prevAlpha: number | undefined;
			if (child.internalAlpha !== 1) {
				prevAlpha = ctx.globalAlpha;
				ctx.globalAlpha *= child.internalAlpha;
			}

			if (child.renderMode === RenderMode.FILTER) {
				drawCalls += this.drawWithFilter(child, ctx, childOffsetX, childOffsetY);
			} else if (child.renderMode === RenderMode.SCROLLRECT) {
				drawCalls += this.drawWithScrollRect(child, ctx, childOffsetX, childOffsetY);
			} else if (child.renderMode === RenderMode.CLIP) {
				drawCalls += this.drawWithClip(child, ctx, childOffsetX, childOffsetY);
			} else {
				drawCalls += this.drawDisplayObject(child, ctx, childOffsetX, childOffsetY);
			}

			if (child.useTranslate) {
				ctx.restore();
			} else if (prevAlpha !== undefined) {
				ctx.globalAlpha = prevAlpha;
			}
		}

		return drawCalls;
	}

	private drawWithScrollRect(
		displayObject: DisplayObject,
		ctx: CanvasRenderingContext2D,
		offsetX: number,
		offsetY: number,
	): number {
		const rect = displayObject.internalScrollRect ?? displayObject.internalMaskRect;
		if (!rect || rect.isEmpty()) return 0;
		if (displayObject.internalScrollRect) {
			offsetX -= rect.x;
			offsetY -= rect.y;
		}
		ctx.save();
		ctx.beginPath();
		ctx.rect(rect.x + offsetX, rect.y + offsetY, rect.width, rect.height);
		ctx.clip();
		const drawCalls = this.drawDisplayObject(displayObject, ctx, offsetX, offsetY);
		ctx.restore();
		return drawCalls;
	}

	private drawWithFilter(
		displayObject: DisplayObject,
		ctx: CanvasRenderingContext2D,
		offsetX: number,
		offsetY: number,
	): number {
		const filters = displayObject.internalFilters;
		if (!filters.length) return this.drawDisplayObject(displayObject, ctx, offsetX, offsetY);

		const bounds = displayObject.getOriginalBounds();
		if (bounds.width <= 0 || bounds.height <= 0) return 0;

		// Draw the object into an offscreen buffer
		const bufferW = Math.ceil(bounds.width);
		const bufferH = Math.ceil(bounds.height);
		const offscreen = new RenderBuffer(bufferW, bufferH);
		const offCtx = offscreen.context;

		let drawCalls = 0;
		if (displayObject.internalMask) {
			drawCalls += this.drawWithClip(displayObject, offCtx, -bounds.x, -bounds.y);
		} else if (displayObject.internalScrollRect || displayObject.internalMaskRect) {
			drawCalls += this.drawWithScrollRect(displayObject, offCtx, -bounds.x, -bounds.y);
		} else {
			drawCalls += this.drawDisplayObject(displayObject, offCtx, -bounds.x, -bounds.y);
		}

		if (drawCalls === 0) return 0;

		// Apply filters via pixel manipulation
		const imageData = offCtx.getImageData(0, 0, offscreen.width, offscreen.height);
		const data = imageData.data;
		const w = offscreen.width;
		const h = offscreen.height;

		for (const filter of filters) {
			if (filter instanceof ColorMatrixFilter) {
				applyColorMatrix(data, w, h, filter.matrix);
			} else if (filter instanceof BlurFilter) {
				applyBlur(data, w, h, filter.blurX, filter.blurY);
			} else if (filter instanceof DropShadowFilter) {
				applyDropShadow(data, w, h, filter);
			} else if (filter instanceof GlowFilter) {
				applyGlow(data, w, h, filter);
			}
			// CustomFilter not supported in Canvas 2D
		}

		offCtx.putImageData(imageData, 0, 0);

		// Blend mode
		const hasBlendMode = displayObject.internalBlendMode !== 0;
		if (hasBlendMode) ctx.globalCompositeOperation = displayObject.blendMode as GlobalCompositeOperation;

		ctx.drawImage(offscreen.surface, offsetX + bounds.x, offsetY + bounds.y);

		if (hasBlendMode) ctx.globalCompositeOperation = 'source-over';

		offscreen.destroy();
		return drawCalls + 1;
	}

	private drawWithClip(
		displayObject: DisplayObject,
		ctx: CanvasRenderingContext2D,
		offsetX: number,
		offsetY: number,
	): number {
		const scrollRect = displayObject.internalScrollRect ?? displayObject.internalMaskRect;
		const hasBlendMode = displayObject.internalBlendMode !== 0;

		if (hasBlendMode) {
			ctx.globalCompositeOperation = displayObject.blendMode as GlobalCompositeOperation;
		}

		if (scrollRect) {
			ctx.save();
			ctx.beginPath();
			ctx.rect(scrollRect.x + offsetX, scrollRect.y + offsetY, scrollRect.width, scrollRect.height);
			ctx.clip();
		}

		const drawCalls = this.drawDisplayObject(displayObject, ctx, offsetX, offsetY);

		if (scrollRect) ctx.restore();
		if (hasBlendMode) ctx.globalCompositeOperation = 'source-over';

		return drawCalls;
	}

	// ── Private: render individual node types ─────────────────────────────────

	private renderSelf(
		displayObject: DisplayObject,
		ctx: CanvasRenderingContext2D,
		offsetX: number,
		offsetY: number,
	): number {
		if (displayObject instanceof Bitmap) {
			return this.renderBitmap(displayObject, ctx, offsetX, offsetY);
		}
		if (displayObject instanceof Shape) {
			return this.renderGraphics(displayObject.graphics, ctx, offsetX, offsetY);
		}
		if (displayObject instanceof Sprite) {
			return this.renderGraphics(displayObject.graphics, ctx, offsetX, offsetY);
		}
		if (displayObject instanceof Mesh) {
			return this.renderMesh(displayObject, ctx, offsetX, offsetY);
		}
		return 0;
	}

	private renderBitmap(bitmap: Bitmap, ctx: CanvasRenderingContext2D, offsetX: number, offsetY: number): number {
		const bd = bitmap.bitmapData;
		if (!bd?.source) return 0;

		const destW = !isNaN(bitmap.width) ? bitmap.width : bitmap.textureWidth;
		const destH = !isNaN(bitmap.height) ? bitmap.height : bitmap.textureHeight;
		if (destW <= 0 || destH <= 0) return 0;

		ctx.imageSmoothingEnabled = bitmap.smoothing;
		ctx.drawImage(
			bd.source as CanvasImageSource,
			bitmap.bitmapX,
			bitmap.bitmapY,
			bitmap.bitmapWidth,
			bitmap.bitmapHeight,
			offsetX + bitmap.bitmapOffsetX,
			offsetY + bitmap.bitmapOffsetY,
			destW,
			destH,
		);
		return 1;
	}

	private renderMesh(mesh: Mesh, ctx: CanvasRenderingContext2D, offsetX: number, offsetY: number): number {
		const bd = mesh.bitmapData;
		if (!bd?.source || mesh.vertices.length === 0) return 0;

		// Canvas 2D doesn't natively support mesh rendering.
		// Fall back to drawing the full texture as a simple bitmap.
		const destW = !isNaN(mesh.width) ? mesh.width : mesh.textureWidth;
		const destH = !isNaN(mesh.height) ? mesh.height : mesh.textureHeight;
		ctx.drawImage(
			bd.source as CanvasImageSource,
			mesh.bitmapX,
			mesh.bitmapY,
			mesh.bitmapWidth,
			mesh.bitmapHeight,
			offsetX + mesh.bitmapOffsetX,
			offsetY + mesh.bitmapOffsetY,
			destW,
			destH,
		);
		return 1;
	}

	private renderGraphics(
		graphics: Graphics,
		ctx: CanvasRenderingContext2D,
		offsetX: number,
		offsetY: number,
		forHitTest = false,
	): number {
		if (graphics.commands.length === 0) return 0;

		ctx.save();
		ctx.translate(offsetX, offsetY);

		for (const cmd of graphics.commands) {
			this.executeGraphicsCommand(cmd, ctx, forHitTest);
		}

		ctx.restore();
		return 1;
	}

	private executeGraphicsCommand(cmd: GraphicsCommand, ctx: CanvasRenderingContext2D, forHitTest = false): void {
		switch (cmd.type) {
			case PathCommandType.BeginFill:
				ctx.fillStyle = forHitTest
					? '#000'
					: `rgba(${(cmd.color >> 16) & 0xff},${(cmd.color >> 8) & 0xff},${cmd.color & 0xff},${cmd.alpha})`;
				ctx.beginPath();
				break;
			case PathCommandType.BeginGradientFill: {
				if (forHitTest) {
					ctx.fillStyle = '#000';
					ctx.beginPath();
					break;
				}
				let gradient: CanvasGradient;
				if (cmd.gradientType === 'radial') {
					gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
				} else {
					gradient = ctx.createLinearGradient(-1, 0, 1, 0);
				}
				for (let i = 0; i < cmd.colors.length; i++) {
					const c = cmd.colors[i];
					const a = cmd.alphas[i] ?? 1;
					const r = (cmd.ratios[i] ?? 0) / 255;
					gradient.addColorStop(r, `rgba(${(c >> 16) & 0xff},${(c >> 8) & 0xff},${c & 0xff},${a})`);
				}
				if (cmd.matrix) {
					const m = cmd.matrix;
					ctx.save();
					ctx.transform(m.a, m.b, m.c, m.d, m.tx, m.ty);
				}
				ctx.fillStyle = gradient;
				ctx.beginPath();
				break;
			}
			case PathCommandType.EndFill:
				ctx.fill();
				ctx.stroke();
				break;
			case PathCommandType.LineStyle:
				ctx.lineWidth = cmd.thickness;
				ctx.strokeStyle = forHitTest
					? '#000'
					: `rgba(${(cmd.color >> 16) & 0xff},${(cmd.color >> 8) & 0xff},${cmd.color & 0xff},${cmd.alpha})`;
				ctx.lineCap = CAPS_MAP[cmd.caps ?? 'none'] ?? 'butt';
				ctx.lineJoin = (cmd.joints ?? 'round') as CanvasLineJoin;
				ctx.miterLimit = cmd.miterLimit;
				if (cmd.lineDash) ctx.setLineDash(cmd.lineDash);
				break;
			case PathCommandType.MoveTo:
				ctx.moveTo(cmd.x, cmd.y);
				break;
			case PathCommandType.LineTo:
				ctx.lineTo(cmd.x, cmd.y);
				break;
			case PathCommandType.CurveTo:
				ctx.quadraticCurveTo(cmd.cx, cmd.cy, cmd.ax, cmd.ay);
				break;
			case PathCommandType.CubicCurveTo:
				ctx.bezierCurveTo(cmd.cx1, cmd.cy1, cmd.cx2, cmd.cy2, cmd.ax, cmd.ay);
				break;
			case PathCommandType.DrawRect:
				ctx.beginPath();
				ctx.rect(cmd.x, cmd.y, cmd.w, cmd.h);
				ctx.fill();
				ctx.stroke();
				break;
			case PathCommandType.DrawRoundRect: {
				const { x, y, w, h, ew, eh } = cmd;
				const rx = ew / 2,
					ry = eh / 2;
				ctx.beginPath();
				ctx.moveTo(x + rx, y);
				ctx.lineTo(x + w - rx, y);
				ctx.ellipse(x + w - rx, y + ry, rx, ry, 0, -Math.PI / 2, 0);
				ctx.lineTo(x + w, y + h - ry);
				ctx.ellipse(x + w - rx, y + h - ry, rx, ry, 0, 0, Math.PI / 2);
				ctx.lineTo(x + rx, y + h);
				ctx.ellipse(x + rx, y + h - ry, rx, ry, 0, Math.PI / 2, Math.PI);
				ctx.lineTo(x, y + ry);
				ctx.ellipse(x + rx, y + ry, rx, ry, 0, Math.PI, Math.PI * 1.5);
				ctx.closePath();
				ctx.fill();
				ctx.stroke();
				break;
			}
			case PathCommandType.DrawCircle:
				ctx.beginPath();
				ctx.arc(cmd.x, cmd.y, cmd.r, 0, Math.PI * 2);
				ctx.fill();
				ctx.stroke();
				break;
			case PathCommandType.DrawEllipse: {
				const cx = cmd.x + cmd.w / 2;
				const cy = cmd.y + cmd.h / 2;
				ctx.beginPath();
				ctx.ellipse(cx, cy, cmd.w / 2, cmd.h / 2, 0, 0, Math.PI * 2);
				ctx.fill();
				ctx.stroke();
				break;
			}
			case PathCommandType.DrawArc:
				ctx.beginPath();
				ctx.arc(cmd.x, cmd.y, cmd.r, cmd.start, cmd.end, cmd.ccw);
				ctx.stroke();
				break;
			case PathCommandType.Clear:
				break;
		}
	}
}

// ── Filter pixel manipulation helpers ─────────────────────────────────────────

function applyColorMatrix(data: Uint8ClampedArray, _w: number, _h: number, matrix: number[]): void {
	for (let i = 0; i < data.length; i += 4) {
		const r = data[i],
			g = data[i + 1],
			b = data[i + 2],
			a = data[i + 3];
		data[i] = Math.max(0, Math.min(255, r * matrix[0] + g * matrix[1] + b * matrix[2] + a * matrix[3] + matrix[4]));
		data[i + 1] = Math.max(
			0,
			Math.min(255, r * matrix[5] + g * matrix[6] + b * matrix[7] + a * matrix[8] + matrix[9]),
		);
		data[i + 2] = Math.max(
			0,
			Math.min(255, r * matrix[10] + g * matrix[11] + b * matrix[12] + a * matrix[13] + matrix[14]),
		);
		data[i + 3] = Math.max(
			0,
			Math.min(255, r * matrix[15] + g * matrix[16] + b * matrix[17] + a * matrix[18] + matrix[19]),
		);
	}
}

function applyBlur(data: Uint8ClampedArray, w: number, h: number, blurX: number, blurY: number): void {
	// Simple box blur approximation
	const radiusX = Math.ceil(blurX) | 0;
	const radiusY = Math.ceil(blurY) | 0;
	if (radiusX <= 0 && radiusY <= 0) return;

	const copy = new Uint8ClampedArray(data);

	// Horizontal pass
	if (radiusX > 0) {
		for (let y = 0; y < h; y++) {
			for (let x = 0; x < w; x++) {
				let r = 0,
					g = 0,
					b = 0,
					a = 0,
					count = 0;
				for (let dx = -radiusX; dx <= radiusX; dx++) {
					const sx = Math.min(Math.max(x + dx, 0), w - 1);
					const idx = (y * w + sx) * 4;
					r += copy[idx];
					g += copy[idx + 1];
					b += copy[idx + 2];
					a += copy[idx + 3];
					count++;
				}
				const idx = (y * w + x) * 4;
				data[idx] = r / count;
				data[idx + 1] = g / count;
				data[idx + 2] = b / count;
				data[idx + 3] = a / count;
			}
		}
	}

	// Vertical pass
	if (radiusY > 0) {
		copy.set(data);
		for (let y = 0; y < h; y++) {
			for (let x = 0; x < w; x++) {
				let r = 0,
					g = 0,
					b = 0,
					a = 0,
					count = 0;
				for (let dy = -radiusY; dy <= radiusY; dy++) {
					const sy = Math.min(Math.max(y + dy, 0), h - 1);
					const idx = (sy * w + x) * 4;
					r += copy[idx];
					g += copy[idx + 1];
					b += copy[idx + 2];
					a += copy[idx + 3];
					count++;
				}
				const idx = (y * w + x) * 4;
				data[idx] = r / count;
				data[idx + 1] = g / count;
				data[idx + 2] = b / count;
				data[idx + 3] = a / count;
			}
		}
	}
}

function applyGlow(data: Uint8ClampedArray, w: number, h: number, filter: GlowFilter): void {
	const blurX = Math.ceil(filter.blurX) | 0;
	const blurY = Math.ceil(filter.blurY) | 0;
	const cr = (filter.color >> 16) & 0xff;
	const cg = (filter.color >> 8) & 0xff;
	const cb = filter.color & 0xff;
	const ca = filter.alpha;
	const strength = filter.strength;

	// Create alpha-only blurred copy
	const alphaData = new Uint8ClampedArray(w * h);
	for (let i = 0; i < data.length; i += 4) {
		alphaData[i / 4] = data[i + 3];
	}

	// Blur the alpha channel
	const blurred = new Uint8ClampedArray(alphaData);
	if (blurX > 0) {
		for (let y = 0; y < h; y++) {
			for (let x = 0; x < w; x++) {
				let sum = 0,
					count = 0;
				for (let dx = -blurX; dx <= blurX; dx++) {
					const sx = Math.min(Math.max(x + dx, 0), w - 1);
					sum += alphaData[y * w + sx];
					count++;
				}
				blurred[y * w + x] = sum / count;
			}
		}
	}
	if (blurY > 0) {
		alphaData.set(blurred);
		for (let y = 0; y < h; y++) {
			for (let x = 0; x < w; x++) {
				let sum = 0,
					count = 0;
				for (let dy = -blurY; dy <= blurY; dy++) {
					const sy = Math.min(Math.max(y + dy, 0), h - 1);
					sum += alphaData[sy * w + x];
					count++;
				}
				blurred[y * w + x] = sum / count;
			}
		}
	}

	// Composite glow under original
	for (let i = 0; i < data.length; i += 4) {
		const glowAlpha = (Math.min(255, blurred[i / 4] * strength) / 255) * ca;
		const origAlpha = data[i + 3] / 255;
		const outAlpha = origAlpha + glowAlpha * (1 - origAlpha);
		if (outAlpha > 0) {
			data[i] = (data[i] * origAlpha + cr * glowAlpha * (1 - origAlpha)) / outAlpha;
			data[i + 1] = (data[i + 1] * origAlpha + cg * glowAlpha * (1 - origAlpha)) / outAlpha;
			data[i + 2] = (data[i + 2] * origAlpha + cb * glowAlpha * (1 - origAlpha)) / outAlpha;
			data[i + 3] = outAlpha * 255;
		}
	}
}

function applyDropShadow(data: Uint8ClampedArray, w: number, h: number, filter: DropShadowFilter): void {
	// DropShadow is a glow with offset
	const angleRad = (filter.angle / 180) * Math.PI;
	const dx = Math.round(filter.distance * Math.cos(angleRad));
	const dy = Math.round(filter.distance * Math.sin(angleRad));

	// Shift the data for shadow offset, then apply glow
	const shifted = new Uint8ClampedArray(data.length);
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const sx = x - dx,
				sy = y - dy;
			if (sx >= 0 && sx < w && sy >= 0 && sy < h) {
				const srcIdx = (sy * w + sx) * 4;
				const dstIdx = (y * w + x) * 4;
				shifted[dstIdx + 3] = data[srcIdx + 3]; // only alpha
			}
		}
	}

	// Apply glow to the shifted alpha
	const cr = (filter.color >> 16) & 0xff;
	const cg = (filter.color >> 8) & 0xff;
	const cb = filter.color & 0xff;
	const ca = filter.alpha;
	const blurX = Math.ceil(filter.blurX) | 0;
	const blurY = Math.ceil(filter.blurY) | 0;
	const strength = filter.strength;

	// Blur shifted alpha
	const alphaData = new Uint8ClampedArray(w * h);
	for (let i = 0; i < shifted.length; i += 4) alphaData[i / 4] = shifted[i + 3];

	const blurred = new Uint8ClampedArray(alphaData);
	if (blurX > 0) {
		for (let y = 0; y < h; y++) {
			for (let x = 0; x < w; x++) {
				let sum = 0,
					count = 0;
				for (let ddx = -blurX; ddx <= blurX; ddx++) {
					sum += alphaData[y * w + Math.min(Math.max(x + ddx, 0), w - 1)];
					count++;
				}
				blurred[y * w + x] = sum / count;
			}
		}
	}
	if (blurY > 0) {
		alphaData.set(blurred);
		for (let y = 0; y < h; y++) {
			for (let x = 0; x < w; x++) {
				let sum = 0,
					count = 0;
				for (let ddy = -blurY; ddy <= blurY; ddy++) {
					sum += alphaData[Math.min(Math.max(y + ddy, 0), h - 1) * w + x];
					count++;
				}
				blurred[y * w + x] = sum / count;
			}
		}
	}

	// Composite: shadow under original
	if (!filter.hideObject) {
		for (let i = 0; i < data.length; i += 4) {
			const shadowAlpha = (Math.min(255, blurred[i / 4] * strength) / 255) * ca;
			const origAlpha = data[i + 3] / 255;
			const outAlpha = origAlpha + shadowAlpha * (1 - origAlpha);
			if (outAlpha > 0) {
				data[i] = (data[i] * origAlpha + cr * shadowAlpha * (1 - origAlpha)) / outAlpha;
				data[i + 1] = (data[i + 1] * origAlpha + cg * shadowAlpha * (1 - origAlpha)) / outAlpha;
				data[i + 2] = (data[i + 2] * origAlpha + cb * shadowAlpha * (1 - origAlpha)) / outAlpha;
				data[i + 3] = outAlpha * 255;
			}
		}
	} else {
		// Only show shadow
		for (let i = 0; i < data.length; i += 4) {
			const shadowAlpha = (Math.min(255, blurred[i / 4] * strength) / 255) * ca;
			data[i] = cr;
			data[i + 1] = cg;
			data[i + 2] = cb;
			data[i + 3] = shadowAlpha * 255;
		}
	}
}

// ── Graphics pixel-perfect hit test ──────────────────────────────────────────
// Registered here to avoid circular dependency between display/ and player/.
// Uses the shared 3×3 hitTestBuffer: translate so the test point lands at (1,1),
// render with forHitTest=true (all shapes drawn as opaque black), then read alpha.

const _hitRenderer = new CanvasRenderer();

setGraphicsHitTest((graphics: Graphics, localX: number, localY: number): boolean => {
	const buf = hitTestBuffer;
	buf.clear();
	const ctx = buf.context;
	// Translate so localX/Y maps to pixel (1,1) in the 3×3 buffer
	ctx.setTransform(1, 0, 0, 1, 1 - localX, 1 - localY);
	_hitRenderer.renderGraphicsToContext(graphics, ctx, 0, 0, true);
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	try {
		return buf.getPixels(1, 1)[3] !== 0;
	} catch {
		return false;
	}
});
