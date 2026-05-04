/** UBOManager only operates on WebGL2 contexts. */
type GL2 = WebGL2RenderingContext;

/**
 * std140 layout for the frame-level UBO shared by all shader programs.
 *
 * Binding point 0 — updated once per frame.
 *
 * Layout (std140):
 *   mat4  projectionMatrix  — offset 0,   size 64
 *   vec2  projectionVector  — offset 64,  size 8
 *   float uTime             — offset 72,  size 4
 *   // implicit padding to vec4 alignment = total 80 bytes
 */
const FRAME_UBO_SIZE = 80;
const FRAME_UBO_BINDING = 0;

/**
 * Manages Uniform Buffer Objects for WebGL2 contexts.
 *
 * - `FrameUBO` (binding 0): projection matrix, projection vector, texture size,
 *    frame time — set once per frame, shared by all shader programs.
 *
 * WebGL1 fallback: the UBO manager is never created; uniform uploads
 * continue via the existing per-draw gl.uniform*() path.
 */
export class UBOManager {
	private readonly _gl: GL2;
	private readonly _frameUBO: WebGLBuffer;
	private readonly _frameData: Float32Array;
	private readonly _boundPrograms = new WeakSet<WebGLProgram>();

	constructor(gl: GL2) {
		this._gl = gl;

		const ubo = gl.createBuffer();
		if (!ubo) throw new Error('Failed to create UBO');
		this._frameUBO = ubo;

		gl.bindBuffer(gl.UNIFORM_BUFFER, ubo);
		gl.bufferData(gl.UNIFORM_BUFFER, FRAME_UBO_SIZE, gl.DYNAMIC_DRAW);

		// Bind to binding point 0 — shared by all programs
		gl.bindBufferBase(gl.UNIFORM_BUFFER, FRAME_UBO_BINDING, ubo);

		this._frameData = new Float32Array(FRAME_UBO_SIZE / 4);
	}

	// ── Frame UBO update ──────────────────────────────────────────────────────

	/** Update the frame-level UBO. Call once per frame. */
	public updateFrame(projectionX: number, projectionY: number, time: number): void {
		const d = this._frameData;
		d[16] = projectionX;
		d[17] = projectionY;
		d[18] = time;

		const gl = this._gl;
		gl.bindBuffer(gl.UNIFORM_BUFFER, this._frameUBO);
		gl.bufferSubData(gl.UNIFORM_BUFFER, 64, d.subarray(16, 19));
	}

	/**
	 * Update only the projectionVector in the frame UBO.
	 * Must be called whenever the active render buffer changes (e.g. switching
	 * to an offscreen filter buffer) so that vertex positions are projected
	 * correctly for the new buffer dimensions.
	 */
	public updateProjection(projectionX: number, projectionY: number): void {
		const d = this._frameData;
		d[16] = projectionX;
		d[17] = projectionY;

		const gl = this._gl;
		gl.bindBuffer(gl.UNIFORM_BUFFER, this._frameUBO);
		gl.bufferSubData(gl.UNIFORM_BUFFER, 64, d.subarray(16, 18));
	}

	// ── Program binding ───────────────────────────────────────────────────────

	/**
	 * Bind the frame UBO to a program's uniform block.
	 * Safe to call repeatedly — only binds once per program (WeakSet tracked).
	 */
	public ensureBound(program: WebGLProgram): void {
		if (this._boundPrograms.has(program)) return;
		this._boundPrograms.add(program);
		const gl = this._gl;
		const blockIndex = gl.getUniformBlockIndex(program, 'FrameUniforms');
		if (blockIndex !== gl.INVALID_INDEX) {
			gl.uniformBlockBinding(program, blockIndex, FRAME_UBO_BINDING);
		}
	}

	// ── Cleanup ───────────────────────────────────────────────────────────────

	public destroy(): void {
		this._gl.deleteBuffer(this._frameUBO);
	}
}
