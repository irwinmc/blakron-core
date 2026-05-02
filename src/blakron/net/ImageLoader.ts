import { EventDispatcher } from '../events/EventDispatcher.js';
import { Event } from '../events/Event.js';
import { IOErrorEvent } from '../events/IOErrorEvent.js';
import { BitmapData } from '../display/texture/BitmapData.js';

export class ImageLoader extends EventDispatcher {
	// ── Static fields ─────────────────────────────────────────────────────────

	public static crossOrigin?: string;

	// ── Instance fields ───────────────────────────────────────────────────────

	public data?: BitmapData;
	public crossOrigin?: string = ImageLoader.crossOrigin;

	private _img?: HTMLImageElement;

	// ── Public methods ────────────────────────────────────────────────────────

	public load(url: string): void {
		if (this._img) {
			this._img.onload = null;
			this._img.onerror = null;
		}

		const img = new Image();
		this._img = img;

		if (this.crossOrigin) img.crossOrigin = this.crossOrigin;

		img.onload = () => {
			this.data = new BitmapData(img);
			this.dispatchEventWith(Event.COMPLETE);
		};
		img.onerror = () => {
			IOErrorEvent.dispatchIOErrorEvent(this);
		};

		img.src = url;
	}
}
