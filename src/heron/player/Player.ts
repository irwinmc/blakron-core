import { Stage, DisplayObject } from '../display/index.js';
import { Matrix } from '../geom/index.js';
import { RenderBuffer } from './RenderBuffer.js';
import { CanvasRenderer } from './CanvasRenderer.js';
import { ticker, type Renderable } from './SystemTicker.js';
import { WebGLRenderContext, WebGLRenderBuffer, WebGLRenderer } from './webgl/index.js';
import { checkWebGLSupport } from './webgl/WebGLUtils.js';

/**
 * The Player ties together a Stage and a renderer.
 * Automatically uses WebGL if available, falls back to Canvas 2D.
 */
export class Player implements Renderable {
	public readonly stage: Stage;

	private _isPlaying = false;
	private _root: DisplayObject | undefined = undefined;

	// Canvas 2D path
	private _canvas2dBuffer: RenderBuffer | undefined;
	private _canvas2dRenderer: CanvasRenderer | undefined;

	// WebGL path
	private _webglBuffer: WebGLRenderBuffer | undefined;
	private _webglRenderer: WebGLRenderer | undefined;
	private _webglContext: WebGLRenderContext | undefined;

	public constructor(canvas: HTMLCanvasElement, stage?: Stage) {
		this.stage = stage ?? new Stage();

		if (checkWebGLSupport()) {
			try {
				this._webglContext = WebGLRenderContext.getInstance(canvas);
				this._webglBuffer = new WebGLRenderBuffer(
					this._webglContext,
					canvas.width || 1,
					canvas.height || 1,
					true,
				);
				this._webglRenderer = new WebGLRenderer();
				return;
			} catch {
				// WebGL init failed, fall through to Canvas 2D
				WebGLRenderContext.resetInstance();
			}
		}

		const ctx = canvas.getContext('2d');
		if (!ctx) throw new Error('Failed to get Canvas 2D context');
		this._canvas2dBuffer = new RenderBuffer();
		(this._canvas2dBuffer as { surface: HTMLCanvasElement }).surface = canvas;
		(this._canvas2dBuffer as { context: CanvasRenderingContext2D }).context = ctx;
		this._canvas2dRenderer = new CanvasRenderer();
	}

	public get isWebGL(): boolean {
		return !!this._webglRenderer;
	}

	public start(root?: DisplayObject): void {
		if (this._isPlaying) return;
		this._isPlaying = true;
		if (root && !this._root) {
			this._root = root;
			this.stage.addChild(root);
		}
		ticker.addPlayer(this);
		ticker.start();
	}

	public stop(): void {
		this.pause();
	}

	public pause(): void {
		if (!this._isPlaying) return;
		this._isPlaying = false;
		ticker.removePlayer(this);
	}

	public updateStageSize(width: number, height: number): void {
		this.stage.resize(width, height);
		if (this._webglBuffer) {
			this._webglBuffer.resize(width, height);
		} else {
			this._canvas2dBuffer?.resize(width, height);
		}
	}

	render(_triggerByFrame: boolean, _costTicker: number): void {
		if (this._webglBuffer && this._webglRenderer) {
			this._webglBuffer.clear();
			const m = new Matrix();
			this._webglRenderer.render(this.stage, this._webglBuffer, m);
		} else if (this._canvas2dBuffer && this._canvas2dRenderer) {
			this._canvas2dBuffer.clear();
			this._canvas2dRenderer.render(this.stage, this._canvas2dBuffer);
		}
	}
}
