// ── Core ──────────────────────────────────────────────────────────────────────
export { Player } from './Player.js';
export { createPlayer, type HeronApp } from './createPlayer.js';
export type { HeronOptions } from './HeronOptions.js';

// ── Ticker ────────────────────────────────────────────────────────────────────
export {
	SystemTicker,
	ticker,
	getTimer,
	setupLifecycle,
	START_TIME,
	invalidateRenderFlag,
	setInvalidateRenderFlag,
	requestRenderingFlag,
	setRequestRenderingFlag,
	type Renderable,
} from './SystemTicker.js';

// ── Rendering ─────────────────────────────────────────────────────────────────
export { InstructionSet, type Instruction } from './InstructionSet.js';
export type { RenderPipe } from './RenderPipe.js';
export { RenderBuffer, hitTestBuffer } from './RenderBuffer.js';
export { CanvasRenderer } from './CanvasRenderer.js';
export { DisplayList } from './DisplayList.js';

// ── Input & Layout ────────────────────────────────────────────────────────────
export { TouchHandler } from './TouchHandler.js';
export { ScreenAdapter, type StageDisplaySize } from './ScreenAdapter.js';

// ── WebGL ─────────────────────────────────────────────────────────────────────
export {
	WebGLRenderer,
	WebGLRenderContext,
	WebGLRenderBuffer,
	WebGLRenderTarget,
	WebGLVertexArrayObject,
	WebGLDrawCmdManager,
	WebGLProgram,
	ShaderLib,
	checkWebGLSupport,
	MultiTextureBatcher,
} from './webgl/index.js';
