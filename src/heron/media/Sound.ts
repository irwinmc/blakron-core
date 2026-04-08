import { EventDispatcher } from '../events/EventDispatcher.js';
import { Event } from '../events/Event.js';
import { IOErrorEvent } from '../events/IOErrorEvent.js';
import { SoundChannel } from './SoundChannel.js';

export const SoundType = {
	MUSIC: 'music',
	EFFECT: 'effect',
} as const;

export type SoundType = (typeof SoundType)[keyof typeof SoundType];

// Shared AudioContext — created lazily on first use
let sharedContext: AudioContext | undefined;

function getAudioContext(): AudioContext | undefined {
	if (sharedContext) return sharedContext;
	try {
		sharedContext = new (
			window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
		)();
		return sharedContext;
	} catch {
		return undefined;
	}
}

// Serial decode queue — avoids concurrent decodeAudioData calls crashing on mobile
interface DecodeTask {
	buffer: ArrayBuffer;
	onSuccess: (buf: AudioBuffer) => void;
	onError: () => void;
}

const decodeQueue: DecodeTask[] = [];
let isDecoding = false;

function enqueueDecodeTask(task: DecodeTask): void {
	decodeQueue.push(task);
	processDecodeQueue();
}

function processDecodeQueue(): void {
	if (isDecoding || decodeQueue.length === 0) return;
	const ctx = getAudioContext();
	if (!ctx) {
		// No Web Audio — drain queue with errors
		while (decodeQueue.length) decodeQueue.shift()!.onError();
		return;
	}
	isDecoding = true;
	const task = decodeQueue.shift()!;
	ctx.decodeAudioData(
		task.buffer,
		buf => {
			task.onSuccess(buf);
			isDecoding = false;
			processDecodeQueue();
		},
		() => {
			task.onError();
			isDecoding = false;
			processDecodeQueue();
		},
	);
}

/**
 * Sound loads and plays audio.
 * Prefers Web Audio API for precise control and better mobile support.
 * Falls back to HTMLAudioElement when Web Audio API is unavailable.
 */
export class Sound extends EventDispatcher {
	// ── Instance fields ───────────────────────────────────────────────────────

	public type: SoundType = SoundType.EFFECT;

	private _audioBuffer: AudioBuffer | undefined = undefined;
	private _audio: HTMLAudioElement | undefined = undefined;
	private _url = '';
	private _loaded = false;

	// ── Getters ───────────────────────────────────────────────────────────────

	public get length(): number {
		if (this._audioBuffer) return this._audioBuffer.duration;
		if (this._audio) return this._audio.duration || 0;
		return 0;
	}

	// ── Public methods ────────────────────────────────────────────────────────

	public load(url: string): void {
		this._url = url;
		this._loaded = false;

		const ctx = getAudioContext();
		if (ctx) {
			this.loadWebAudio(ctx, url);
		} else {
			this.loadHtmlAudio(url);
		}
	}

	public play(startTime = 0, loops = 0): SoundChannel {
		if (!this._loaded) {
			// Return a no-op channel and dispatch an error, matching old Egret behaviour
			IOErrorEvent.dispatchIOErrorEvent(this);
			return new SoundChannel(undefined, undefined, undefined, 0, 0);
		}
		const ctx = getAudioContext();
		if (this._audioBuffer && ctx) {
			return new SoundChannel(ctx, this._audioBuffer, undefined, startTime, loops);
		}
		const audio = this._audio?.cloneNode(true) as HTMLAudioElement | undefined;
		return new SoundChannel(undefined, undefined, audio, startTime, loops);
	}

	public close(): void {
		this._audioBuffer = undefined;
		if (this._audio) {
			this._audio.src = '';
			this._audio = undefined;
		}
		this._loaded = false;
	}

	// ── Private methods ───────────────────────────────────────────────────────

	private loadWebAudio(ctx: AudioContext, url: string): void {
		const xhr = new XMLHttpRequest();
		xhr.open('GET', url, true);
		xhr.responseType = 'arraybuffer';

		xhr.onload = () => {
			if (xhr.status >= 400) {
				IOErrorEvent.dispatchIOErrorEvent(this);
				return;
			}
			enqueueDecodeTask({
				buffer: xhr.response as ArrayBuffer,
				onSuccess: buffer => {
					this._audioBuffer = buffer;
					this._loaded = true;
					this.dispatchEventWith(Event.COMPLETE);
				},
				onError: () => {
					// Decode failed — fall back to HTMLAudioElement
					this.loadHtmlAudio(url);
				},
			});
		};

		xhr.onerror = () => {
			IOErrorEvent.dispatchIOErrorEvent(this);
		};

		xhr.send();
	}

	private loadHtmlAudio(url: string): void {
		const audio = new Audio();
		this._audio = audio;

		audio.addEventListener(
			'canplaythrough',
			() => {
				this._loaded = true;
				this.dispatchEventWith(Event.COMPLETE);
			},
			{ once: true },
		);

		audio.addEventListener(
			'error',
			() => {
				IOErrorEvent.dispatchIOErrorEvent(this);
			},
			{ once: true },
		);

		audio.src = url;
		audio.load();
	}
}
