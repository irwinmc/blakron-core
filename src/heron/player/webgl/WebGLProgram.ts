import { createProgram } from './WebGLUtils.js';

export type UniformMap = Record<string, WebGLUniformLocation | null>;
export type AttributeMap = Record<string, number>;

export class WebGLProgram {
	private static _cache: Map<string, WebGLProgram> = new Map();

	public static get(gl: WebGLRenderingContext, vertSrc: string, fragSrc: string, key: string): WebGLProgram {
		if (!this._cache.has(key)) {
			this._cache.set(key, new WebGLProgram(gl, vertSrc, fragSrc));
		}
		return this._cache.get(key)!;
	}

	public static clearCache(): void {
		this._cache.clear();
	}

	public readonly id: WebGLProgram_Native;
	public readonly uniforms: UniformMap = {};
	public readonly attributes: AttributeMap = {};

	private constructor(gl: WebGLRenderingContext, vertSrc: string, fragSrc: string) {
		this.id = createProgram(gl, vertSrc, fragSrc) as unknown as WebGLProgram_Native;

		const prog = this.id as unknown as WebGLProgram;
		const totalUniforms = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS) as number;
		for (let i = 0; i < totalUniforms; i++) {
			const info = gl.getActiveUniform(prog, i)!;
			this.uniforms[info.name] = gl.getUniformLocation(prog, info.name);
		}

		const totalAttribs = gl.getProgramParameter(prog, gl.ACTIVE_ATTRIBUTES) as number;
		for (let i = 0; i < totalAttribs; i++) {
			const info = gl.getActiveAttrib(prog, i)!;
			this.attributes[info.name] = gl.getAttribLocation(prog, info.name);
		}
	}
}

// Alias to avoid name collision with the class itself
type WebGLProgram_Native = ReturnType<WebGLRenderingContext['createProgram']>;
