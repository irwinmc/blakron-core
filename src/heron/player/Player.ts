import { Stage } from '../display/Stage.js';
import { DisplayObject } from '../display/DisplayObject.js';
import { RenderBuffer } from './RenderBuffer.js';
import { CanvasRenderer } from './CanvasRenderer.js';
import { ticker, type Renderable } from './SystemTicker.js';

/**
 * The Player is the main controller that ties together a Stage, a RenderBuffer,
 * and the CanvasRenderer. It registers itself with the SystemTicker to receive
 * frame callbacks and renders the display list each frame.
 *
 * Equivalent to Egret's `sys.Player`.
 */
export class Player implements Renderable {
	// ── Instance fields ───────────────────────────────────────────────────────

	public readonly stage: Stage;

	private _buffer: RenderBuffer;
	private _renderer: CanvasRenderer;
	private _isPlaying = false;
	private _root: DisplayObject | undefined = undefined;

	// ── Constructor ───────────────────────────────────────────────────────────

	public constructor(canvas: HTMLCanvasElement, stage?: Stage) {
		this.stage = stage ?? new Stage();

		const ctx = canvas.getContext('2d');
		if (!ctx) throw new Error('Failed to get Canvas 2D context');

		this._buffer = new RenderBuffer();
		// Use the provided canvas as the surface directly
		(this._buffer as { surface: HTMLCanvasElement }).surface = canvas;
		(this._buffer as { context: CanvasRenderingContext2D }).context = ctx;

		this._renderer = new CanvasRenderer();
	}

	// ── Public methods ────────────────────────────────────────────────────────

	/**
	 * Starts the player. Registers with the global ticker and begins rendering.
	 */
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

	/**
	 * Stops the player permanently.
	 */
	public stop(): void {
		this.pause();
	}

	/**
	 * Pauses the player. Can be resumed with start().
	 */
	public pause(): void {
		if (!this._isPlaying) return;
		this._isPlaying = false;
		ticker.removePlayer(this);
	}

	/**
	 * Updates the stage size and resizes the render buffer.
	 */
	public updateStageSize(width: number, height: number): void {
		this.stage.resize(width, height);
		this._buffer.resize(width, height);
	}

	// ── Renderable interface ──────────────────────────────────────────────────

	/**
	 * Called by SystemTicker each frame.
	 */
	render(_triggerByFrame: boolean, _costTicker: number): void {
		this._buffer.clear();
		this._renderer.render(this.stage, this._buffer);
	}
}
