import { DisplayObject, RenderMode } from '../display/DisplayObject.js';
import { Bitmap } from '../display/Bitmap.js';
import { Shape } from '../display/Shape.js';
import { Sprite } from '../display/Sprite.js';
import { Mesh } from '../display/Mesh.js';
import { Graphics } from '../display/Graphics.js';
import { PathCommandType, type GraphicsCommand } from '../display/GraphicsPath.js';
import { Matrix } from '../geom/Matrix.js';
import { RenderBuffer } from './RenderBuffer.js';

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

	// ── Private: tree traversal ───────────────────────────────────────────────

	private drawDisplayObject(
		displayObject: DisplayObject,
		ctx: CanvasRenderingContext2D,
		offsetX: number,
		offsetY: number,
		_isStage = false,
	): number {
		let drawCalls = 0;

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

			if (child.renderMode === RenderMode.SCROLLRECT) {
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
	): number {
		if (graphics.commands.length === 0) return 0;

		ctx.save();
		ctx.translate(offsetX, offsetY);

		for (const cmd of graphics.commands) {
			this.executeGraphicsCommand(cmd, ctx);
		}

		ctx.restore();
		return 1;
	}

	private executeGraphicsCommand(cmd: GraphicsCommand, ctx: CanvasRenderingContext2D): void {
		switch (cmd.type) {
			case PathCommandType.BeginFill:
				ctx.fillStyle = `rgba(${(cmd.color >> 16) & 0xff},${(cmd.color >> 8) & 0xff},${cmd.color & 0xff},${cmd.alpha})`;
				ctx.beginPath();
				break;
			case PathCommandType.BeginGradientFill: {
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
				break;
			case PathCommandType.LineStyle:
				ctx.lineWidth = cmd.thickness;
				ctx.strokeStyle = `rgba(${(cmd.color >> 16) & 0xff},${(cmd.color >> 8) & 0xff},${cmd.color & 0xff},${cmd.alpha})`;
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
				ctx.stroke();
				break;
			case PathCommandType.CurveTo:
				ctx.quadraticCurveTo(cmd.cx, cmd.cy, cmd.ax, cmd.ay);
				ctx.stroke();
				break;
			case PathCommandType.CubicCurveTo:
				ctx.bezierCurveTo(cmd.cx1, cmd.cy1, cmd.cx2, cmd.cy2, cmd.ax, cmd.ay);
				ctx.stroke();
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
