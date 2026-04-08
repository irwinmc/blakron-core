import { Stage, StageScaleMode, OrientationMode, DisplayObject } from '../display/index.js';
import { RenderTexture } from '../display/texture/RenderTexture.js';
import { Matrix } from '../geom/index.js';
import { Player } from './Player.js';
import { TouchHandler } from './TouchHandler.js';
import { ScreenAdapter } from './ScreenAdapter.js';
import { setupLifecycle } from './SystemTicker.js';
import { CanvasRenderer } from './CanvasRenderer.js';
import { RenderBuffer } from './RenderBuffer.js';
import type { HeronOptions } from './HeronOptions.js';

export interface HeronApp {
	player: Player;
	stage: Stage;
	touchHandler: TouchHandler;
	screenAdapter: ScreenAdapter;
	start(root?: DisplayObject): void;
	stop(): void;
}

/**
 * Creates and initializes a Heron player from the given options.
 * This is the main entry point for starting a Heron application.
 *
 * ```ts
 * import { createPlayer, Sprite } from '@heron/core';
 *
 * const app = createPlayer({
 *   canvas: document.getElementById('gameCanvas') as HTMLCanvasElement,
 *   contentWidth: 640,
 *   contentHeight: 1136,
 *   scaleMode: 'showAll',
 *   frameRate: 60,
 * });
 *
 * const root = new Sprite();
 * app.start(root);
 * ```
 */
export function createPlayer(options: HeronOptions): HeronApp {
	// Wire up RenderTexture renderer once on first call
	if (!RenderTexture.renderer) {
		const _renderer = new CanvasRenderer();
		RenderTexture.renderer = (displayObject, width, height, offsetX, offsetY) => {
			const buffer = new RenderBuffer(width, height);
			const m = new Matrix();
			m.translate(offsetX, offsetY);
			_renderer.render(displayObject, buffer, m);
			return buffer.surface;
		};
	}
	const {
		canvas,
		frameRate = 60,
		scaleMode = StageScaleMode.SHOW_ALL,
		contentWidth = canvas.width || 640,
		contentHeight = canvas.height || 1136,
		orientation = OrientationMode.AUTO,
		maxTouches = 99,
		background,
	} = options;

	if (background) {
		canvas.style.backgroundColor = background;
	}

	const stage = new Stage();
	stage.scaleMode = scaleMode;
	stage.orientation = orientation;
	stage.maxTouches = maxTouches;
	stage.frameRate = frameRate;

	const player = new Player(canvas, stage);
	const touchHandler = new TouchHandler(stage, canvas);
	const screenAdapter = new ScreenAdapter(player, canvas, touchHandler, contentWidth, contentHeight);
	setupLifecycle(stage);

	return {
		player,
		stage,
		touchHandler,
		screenAdapter,
		start(root?: DisplayObject): void {
			player.start(root);
		},
		stop(): void {
			player.stop();
			touchHandler.dispose();
			screenAdapter.dispose();
		},
	};
}
