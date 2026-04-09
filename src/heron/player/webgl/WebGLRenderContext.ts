import { WebGLVertexArrayObject } from './WebGLVertexArrayObject.js';
import { WebGLDrawCmdManager, DrawCmdType } from './WebGLDrawCmdManager.js';
import { WebGLProgram } from './WebGLProgram.js';
import { ShaderLib } from './ShaderLib.js';
import { SYM_GL_CONTEXT, SYM_PREMULTIPLIED, SYM_DEFAULT_EMPTY, SYM_SMOOTHING } from './WebGLUtils.js';
import type { WebGLRenderBuffer } from './WebGLRenderBuffer.js';
import { BitmapData } from '../../display/texture/BitmapData.js';
import type { Filter } from '../../filters/index.js';
import { ColorMatrixFilter, BlurFilter, GlowFilter, DropShadowFilter } from '../../filters/index.js';
import { Rectangle } from '../../geom/index.js';
import { MultiTextureBatcher, makeMultiCmd, type MultiTextureDrawCmd } from './MultiTextureBatcher.js';

export class WebGLRenderContext {
	// ── Static ────────────────────────────────────────────────────────────────

	private static _instance: WebGLRenderContext | undefined;

	public static getInstance(canvas: HTMLCanvasElement): WebGLRenderContext {
		if (!this._instance) this._instance = new WebGLRenderContext(canvas);
		return this._instance;
	}

	public static resetInstance(): void {
		this._instance = undefined;
	}

	// ── Public readonly fields ────────────────────────────────────────────────

	public readonly gl: WebGLRenderingContext;
	public readonly surface: HTMLCanvasElement;
	public readonly drawCmdManager: WebGLDrawCmdManager;

	// ── Public mutable fields ─────────────────────────────────────────────────

	public maxTextureSize = 2048;
	public contextLost = false;
	public projectionX = 0;
	public projectionY = 0;
	/** Active filter applied to the next draw call. Set by FilterPipe. */
	public $filter: Filter | undefined = undefined;

	// ── Private fields ────────────────────────────────────────────────────────

	private readonly _vao: WebGLVertexArrayObject;
	private readonly _batcher = new MultiTextureBatcher();
	private readonly _bufferStack: WebGLRenderBuffer[] = [];
	private _currentBuffer: WebGLRenderBuffer | undefined;
	private readonly _vertexBuffer: WebGLBuffer;
	private readonly _indexBuffer: WebGLBuffer;
	private _bindIndices = false;
	private _defaultEmptyTexture: WebGLTexture | undefined;
	/** Max texture units available; capped at MultiTextureBatcher.MAX_TEXTURES. */
	private _maxTextureUnits = MultiTextureBatcher.MAX_TEXTURES;

	private constructor(canvas: HTMLCanvasElement) {
		this.surface = canvas;
		const gl = (canvas.getContext('webgl') ?? canvas.getContext('experimental-webgl')) as WebGLRenderingContext;
		if (!gl) throw new Error('WebGL not supported');
		this.gl = gl;

		gl.disable(gl.DEPTH_TEST);
		gl.disable(gl.CULL_FACE);
		gl.enable(gl.BLEND);
		gl.colorMask(true, true, true, true);
		gl.activeTexture(gl.TEXTURE0);

		this.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
		this._maxTextureUnits = Math.min(
			gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS) as number,
			MultiTextureBatcher.MAX_TEXTURES,
		);

		this._vertexBuffer = gl.createBuffer()!;
		this._indexBuffer = gl.createBuffer()!;
		gl.bindBuffer(gl.ARRAY_BUFFER, this._vertexBuffer);
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._indexBuffer);

		this.drawCmdManager = new WebGLDrawCmdManager();
		this._vao = new WebGLVertexArrayObject();

		this.setGlobalCompositeOperation('source-over');

		canvas.addEventListener('webglcontextlost', e => {
			e.preventDefault();
			this.contextLost = true;
		});
		canvas.addEventListener('webglcontextrestored', () => {
			this.contextLost = false;
			this._onContextRestored();
		});
	}

	// ── Getter ────────────────────────────────────────────────────────────────

	public get activatedBuffer(): WebGLRenderBuffer | undefined {
		return this._currentBuffer;
	}

	public get defaultEmptyTexture(): WebGLTexture {
		if (!this._defaultEmptyTexture) {
			const canvas = document.createElement('canvas');
			canvas.width = canvas.height = 16;
			const ctx = canvas.getContext('2d')!;
			ctx.fillStyle = 'white';
			ctx.fillRect(0, 0, 16, 16);
			this._defaultEmptyTexture = this.createTexture(canvas);
			(this._defaultEmptyTexture as Record<string, unknown>)[SYM_DEFAULT_EMPTY] = true;
		}
		return this._defaultEmptyTexture;
	}

	// ── Buffer stack ──────────────────────────────────────────────────────────

	public pushBuffer(buffer: WebGLRenderBuffer): void {
		this._bufferStack.push(buffer);
		if (buffer !== this._currentBuffer) {
			this.drawCmdManager.pushActivateBuffer(buffer);
		}
		this._currentBuffer = buffer;
	}

	public popBuffer(): void {
		if (this._bufferStack.length <= 1) return;
		this._bufferStack.pop();
		const last = this._bufferStack[this._bufferStack.length - 1];
		if (last !== this._currentBuffer) {
			this.drawCmdManager.pushActivateBuffer(last);
		}
		this._currentBuffer = last;
	}

	// ── Resize ────────────────────────────────────────────────────────────────

	public resize(width: number, height: number): void {
		this.surface.width = width;
		this.surface.height = height;
		this.onResize(width, height);
	}

	public onResize(width?: number, height?: number): void {
		const w = width ?? this.surface.width;
		const h = height ?? this.surface.height;
		this.projectionX = w / 2;
		this.projectionY = -h / 2;
		this.gl.viewport(0, 0, w, h);
	}

	// ── Stencil / Scissor ─────────────────────────────────────────────────────

	public enableStencilTest(): void {
		this.gl.enable(this.gl.STENCIL_TEST);
	}
	public disableStencilTest(): void {
		this.gl.disable(this.gl.STENCIL_TEST);
	}

	public enableScissorTest(rect: Rectangle): void {
		const gl = this.gl;
		gl.enable(gl.SCISSOR_TEST);
		gl.scissor(rect.x, rect.y, rect.width, rect.height);
	}
	public disableScissorTest(): void {
		this.gl.disable(this.gl.SCISSOR_TEST);
	}

	public enableScissor(x: number, y: number, width: number, height: number): void {
		this.drawCmdManager.pushEnableScissor(x, y, width, height);
	}
	public disableScissor(): void {
		this.drawCmdManager.pushDisableScissor();
	}

	// ── Mask (stencil-based) ──────────────────────────────────────────────────

	public pushMask(x: number, y: number, width: number, height: number): void {
		this.drawCmdManager.pushPushMask();
		const buf = this._currentBuffer!;
		this._vao.cacheArrays(buf, 0, 0, width, height, x, y, width, height, width, height);
		this.drawCmdManager.pushDrawRect();
	}

	public popMask(): void {
		this.drawCmdManager.pushPopMask();
		const buf = this._currentBuffer!;
		const rect = buf.stencilList[buf.stencilList.length - 1];
		if (rect) {
			this._vao.cacheArrays(
				buf,
				0,
				0,
				rect.width,
				rect.height,
				rect.x,
				rect.y,
				rect.width,
				rect.height,
				rect.width,
				rect.height,
			);
			this.drawCmdManager.pushDrawRect();
		}
	}

	// ── Blend mode ────────────────────────────────────────────────────────────

	public setGlobalCompositeOperation(value: string): void {
		this.drawCmdManager.pushSetBlend(value);
	}

	// ── Texture ───────────────────────────────────────────────────────────────

	public createTexture(source: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement): WebGLTexture {
		const gl = this.gl;
		const texture = gl.createTexture()!;
		(texture as Record<string, unknown>)[SYM_GL_CONTEXT] = gl;
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
		(texture as Record<string, unknown>)[SYM_PREMULTIPLIED] = true;
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		return texture;
	}

	public updateTexture(texture: WebGLTexture, source: HTMLCanvasElement): void {
		const gl = this.gl;
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
	}

	public getWebGLTexture(bitmapData: BitmapData): WebGLTexture | undefined {
		if (!bitmapData.webGLTexture) {
			if (!bitmapData.source) return undefined;
			const tex = this.createTexture(bitmapData.source as HTMLImageElement);
			bitmapData.webGLTexture = tex;
			(tex as Record<string, unknown>)[SYM_SMOOTHING] = true;
		}
		return bitmapData.webGLTexture;
	}

	// ── Draw ──────────────────────────────────────────────────────────────────

	public drawImage(
		image: BitmapData,
		sourceX: number,
		sourceY: number,
		sourceWidth: number,
		sourceHeight: number,
		destX: number,
		destY: number,
		destWidth: number,
		destHeight: number,
		imageSourceWidth: number,
		imageSourceHeight: number,
		rotated: boolean,
		smoothing?: boolean,
	): void {
		if (this.contextLost || !image || !this._currentBuffer) return;
		const texture = this.getWebGLTexture(image);
		if (!texture) return;
		this.drawTexture(
			texture,
			sourceX,
			sourceY,
			sourceWidth,
			sourceHeight,
			destX,
			destY,
			destWidth,
			destHeight,
			imageSourceWidth,
			imageSourceHeight,
			undefined,
			undefined,
			undefined,
			undefined,
			rotated,
			smoothing,
		);
	}

	public drawMesh(
		image: BitmapData,
		sourceX: number,
		sourceY: number,
		sourceWidth: number,
		sourceHeight: number,
		destX: number,
		destY: number,
		destWidth: number,
		destHeight: number,
		imageSourceWidth: number,
		imageSourceHeight: number,
		meshUVs: number[],
		meshVertices: number[],
		meshIndices: number[],
		rotated: boolean,
		smoothing: boolean,
	): void {
		if (this.contextLost || !image || !this._currentBuffer) return;
		const texture = this.getWebGLTexture(image);
		if (!texture) return;
		this.drawTexture(
			texture,
			sourceX,
			sourceY,
			sourceWidth,
			sourceHeight,
			destX,
			destY,
			destWidth,
			destHeight,
			imageSourceWidth,
			imageSourceHeight,
			meshUVs,
			meshVertices,
			meshIndices,
			undefined,
			rotated,
			smoothing,
		);
	}

	public drawTexture(
		texture: WebGLTexture,
		sourceX: number,
		sourceY: number,
		sourceWidth: number,
		sourceHeight: number,
		destX: number,
		destY: number,
		destWidth: number,
		destHeight: number,
		textureWidth: number,
		textureHeight: number,
		meshUVs?: number[],
		meshVertices?: number[],
		meshIndices?: number[],
		_bounds?: Rectangle,
		rotated?: boolean,
		smoothing?: boolean,
	): void {
		if (this.contextLost || !texture || !this._currentBuffer) return;
		const buf = this._currentBuffer;

		if (meshVertices && meshIndices) {
			const meshNum = meshIndices.length / 3;
			if (this._vao.reachMaxSize(meshNum * 4, meshNum * 6)) this.$drawWebGL();
		} else {
			if (this._vao.reachMaxSize()) this.$drawWebGL();
		}

		if (smoothing !== undefined && (texture as Record<string, unknown>)[SYM_SMOOTHING] !== smoothing) {
			this.drawCmdManager.pushChangeSmoothing(texture, smoothing);
		}

		if (meshUVs) this._vao.changeToMeshIndices();

		// ── Multi-texture path (plain quads without filter) ───────────────────
		const useMulti = !this.$filter && !meshVertices && this._maxTextureUnits > 1;
		if (useMulti) {
			let slot = this._batcher.getOrAssignSlot(texture);
			if (slot === -1) {
				this.$drawWebGL();
				slot = this._batcher.getOrAssignSlot(texture);
			}
			if (!this._vao.isMultiTexture()) this._vao.setMultiTexture(true);
			this._vao.cacheArrays(
				buf,
				sourceX,
				sourceY,
				sourceWidth,
				sourceHeight,
				destX,
				destY,
				destWidth,
				destHeight,
				textureWidth,
				textureHeight,
				undefined,
				undefined,
				undefined,
				rotated,
				slot,
			);
			const cmd = makeMultiCmd(2, this._batcher.slots, this._batcher.textureCount);
			this.drawCmdManager.pushDrawMultiTexture(cmd);
			return;
		}

		// ── Single-texture path (filter, mesh, or single-unit device) ─────────
		if (this._vao.isMultiTexture()) this.$drawWebGL();

		this._vao.cacheArrays(
			buf,
			sourceX,
			sourceY,
			sourceWidth,
			sourceHeight,
			destX,
			destY,
			destWidth,
			destHeight,
			textureWidth,
			textureHeight,
			meshUVs,
			meshVertices,
			meshIndices,
			rotated,
		);

		const count = meshIndices ? (meshIndices.length / 3) * 2 : 2;
		this.drawCmdManager.pushDrawTexture(texture, count, this.$filter ?? undefined, textureWidth, textureHeight);
	}

	public drawTargetWidthFilters(filters: Filter[], buffer: WebGLRenderBuffer): void {
		const target = buffer.rootRenderTarget;
		if (!target?.texture) return;
		const w = target.width,
			h = target.height;
		for (const filter of filters) {
			this.drawCmdManager.pushDrawTexture(target.texture, 2, filter, w, h);
		}
	}

	public clear(): void {
		this.drawCmdManager.pushClearColor();
	}

	public getPixels(x: number, y: number, width: number, height: number, pixels: Uint8Array): void {
		this.gl.readPixels(x, y, width, height, this.gl.RGBA, this.gl.UNSIGNED_BYTE, pixels);
	}

	// ── Execute ───────────────────────────────────────────────────────────────

	public $drawWebGL(): void {
		this._flush();
	}

	// ── Private — flush & dispatch ────────────────────────────────────────────

	private _onContextRestored(): void {
		const gl = this.gl;

		// Re-apply baseline GL state.
		gl.disable(gl.DEPTH_TEST);
		gl.disable(gl.CULL_FACE);
		gl.enable(gl.BLEND);
		gl.colorMask(true, true, true, true);
		gl.activeTexture(gl.TEXTURE0);

		// Re-bind the vertex and index buffers (they are lost on context loss).
		gl.bindBuffer(gl.ARRAY_BUFFER, this._vertexBuffer);
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._indexBuffer);

		// Clear the shader program cache — all programs are invalid after context loss.
		WebGLProgram.clearCache();

		// Reset internal state.
		this._bindIndices = false;
		this._batcher.reset();
		this.drawCmdManager.clear();
		this._vao.clear();

		// Restore projection.
		this.onResize();
	}

	private _flush(): void {
		const gl = this.gl;
		const cmds = this.drawCmdManager;
		const vao = this._vao;

		if (vao.getVertices().length === 0 && cmds.drawDataLen === 0) return;

		// Upload vertices
		gl.bufferData(gl.ARRAY_BUFFER, vao.getVertices(), gl.STREAM_DRAW);
		if (!this._bindIndices) {
			gl.bufferData(
				gl.ELEMENT_ARRAY_BUFFER,
				vao.isMesh() ? vao.getMeshIndices() : vao.getIndices(),
				gl.STATIC_DRAW,
			);
			this._bindIndices = true;
		}

		let indexOffset = 0;

		for (let i = 0; i < cmds.drawDataLen; i++) {
			const cmd = cmds.drawData[i];
			switch (cmd.type) {
				case DrawCmdType.ACT_BUFFER:
					this._activateBuffer(cmd.buffer!, cmd.width, cmd.height);
					break;
				case DrawCmdType.RESIZE_TARGET:
					cmd.buffer!.rootRenderTarget?.resize(cmd.width, cmd.height);
					break;
				case DrawCmdType.CLEAR_COLOR:
					gl.colorMask(true, true, true, true);
					gl.clearColor(0, 0, 0, 0);
					gl.clear(gl.COLOR_BUFFER_BIT);
					break;
				case DrawCmdType.BLEND:
					this._applyBlend(cmd.value);
					break;
				case DrawCmdType.ENABLE_SCISSOR:
					gl.enable(gl.SCISSOR_TEST);
					gl.scissor(cmd.x, cmd.y, cmd.width, cmd.height);
					break;
				case DrawCmdType.DISABLE_SCISSOR:
					gl.disable(gl.SCISSOR_TEST);
					break;
				case DrawCmdType.PUSH_MASK:
					this._pushMaskDraw(indexOffset, cmd.count);
					indexOffset += cmd.count;
					break;
				case DrawCmdType.POP_MASK:
					this._popMaskDraw(indexOffset, cmd.count);
					indexOffset += cmd.count;
					break;
				case DrawCmdType.SMOOTHING:
					if (cmd.texture) {
						gl.bindTexture(gl.TEXTURE_2D, cmd.texture);
						const filter = cmd.smoothing ? gl.LINEAR : gl.NEAREST;
						gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
						gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
					}
					break;
				case DrawCmdType.TEXTURE:
					this._drawTextureBatch(
						cmd.texture!,
						indexOffset,
						cmd.count,
						cmd.filter,
						cmd.textureWidth,
						cmd.textureHeight,
					);
					indexOffset += cmd.count;
					break;
				case DrawCmdType.MULTI_TEXTURE:
					if (cmd.multiCmd) {
						this._drawMultiTextureBatch(cmd.multiCmd, indexOffset, cmd.count);
						indexOffset += cmd.count;
					}
					break;
				case DrawCmdType.RECT:
					this._drawRectBatch(indexOffset, cmd.count);
					indexOffset += cmd.count;
					break;
			}
		}

		vao.clear();
		cmds.clear();
		this._batcher.reset();
		this._bindIndices = false;
	}

	// ── Private — blend & program ─────────────────────────────────────────────

	private _activateBuffer(buffer: WebGLRenderBuffer, width: number, height: number): void {
		const gl = this.gl;
		buffer.rootRenderTarget?.activate();
		if (!this._bindIndices) {
			const vao = this._vao;
			gl.bufferData(
				gl.ELEMENT_ARRAY_BUFFER,
				vao.isMesh() ? vao.getMeshIndices() : vao.getIndices(),
				gl.STATIC_DRAW,
			);
		}
		buffer.restoreStencil();
		buffer.restoreScissor();
		this.onResize(width, height);
	}

	private _applyBlend(value: string): void {
		const gl = this.gl;
		switch (value) {
			case 'source-over':
				gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
				break;
			case 'lighter':
				gl.blendFunc(gl.ONE, gl.ONE);
				break;
			case 'destination-out':
				gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
				break;
			case 'destination-in':
				gl.blendFunc(gl.ZERO, gl.SRC_ALPHA);
				break;
			default:
				gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
		}
	}

	// ── Private — draw batches ────────────────────────────────────────────────

	private _drawMultiTextureBatch(cmd: MultiTextureDrawCmd, indexOffset: number, count: number): void {
		const gl = this.gl;
		const prog = WebGLProgram.get(gl, ShaderLib.multi_vert, ShaderLib.multi_frag, 'multi');
		gl.useProgram(prog.id);

		const stride = 6 * 4; // MULTI_VERT_BYTE_SIZE
		const aPos = prog.attributes['aVertexPosition'];
		const aUV = prog.attributes['aTextureCoord'];
		const aColor = prog.attributes['aColor'];
		const aTid = prog.attributes['aTextureId'];
		if (aPos !== undefined && aPos >= 0) {
			gl.enableVertexAttribArray(aPos);
			gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, stride, 0);
		}
		if (aUV !== undefined && aUV >= 0) {
			gl.enableVertexAttribArray(aUV);
			gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, stride, 8);
		}
		if (aColor !== undefined && aColor >= 0) {
			gl.enableVertexAttribArray(aColor);
			gl.vertexAttribPointer(aColor, 4, gl.UNSIGNED_BYTE, true, stride, 16);
		}
		if (aTid !== undefined && aTid >= 0) {
			gl.enableVertexAttribArray(aTid);
			gl.vertexAttribPointer(aTid, 1, gl.FLOAT, false, stride, 20);
		}

		const uProj = prog.uniforms['projectionVector'];
		if (uProj) gl.uniform2f(uProj, this.projectionX, this.projectionY);

		// Bind each texture to its unit and set the sampler uniform array.
		const uSamplers = prog.uniforms['uSamplers[0]'];
		const samplerIndices = new Int32Array(cmd.textureCount);
		for (let i = 0; i < cmd.textureCount; i++) {
			gl.activeTexture(gl.TEXTURE0 + i);
			gl.bindTexture(gl.TEXTURE_2D, cmd.textures[i] ?? null);
			samplerIndices[i] = i;
		}
		if (uSamplers) gl.uniform1iv(uSamplers, samplerIndices);
		// Restore active texture unit to 0 for subsequent single-texture draws.
		gl.activeTexture(gl.TEXTURE0);

		gl.drawElements(gl.TRIANGLES, count * 3, gl.UNSIGNED_SHORT, indexOffset * 2);
	}

	private _getTextureProgram(filter?: Filter): WebGLProgram {
		if (filter instanceof ColorMatrixFilter) {
			return WebGLProgram.get(this.gl, ShaderLib.default_vert, ShaderLib.colorTransform_frag, 'colorTransform');
		}
		if (filter instanceof BlurFilter || filter instanceof GlowFilter || filter instanceof DropShadowFilter) {
			return WebGLProgram.get(this.gl, ShaderLib.default_vert, ShaderLib.glow_frag, 'glow');
		}
		return WebGLProgram.get(this.gl, ShaderLib.default_vert, ShaderLib.texture_frag, 'texture');
	}

	private _drawTextureBatch(
		texture: WebGLTexture,
		indexOffset: number,
		count: number,
		filter: Filter | undefined,
		texW: number,
		texH: number,
	): void {
		const gl = this.gl;
		const prog = this._getTextureProgram(filter);
		gl.useProgram(prog.id);

		// Vertex attributes: x,y (2f), uv (2f), color (4ub)
		const stride = 5 * 4;
		const aPos = prog.attributes['aVertexPosition'];
		const aUV = prog.attributes['aTextureCoord'];
		const aColor = prog.attributes['aColor'];
		if (aPos !== undefined && aPos >= 0) {
			gl.enableVertexAttribArray(aPos);
			gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, stride, 0);
		}
		if (aUV !== undefined && aUV >= 0) {
			gl.enableVertexAttribArray(aUV);
			gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, stride, 8);
		}
		if (aColor !== undefined && aColor >= 0) {
			gl.enableVertexAttribArray(aColor);
			gl.vertexAttribPointer(aColor, 4, gl.UNSIGNED_BYTE, true, stride, 16);
		}

		const uProj = prog.uniforms['projectionVector'];
		if (uProj) gl.uniform2f(uProj, this.projectionX, this.projectionY);

		const uSampler = prog.uniforms['uSampler'];
		if (uSampler) gl.uniform1i(uSampler, 0);

		gl.bindTexture(gl.TEXTURE_2D, texture);

		// Apply filter uniforms
		if (filter instanceof ColorMatrixFilter) {
			const uMatrix = prog.uniforms['matrix'];
			const uAdd = prog.uniforms['colorAdd'];
			if (uMatrix) gl.uniformMatrix4fv(uMatrix, false, new Float32Array(filter.matrix.slice(0, 16)));
			if (uAdd)
				gl.uniform4f(
					uAdd,
					filter.matrix[4] / 255,
					filter.matrix[9] / 255,
					filter.matrix[14] / 255,
					filter.matrix[19] / 255,
				);
		} else if (filter instanceof BlurFilter) {
			const uBlur = prog.uniforms['blur'];
			const uSize = prog.uniforms['uTextureSize'];
			if (uBlur) gl.uniform2f(uBlur, filter.blurX, filter.blurY);
			if (uSize) gl.uniform2f(uSize, texW, texH);
		} else if (filter instanceof GlowFilter || filter instanceof DropShadowFilter) {
			const uSize = prog.uniforms['uTextureSize'];
			if (uSize) gl.uniform2f(uSize, texW, texH);
			const uColor = prog.uniforms['color'];
			const c = filter.color;
			if (uColor) gl.uniform4f(uColor, ((c >> 16) & 0xff) / 255, ((c >> 8) & 0xff) / 255, (c & 0xff) / 255, 1);
			const uAlpha = prog.uniforms['alpha'];
			if (uAlpha) gl.uniform1f(uAlpha, filter.alpha);
			const uStrength = prog.uniforms['strength'];
			if (uStrength) gl.uniform1f(uStrength, filter.strength);
			const uBlurX = prog.uniforms['blurX'];
			if (uBlurX) gl.uniform1f(uBlurX, filter.blurX);
			const uBlurY = prog.uniforms['blurY'];
			if (uBlurY) gl.uniform1f(uBlurY, filter.blurY);
			if (filter instanceof DropShadowFilter) {
				const uDist = prog.uniforms['dist'];
				if (uDist) gl.uniform1f(uDist, filter.distance);
				const uAngle = prog.uniforms['angle'];
				if (uAngle) gl.uniform1f(uAngle, (filter.angle / 180) * Math.PI);
				const uHide = prog.uniforms['hideObject'];
				if (uHide) gl.uniform1f(uHide, filter.hideObject ? 1 : 0);
			}
			const uInner = prog.uniforms['inner'];
			if (uInner) gl.uniform1f(uInner, filter instanceof GlowFilter && filter.inner ? 1 : 0);
			const uKnockout = prog.uniforms['knockout'];
			if (uKnockout) gl.uniform1f(uKnockout, filter instanceof GlowFilter && filter.knockout ? 1 : 0);
		}

		gl.drawElements(gl.TRIANGLES, count * 3, gl.UNSIGNED_SHORT, indexOffset * 2);
	}

	private _drawRectBatch(indexOffset: number, count: number): void {
		const gl = this.gl;
		const prog = WebGLProgram.get(gl, ShaderLib.default_vert, ShaderLib.primitive_frag, 'primitive');
		gl.useProgram(prog.id);

		const stride = 5 * 4;
		const aPos = prog.attributes['aVertexPosition'];
		const aColor = prog.attributes['aColor'];
		if (aPos !== undefined && aPos >= 0) {
			gl.enableVertexAttribArray(aPos);
			gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, stride, 0);
		}
		if (aColor !== undefined && aColor >= 0) {
			gl.enableVertexAttribArray(aColor);
			gl.vertexAttribPointer(aColor, 4, gl.UNSIGNED_BYTE, true, stride, 16);
		}

		const uProj = prog.uniforms['projectionVector'];
		if (uProj) gl.uniform2f(uProj, this.projectionX, this.projectionY);

		gl.drawElements(gl.TRIANGLES, count * 3, gl.UNSIGNED_SHORT, indexOffset * 2);
	}

	// ── Private — stencil mask ────────────────────────────────────────────────

	private _pushMaskDraw(indexOffset: number, count: number): void {
		const gl = this.gl;
		const buf = this._currentBuffer!;
		buf.enableStencil();
		gl.colorMask(false, false, false, false);
		gl.stencilFunc(gl.ALWAYS, 1, 0xff);
		gl.stencilOp(gl.KEEP, gl.KEEP, gl.INCR);
		this._drawRectBatch(indexOffset, count);
		gl.colorMask(true, true, true, true);
		gl.stencilFunc(gl.EQUAL, buf.stencilHandleCount + 1, 0xff);
		gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
		buf.stencilHandleCount++;
	}

	private _popMaskDraw(indexOffset: number, count: number): void {
		const gl = this.gl;
		const buf = this._currentBuffer!;
		gl.colorMask(false, false, false, false);
		gl.stencilFunc(gl.ALWAYS, 1, 0xff);
		gl.stencilOp(gl.KEEP, gl.KEEP, gl.DECR);
		this._drawRectBatch(indexOffset, count);
		gl.colorMask(true, true, true, true);
		buf.stencilHandleCount--;
		if (buf.stencilHandleCount === 0) {
			buf.disableStencil();
		} else {
			gl.stencilFunc(gl.EQUAL, buf.stencilHandleCount, 0xff);
			gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
		}
	}
}
