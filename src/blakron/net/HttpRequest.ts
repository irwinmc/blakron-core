import { EventDispatcher } from '../events/EventDispatcher.js';
import { Event } from '../events/Event.js';
import { IOErrorEvent } from '../events/IOErrorEvent.js';
import { ProgressEvent } from '../events/ProgressEvent.js';
import { HttpMethod } from './HttpMethod.js';
import { HttpResponseType } from './HttpResponseType.js';

export class HttpRequest extends EventDispatcher {
	// ── Instance fields ───────────────────────────────────────────────────────

	public responseType: HttpResponseType = HttpResponseType.TEXT;
	public withCredentials = false;
	public timeout = 0;

	private _xhr: XMLHttpRequest | undefined = undefined;
	private _url = '';
	private _method: HttpMethod = HttpMethod.GET;

	// ── Getters ───────────────────────────────────────────────────────────────

	public get response(): string | ArrayBuffer | undefined {
		return this._xhr?.response;
	}

	// ── Public methods ────────────────────────────────────────────────────────

	public open(url: string, method: HttpMethod = HttpMethod.GET): void {
		this.abort();
		this._url = url;
		this._method = method;
	}

	public send(data?: string | ArrayBuffer | FormData): void {
		const xhr = new XMLHttpRequest();
		this._xhr = xhr;

		xhr.responseType = this.responseType as XMLHttpRequestResponseType;
		xhr.withCredentials = this.withCredentials;
		if (this.timeout > 0) xhr.timeout = this.timeout;

		xhr.onload = () => {
			this.dispatchEventWith(Event.COMPLETE);
		};
		xhr.onerror = () => {
			IOErrorEvent.dispatchIOErrorEvent(this);
		};
		xhr.ontimeout = () => {
			IOErrorEvent.dispatchIOErrorEvent(this);
		};
		xhr.onprogress = e => {
			ProgressEvent.dispatchProgressEvent(this, ProgressEvent.PROGRESS, e.loaded, e.total);
		};

		xhr.open(this._method, this._url, true);
		xhr.send(data);
	}

	public abort(): void {
		if (this._xhr) {
			this._xhr.abort();
			this._xhr = undefined;
		}
	}

	public getAllResponseHeaders(): string {
		return this._xhr?.getAllResponseHeaders() ?? '';
	}

	public setRequestHeader(header: string, value: string): void {
		this._xhr?.setRequestHeader(header, value);
	}

	public getResponseHeader(header: string): string {
		return this._xhr?.getResponseHeader(header) ?? '';
	}
}
