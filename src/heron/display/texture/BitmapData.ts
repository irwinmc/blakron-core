import { HashObject } from '../../utils/HashObject.js';
import { Base64Util } from '../../utils/Base64Util.js';
import type { DisplayObject } from '../DisplayObject.js';

/** Compressed texture data for a single mip level and face. */
export class CompressedTextureData {
	public glInternalFormat = 0;
	public width = 0;
	public height = 0;
	public byteArray: Uint8Array = new Uint8Array(0);
	public face = 0;
	public level = 0;
}

export class BitmapData extends HashObject {
	// ── Static fields ─────────────────────────────────────────────────────────

	private static _displayList = new Map<number, DisplayObject[]>();

	// ── Static methods ────────────────────────────────────────────────────────

	public static create(
		type: 'arraybuffer',
		data: ArrayBuffer,
		callback?: (bitmapData: BitmapData) => void,
	): BitmapData;
	public static create(type: 'base64', data: string, callback?: (bitmapData: BitmapData) => void): BitmapData;
	public static create(
		type: 'arraybuffer' | 'base64',
		data: ArrayBuffer | string,
		callback?: (bitmapData: BitmapData) => void,
	): BitmapData {
		const base64 = type === 'arraybuffer' ? Base64Util.encode(data as ArrayBuffer) : (data as string);
		let imageType = 'image/png';
		if (base64.charAt(0) === '/') imageType = 'image/jpeg';
		else if (base64.charAt(0) === 'R') imageType = 'image/gif';

		const img = new Image();
		img.src = `data:${imageType};base64,${base64}`;
		img.crossOrigin = '*';
		const bitmapData = new BitmapData(img);
		img.onload = () => {
			img.onload = null;
			bitmapData.source = img;
			bitmapData.width = img.width;
			bitmapData.height = img.height;
			callback?.(bitmapData);
		};
		return bitmapData;
	}

	static addDisplayObject(displayObject: DisplayObject, bitmapData: BitmapData | undefined): void {
		if (!bitmapData) return;
		const { hashCode } = bitmapData;
		if (!hashCode) return;
		const list = BitmapData._displayList.get(hashCode);
		if (!list) {
			BitmapData._displayList.set(hashCode, [displayObject]);
			return;
		}
		if (!list.includes(displayObject)) list.push(displayObject);
	}

	static removeDisplayObject(displayObject: DisplayObject, bitmapData: BitmapData | undefined): void {
		if (!bitmapData) return;
		const list = BitmapData._displayList.get(bitmapData.hashCode);
		if (!list) return;
		const i = list.indexOf(displayObject);
		if (i >= 0) list.splice(i, 1);
	}

	static invalidate(bitmapData: BitmapData | undefined): void {
		if (!bitmapData) return;
		const list = BitmapData._displayList.get(bitmapData.hashCode);
		if (!list) return;
		for (const node of list) {
			node.renderDirty = true;
			node.markDirty();
		}
	}

	static dispose(bitmapData: BitmapData | undefined): void {
		if (!bitmapData) return;
		const list = BitmapData._displayList.get(bitmapData.hashCode);
		if (!list) return;
		for (const node of list) {
			node.renderDirty = true;
			node.markDirty();
		}
		BitmapData._displayList.delete(bitmapData.hashCode);
	}

	// ── Instance fields ───────────────────────────────────────────────────────

	public width = 0;
	public height = 0;
	public format = 'image';
	public deleteSource = true;
	public readonly compressedTextureData: CompressedTextureData[][] = [];
	public debugCompressedTextureURL = '';
	public etcAlphaMask: BitmapData | undefined = undefined;

	/** @internal Cached WebGL texture, set by WebGLRenderContext. */
	public webGLTexture: WebGLTexture | undefined = undefined;

	/** The underlying image/canvas/video source. */
	private _source: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement | ArrayBuffer | undefined;

	// ── Constructor ───────────────────────────────────────────────────────────

	public constructor(source?: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement | ArrayBuffer) {
		super();
		if (source) {
			this._source = source;
			if (source instanceof ArrayBuffer) {
				// compressed texture — width/height set later
			} else {
				this.width = (source as HTMLImageElement).width ?? 0;
				this.height = (source as HTMLImageElement).height ?? 0;
			}
		}
	}

	// ── Getters / Setters ─────────────────────────────────────────────────────

	public get source(): HTMLImageElement | HTMLCanvasElement | HTMLVideoElement | ArrayBuffer | undefined {
		return this._source;
	}
	public set source(value: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement | ArrayBuffer | undefined) {
		this._source = value;
	}

	// ── Public methods ────────────────────────────────────────────────────────

	public dispose(): void {
		if (this._source && 'src' in this._source) {
			(this._source as HTMLImageElement).src = '';
		}
		this._source = undefined;
		this.clearCompressedTextureData();
		this.etcAlphaMask = undefined;
		BitmapData.dispose(this);
	}

	public getCompressed2dTextureData(): CompressedTextureData | undefined {
		return this.compressedTextureData[0]?.[0];
	}

	public setCompressed2dTextureData(levelData: CompressedTextureData[]): void {
		this.compressedTextureData.push(levelData);
	}

	public hasCompressed2d(): boolean {
		return !!this.getCompressed2dTextureData();
	}

	public clearCompressedTextureData(): void {
		this.compressedTextureData.length = 0;
	}
}
