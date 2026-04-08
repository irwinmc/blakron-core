import { DisplayObject, RenderMode, Bitmap, Shape, Sprite, Mesh, Graphics } from '../../display/index.js';
import { Matrix } from '../../geom/index.js';
import { ColorMatrixFilter } from '../../filters/index.js';
import { WebGLRenderBuffer } from './WebGLRenderBuffer.js';
import { CanvasRenderer } from '../CanvasRenderer.js';

const BLEND_MODES: Record<number, string> = {
	0: 'source-over',
	1: 'lighter',
	2: 'destination-out',
};

export class WebGLRenderer {
	private _nestLevel = 0;
	private _canvasRenderer = new CanvasRenderer();

	public render(displayObject: DisplayObject, buffer: WebGLRenderBuffer, matrix: Matrix): number {
		this._nestLevel++;
		const ctx = buffer.context;
		ctx.pushBuffer(buffer);

		buffer.transform(matrix.a, matrix.b, matrix.c, matrix.d, 0, 0);
		this._drawDisplayObject(displayObject, buffer, matrix.tx, matrix.ty, true);
		ctx.$drawWebGL();
		const drawCalls = buffer.drawCalls;
		buffer.onRenderFinish();

		ctx.popBuffer();

		// Invert the matrix transform
		const inv = Matrix.create();
		matrix.invertInto(inv);
		buffer.transform(inv.a, inv.b, inv.c, inv.d, 0, 0);
		Matrix.release(inv);

		this._nestLevel--;
		if (this._nestLevel === 0) {
			WebGLRenderBuffer.release(WebGLRenderBuffer.create(buffer.context, 0, 0));
		}
		return drawCalls;
	}

	// ── Tree traversal ────────────────────────────────────────────────────────

	private _drawDisplayObject(
		displayObject: DisplayObject,
		buffer: WebGLRenderBuffer,
		offsetX: number,
		offsetY: number,
		isStage = false,
	): number {
		let drawCalls = 0;

		// DisplayList cache (cacheAsBitmap) — re-render to offscreen WebGL buffer if dirty
		const displayList = displayObject.displayList;
		if (displayList && !isStage) {
			if (displayObject.cacheDirty || displayObject.renderDirty) {
				if (displayList.updateSurfaceSize()) {
					displayList.renderBuffer.clear();
					this._canvasRenderer.renderToContext(
						displayObject,
						displayList.renderBuffer.context,
						displayList.offsetX,
						displayList.offsetY,
					);
					displayList.updateBitmapData();
				}
				displayObject.cacheDirty = false;
				displayObject.renderDirty = false;
			}
			// Draw cached texture and skip children
			if (displayList.bitmapData?.source) {
				const bd = displayList.bitmapData;
				const w = displayList.renderBuffer.width;
				const h = displayList.renderBuffer.height;
				buffer.context.drawImage(
					bd,
					0,
					0,
					w,
					h,
					offsetX - displayList.offsetX,
					offsetY - displayList.offsetY,
					w,
					h,
					w,
					h,
					false,
				);
				drawCalls++;
			}
			return drawCalls;
		}

		// Render self
		drawCalls += this._renderNode(displayObject, buffer, offsetX, offsetY);

		const children = displayObject.children;
		if (!children) return drawCalls;

		for (const child of children) {
			if (child.renderMode === RenderMode.NONE) continue;

			let ox: number, oy: number;
			let savedMatrix: Matrix | undefined;

			if (child.useTranslate) {
				const m = child.getMatrix();
				ox = offsetX + child.internalX;
				oy = offsetY + child.internalY;
				savedMatrix = Matrix.create();
				savedMatrix.copyFrom(buffer.globalMatrix);
				buffer.transform(m.a, m.b, m.c, m.d, ox, oy);
				ox = -child.internalAnchorOffsetX;
				oy = -child.internalAnchorOffsetY;
			} else {
				ox = offsetX + child.internalX - child.internalAnchorOffsetX;
				oy = offsetY + child.internalY - child.internalAnchorOffsetY;
			}

			let prevAlpha: number | undefined;
			if (child.internalAlpha !== 1) {
				prevAlpha = buffer.globalAlpha;
				buffer.globalAlpha *= child.internalAlpha;
			}

			let prevTint: number | undefined;
			if (child.tintRGB !== 0xffffff) {
				prevTint = buffer.globalTintColor;
				buffer.globalTintColor = child.tintRGB;
			}

			switch (child.renderMode) {
				case RenderMode.FILTER:
					drawCalls += this._drawWithFilter(child, buffer, ox, oy);
					break;
				case RenderMode.CLIP:
					drawCalls += this._drawWithClip(child, buffer, ox, oy);
					break;
				case RenderMode.SCROLLRECT:
					drawCalls += this._drawWithScrollRect(child, buffer, ox, oy);
					break;
				default:
					drawCalls += this._drawDisplayObject(child, buffer, ox, oy);
			}

			if (prevAlpha !== undefined) buffer.globalAlpha = prevAlpha;
			if (prevTint !== undefined) buffer.globalTintColor = prevTint;

			if (savedMatrix) {
				buffer.globalMatrix.copyFrom(savedMatrix);
				Matrix.release(savedMatrix);
			}
		}

		return drawCalls;
	}

	private _drawWithFilter(
		displayObject: DisplayObject,
		buffer: WebGLRenderBuffer,
		offsetX: number,
		offsetY: number,
	): number {
		const filters = displayObject.internalFilters;
		if (!filters.length) return this._drawDisplayObject(displayObject, buffer, offsetX, offsetY);

		const bounds = displayObject.getOriginalBounds();
		if (bounds.width <= 0 || bounds.height <= 0) return 0;

		const bx = bounds.x,
			by = bounds.y,
			bw = bounds.width,
			bh = bounds.height;
		const hasBlend = displayObject.internalBlendMode !== 0;
		const blendOp = BLEND_MODES[displayObject.internalBlendMode] ?? 'source-over';

		// Optimise: single colorMatrix with no children → apply inline
		if (!displayObject.internalMask && filters.length === 1 && filters[0] instanceof ColorMatrixFilter) {
			if (hasBlend) buffer.context.setGlobalCompositeOperation(blendOp);
			buffer.context.$filter = filters[0];
			let dc = 0;
			if (displayObject.internalScrollRect || displayObject.internalMaskRect) {
				dc = this._drawWithScrollRect(displayObject, buffer, offsetX, offsetY);
			} else {
				dc = this._drawDisplayObject(displayObject, buffer, offsetX, offsetY);
			}
			buffer.context.$filter = undefined;
			if (hasBlend) buffer.context.setGlobalCompositeOperation('source-over');
			return dc;
		}

		// Render to offscreen buffer
		const offscreen = WebGLRenderBuffer.create(buffer.context, bw, bh);
		offscreen.context.pushBuffer(offscreen);
		let drawCalls = this._drawDisplayObject(displayObject, offscreen, -bx, -by);
		offscreen.context.popBuffer();

		if (drawCalls > 0) {
			if (hasBlend) buffer.context.setGlobalCompositeOperation(blendOp);
			drawCalls++;
			buffer.offsetX = offsetX + bx;
			buffer.offsetY = offsetY + by;
			buffer.saveTransform();
			buffer.useOffset();
			buffer.context.drawTargetWidthFilters(filters, offscreen);
			buffer.restoreTransform();
			if (hasBlend) buffer.context.setGlobalCompositeOperation('source-over');
		}

		WebGLRenderBuffer.release(offscreen);
		return drawCalls;
	}

	private _drawWithClip(
		displayObject: DisplayObject,
		buffer: WebGLRenderBuffer,
		offsetX: number,
		offsetY: number,
	): number {
		const scrollRect = displayObject.internalScrollRect ?? displayObject.internalMaskRect;
		const mask = displayObject.internalMask;
		const hasBlend = displayObject.internalBlendMode !== 0;
		const blendOp = BLEND_MODES[displayObject.internalBlendMode] ?? 'source-over';

		// Simple case: no mask, no children
		if (!mask && (!displayObject.children || displayObject.children.length === 0)) {
			if (scrollRect)
				buffer.context.pushMask(
					scrollRect.x + offsetX,
					scrollRect.y + offsetY,
					scrollRect.width,
					scrollRect.height,
				);
			if (hasBlend) buffer.context.setGlobalCompositeOperation(blendOp);
			const dc = this._drawDisplayObject(displayObject, buffer, offsetX, offsetY);
			if (hasBlend) buffer.context.setGlobalCompositeOperation('source-over');
			if (scrollRect) buffer.context.popMask();
			return dc;
		}

		const bounds = displayObject.getOriginalBounds();
		if (bounds.width <= 0 || bounds.height <= 0) return 0;
		const bx = bounds.x,
			by = bounds.y,
			bw = bounds.width,
			bh = bounds.height;

		const displayBuffer = WebGLRenderBuffer.create(buffer.context, bw, bh);
		displayBuffer.context.pushBuffer(displayBuffer);
		let drawCalls = this._drawDisplayObject(displayObject, displayBuffer, -bx, -by);

		if (mask) {
			const maskBuffer = WebGLRenderBuffer.create(buffer.context, bw, bh);
			maskBuffer.context.pushBuffer(maskBuffer);
			const maskMatrix = Matrix.create();
			maskMatrix.copyFrom(mask.getConcatenatedMatrix());
			mask.getConcatenatedMatrixAt(displayObject, maskMatrix);
			maskMatrix.translate(-bx, -by);
			maskBuffer.setTransform(
				maskMatrix.a,
				maskMatrix.b,
				maskMatrix.c,
				maskMatrix.d,
				maskMatrix.tx,
				maskMatrix.ty,
			);
			Matrix.release(maskMatrix);
			this._drawDisplayObject(mask, maskBuffer, 0, 0);
			maskBuffer.context.popBuffer();

			displayBuffer.context.setGlobalCompositeOperation('destination-in');
			const mw = maskBuffer.rootRenderTarget.width;
			const mh = maskBuffer.rootRenderTarget.height;
			if (maskBuffer.rootRenderTarget.texture) {
				// Y-flip for WebGL coordinate system, matching old Egret behaviour
				displayBuffer.setTransform(1, 0, 0, -1, 0, maskBuffer.height);
				displayBuffer.context.drawTexture(
					maskBuffer.rootRenderTarget.texture,
					0,
					0,
					mw,
					mh,
					0,
					0,
					mw,
					mh,
					mw,
					mh,
				);
				displayBuffer.setTransform(1, 0, 0, 1, 0, 0);
			}
			displayBuffer.context.setGlobalCompositeOperation('source-over');
			WebGLRenderBuffer.release(maskBuffer);
		}

		displayBuffer.context.popBuffer();

		if (drawCalls > 0) {
			drawCalls++;
			if (hasBlend) buffer.context.setGlobalCompositeOperation(blendOp);
			if (scrollRect)
				buffer.context.pushMask(
					scrollRect.x + offsetX,
					scrollRect.y + offsetY,
					scrollRect.width,
					scrollRect.height,
				);
			const savedMatrix = Matrix.create();
			savedMatrix.copyFrom(buffer.globalMatrix);
			buffer.globalMatrix.append(1, 0, 0, -1, offsetX + bx, offsetY + by + displayBuffer.height);
			const dw = displayBuffer.rootRenderTarget.width;
			const dh = displayBuffer.rootRenderTarget.height;
			if (displayBuffer.rootRenderTarget.texture) {
				buffer.context.drawTexture(displayBuffer.rootRenderTarget.texture, 0, 0, dw, dh, 0, 0, dw, dh, dw, dh);
			}
			buffer.globalMatrix.copyFrom(savedMatrix);
			Matrix.release(savedMatrix);
			if (scrollRect) buffer.context.popMask();
			if (hasBlend) buffer.context.setGlobalCompositeOperation('source-over');
		}

		WebGLRenderBuffer.release(displayBuffer);
		return drawCalls;
	}

	private _drawWithScrollRect(
		displayObject: DisplayObject,
		buffer: WebGLRenderBuffer,
		offsetX: number,
		offsetY: number,
	): number {
		const rect = displayObject.internalScrollRect ?? displayObject.internalMaskRect;
		if (!rect || rect.isEmpty()) return 0;

		let ox = offsetX,
			oy = offsetY;
		if (displayObject.internalScrollRect) {
			ox -= rect.x;
			oy -= rect.y;
		}

		const m = buffer.globalMatrix;
		let scissor = false;

		if (buffer.hasScissor || m.b !== 0 || m.c !== 0) {
			buffer.context.pushMask(rect.x + offsetX, rect.y + offsetY, rect.width, rect.height);
		} else {
			const a = m.a,
				d = m.d,
				tx = m.tx,
				ty = m.ty;
			const x = rect.x + offsetX,
				y = rect.y + offsetY;
			const xMax = x + rect.width,
				yMax = y + rect.height;
			const minX = Math.min(a * x + tx, a * xMax + tx);
			const maxX = Math.max(a * x + tx, a * xMax + tx);
			const minY = Math.min(d * y + ty, d * yMax + ty);
			const maxY = Math.max(d * y + ty, d * yMax + ty);
			buffer.context.enableScissor(minX, -maxY + buffer.height, maxX - minX, maxY - minY);
			scissor = true;
		}

		const drawCalls = this._drawDisplayObject(displayObject, buffer, ox, oy);

		if (scissor) buffer.context.disableScissor();
		else buffer.context.popMask();

		return drawCalls;
	}

	// ── Render individual node types ──────────────────────────────────────────

	private _renderNode(
		displayObject: DisplayObject,
		buffer: WebGLRenderBuffer,
		offsetX: number,
		offsetY: number,
	): number {
		buffer.offsetX = offsetX;
		buffer.offsetY = offsetY;

		if (displayObject instanceof Bitmap) return this._renderBitmap(displayObject, buffer);
		if (displayObject instanceof Mesh) return this._renderMesh(displayObject, buffer);
		if (displayObject instanceof Shape) return this._renderGraphics(displayObject.graphics, buffer);
		if (displayObject instanceof Sprite) return this._renderGraphics(displayObject.graphics, buffer);

		buffer.offsetX = 0;
		buffer.offsetY = 0;
		return 0;
	}

	private _renderBitmap(bitmap: Bitmap, buffer: WebGLRenderBuffer): number {
		const bd = bitmap.bitmapData;
		if (!bd?.source) return 0;
		const destW = !isNaN(bitmap.width) ? bitmap.width : bitmap.textureWidth;
		const destH = !isNaN(bitmap.height) ? bitmap.height : bitmap.textureHeight;
		if (destW <= 0 || destH <= 0) return 0;

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
		return 1;
	}

	private _renderMesh(mesh: Mesh, buffer: WebGLRenderBuffer): number {
		const bd = mesh.bitmapData;
		if (!bd?.source || mesh.vertices.length === 0 || mesh.indices.length === 0) return 0;
		const destW = !isNaN(mesh.width) ? mesh.width : mesh.textureWidth;
		const destH = !isNaN(mesh.height) ? mesh.height : mesh.textureHeight;

		buffer.context.drawMesh(
			bd,
			mesh.bitmapX,
			mesh.bitmapY,
			mesh.bitmapWidth,
			mesh.bitmapHeight,
			mesh.bitmapOffsetX,
			mesh.bitmapOffsetY,
			destW,
			destH,
			mesh.sourceWidth,
			mesh.sourceHeight,
			mesh.uvs,
			mesh.vertices,
			mesh.indices,
			mesh.texture?.rotated ?? false,
			mesh.smoothing,
		);
		buffer.offsetX = 0;
		buffer.offsetY = 0;
		return 1;
	}

	private _renderGraphics(graphics: Graphics, buffer: WebGLRenderBuffer): number {
		if (graphics.commands.length === 0) return 0;
		// Graphics rendering via WebGL requires building geometry from commands.
		// For now, fall back to Canvas 2D offscreen rendering for graphics.
		// TODO: implement native WebGL path rendering.
		buffer.offsetX = 0;
		buffer.offsetY = 0;
		return 0;
	}
}
