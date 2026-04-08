/** Symbol keys stored on WebGLTexture objects. */
export const SYM_GL_CONTEXT = '__heronGlContext';
export const SYM_PREMULTIPLIED = '__heronPremultiplied';
export const SYM_DEFAULT_EMPTY = '__heronDefaultEmpty';
export const SYM_SMOOTHING = '__heronSmoothing';

export function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
	const shader = gl.createShader(type)!;
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		console.error('Shader compile error:', gl.getShaderInfoLog(shader));
	}
	return shader;
}

export function createProgram(gl: WebGLRenderingContext, vertSrc: string, fragSrc: string): WebGLProgram {
	const vert = compileShader(gl, gl.VERTEX_SHADER, vertSrc);
	const frag = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);
	const program = gl.createProgram()!;
	gl.attachShader(program, vert);
	gl.attachShader(program, frag);
	gl.linkProgram(program);
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		console.error('Program link error:', gl.getProgramInfoLog(program));
	}
	return program;
}

export function deleteWebGLTexture(gl: WebGLRenderingContext | undefined, texture: WebGLTexture | undefined): void {
	if (!texture) return;
	if ((texture as Record<string, unknown>)[SYM_DEFAULT_EMPTY]) return;
	if (gl) gl.deleteTexture(texture);
}

/** Premultiply tint color with alpha, packing into a uint32. */
export function premultiplyTint(tint: number, alpha: number): number {
	if (alpha === 1.0) return ((alpha * 255) << 24) + tint;
	if (alpha === 0.0) return 0;
	const R = Math.round(((tint >> 16) & 0xff) * alpha);
	const G = Math.round(((tint >> 8) & 0xff) * alpha);
	const B = Math.round((tint & 0xff) * alpha);
	return ((alpha * 255) << 24) + (R << 16) + (G << 8) + B;
}

export function checkWebGLSupport(): boolean {
	try {
		const canvas = document.createElement('canvas');
		return !!(
			window.WebGLRenderingContext &&
			(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
		);
	} catch {
		return false;
	}
}
