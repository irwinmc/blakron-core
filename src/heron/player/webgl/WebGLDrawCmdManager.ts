import type { WebGLRenderBuffer } from './WebGLRenderBuffer.js';
import type { Filter } from '../../filters/index.js';

export const enum DrawCmdType {
	TEXTURE = 0,
	RECT = 1,
	PUSH_MASK = 2,
	POP_MASK = 3,
	BLEND = 4,
	RESIZE_TARGET = 5,
	CLEAR_COLOR = 6,
	ACT_BUFFER = 7,
	ENABLE_SCISSOR = 8,
	DISABLE_SCISSOR = 9,
	SMOOTHING = 10,
}

export interface DrawCmd {
	type: DrawCmdType;
	count: number;
	texture: WebGLTexture | undefined;
	filter: Filter | undefined;
	value: string;
	buffer: WebGLRenderBuffer | undefined;
	width: number;
	height: number;
	textureWidth: number;
	textureHeight: number;
	smoothing: boolean;
	x: number;
	y: number;
}

function makeCmd(): DrawCmd {
	return {
		type: DrawCmdType.TEXTURE,
		count: 0,
		texture: undefined,
		filter: undefined,
		value: '',
		buffer: undefined,
		width: 0,
		height: 0,
		textureWidth: 0,
		textureHeight: 0,
		smoothing: false,
		x: 0,
		y: 0,
	};
}

export class WebGLDrawCmdManager {
	public readonly drawData: DrawCmd[] = [];
	public drawDataLen = 0;

	private _get(): DrawCmd {
		return this.drawData[this.drawDataLen] ?? (this.drawData[this.drawDataLen] = makeCmd());
	}

	public pushDrawRect(): void {
		const last = this.drawData[this.drawDataLen - 1];
		if (this.drawDataLen > 0 && last.type === DrawCmdType.RECT) {
			last.count += 2;
			return;
		}
		const d = this._get();
		d.type = DrawCmdType.RECT;
		d.count = 2;
		this.drawDataLen++;
	}

	public pushDrawTexture(
		texture: WebGLTexture,
		count = 2,
		filter?: Filter,
		textureWidth?: number,
		textureHeight?: number,
	): void {
		if (filter) {
			const d = this._get();
			d.type = DrawCmdType.TEXTURE;
			d.texture = texture;
			d.filter = filter;
			d.count = count;
			d.textureWidth = textureWidth ?? 0;
			d.textureHeight = textureHeight ?? 0;
			this.drawDataLen++;
		} else {
			const last = this.drawData[this.drawDataLen - 1];
			if (this.drawDataLen > 0 && last.type === DrawCmdType.TEXTURE && last.texture === texture && !last.filter) {
				last.count += count;
				return;
			}
			const d = this._get();
			d.type = DrawCmdType.TEXTURE;
			d.texture = texture;
			d.filter = undefined;
			d.count = count;
			this.drawDataLen++;
		}
	}

	public pushChangeSmoothing(texture: WebGLTexture, smoothing: boolean): void {
		(texture as Record<string, unknown>)['__heronSmoothing'] = smoothing;
		const d = this._get();
		d.type = DrawCmdType.SMOOTHING;
		d.texture = texture;
		d.smoothing = smoothing;
		this.drawDataLen++;
	}

	public pushPushMask(count = 1): void {
		const d = this._get();
		d.type = DrawCmdType.PUSH_MASK;
		d.count = count * 2;
		this.drawDataLen++;
	}

	public pushPopMask(count = 1): void {
		const d = this._get();
		d.type = DrawCmdType.POP_MASK;
		d.count = count * 2;
		this.drawDataLen++;
	}

	public pushSetBlend(value: string): void {
		let drawState = false;
		for (let i = this.drawDataLen - 1; i >= 0; i--) {
			const d = this.drawData[i];
			if (d.type === DrawCmdType.TEXTURE || d.type === DrawCmdType.RECT) drawState = true;
			if (!drawState && d.type === DrawCmdType.BLEND) {
				this.drawData.splice(i, 1);
				this.drawDataLen--;
				continue;
			}
			if (d.type === DrawCmdType.BLEND) {
				if (d.value === value) return;
				break;
			}
		}
		const d = this._get();
		d.type = DrawCmdType.BLEND;
		d.value = value;
		this.drawDataLen++;
	}

	public pushResize(buffer: WebGLRenderBuffer, width: number, height: number): void {
		const d = this._get();
		d.type = DrawCmdType.RESIZE_TARGET;
		d.buffer = buffer;
		d.width = width;
		d.height = height;
		this.drawDataLen++;
	}

	public pushClearColor(): void {
		const d = this._get();
		d.type = DrawCmdType.CLEAR_COLOR;
		this.drawDataLen++;
	}

	public pushActivateBuffer(buffer: WebGLRenderBuffer): void {
		let drawState = false;
		for (let i = this.drawDataLen - 1; i >= 0; i--) {
			const d = this.drawData[i];
			if (d.type !== DrawCmdType.BLEND && d.type !== DrawCmdType.ACT_BUFFER) drawState = true;
			if (!drawState && d.type === DrawCmdType.ACT_BUFFER) {
				this.drawData.splice(i, 1);
				this.drawDataLen--;
				continue;
			}
		}
		const d = this._get();
		d.type = DrawCmdType.ACT_BUFFER;
		d.buffer = buffer;
		d.width = buffer.rootRenderTarget?.width ?? 0;
		d.height = buffer.rootRenderTarget?.height ?? 0;
		this.drawDataLen++;
	}

	public pushEnableScissor(x: number, y: number, width: number, height: number): void {
		const d = this._get();
		d.type = DrawCmdType.ENABLE_SCISSOR;
		d.x = x;
		d.y = y;
		d.width = width;
		d.height = height;
		this.drawDataLen++;
	}

	public pushDisableScissor(): void {
		const d = this._get();
		d.type = DrawCmdType.DISABLE_SCISSOR;
		this.drawDataLen++;
	}

	public clear(): void {
		for (let i = 0; i < this.drawDataLen; i++) {
			const d = this.drawData[i];
			d.type = DrawCmdType.TEXTURE;
			d.count = 0;
			d.texture = undefined;
			d.filter = undefined;
			d.value = '';
			d.buffer = undefined;
			d.width = 0;
			d.height = 0;
			d.textureWidth = 0;
			d.textureHeight = 0;
			d.smoothing = false;
			d.x = 0;
			d.y = 0;
		}
		this.drawDataLen = 0;
	}
}
