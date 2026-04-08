namespace heron {
	export interface IHashObject {
		hashCode: number;
	}

	let $hashCount: number = 1;

	export class HashObject implements IHashObject {
		public constructor() {
			this._hashCode = $hashCount++;
		}

		private _hashCode: number;

		public get hashCode(): number {
			return this._hashCode;
		}
	}
}

namespace heron {
	export const enum EventPhase {
		CAPTURING_PHASE = 1,
		AT_TARGET = 2,
		BUBBLING_PHASE = 3,
	}

	export interface IEventDispatcher {
		addEventListener(type: string, listener: (event: Event) => void, useCapture?: boolean, priority?: number): void;
		once(type: string, listener: (event: Event) => void, useCapture?: boolean, priority?: number): void;
		removeEventListener(type: string, listener: (event: Event) => void, useCapture?: boolean): void;
		hasEventListener(type: string): boolean;
		dispatchEvent(event: Event): boolean;
		willTrigger(type: string): boolean;
	}

	export class Event extends HashObject {
		static readonly ADDED_TO_STAGE: string = 'addedToStage';
		static readonly REMOVED_FROM_STAGE: string = 'removedFromStage';
		static readonly ADDED: string = 'added';
		static readonly REMOVED: string = 'removed';
		static readonly ENTER_FRAME: string = 'enterFrame';
		static readonly RENDER: string = 'render';
		static readonly RESIZE: string = 'resize';
		static readonly CHANGE: string = 'change';
		static readonly CHANGING: string = 'changing';
		static readonly COMPLETE: string = 'complete';
		static readonly LOOP_COMPLETE: string = 'loopComplete';
		static readonly FOCUS_IN: string = 'focusIn';
		static readonly FOCUS_OUT: string = 'focusOut';
		static readonly ENDED: string = 'ended';
		static readonly ACTIVATE: string = 'activate';
		static readonly DEACTIVATE: string = 'deactivate';
		static readonly CLOSE: string = 'close';
		static readonly CONNECT: string = 'connect';
		static readonly LEAVE_STAGE: string = 'leaveStage';
		static readonly SOUND_COMPLETE: string = 'soundComplete';

		public constructor(type: string, bubbles?: boolean, cancelable?: boolean, data?: unknown) {
			super();
			this._type = type;
			this._bubbles = !!bubbles;
			this._cancelable = !!cancelable;
			this.data = data;
		}

		public data: unknown;

		private _type: string;
		public get type(): string {
			return this._type;
		}

		private _bubbles: boolean;
		public get bubbles(): boolean {
			return this._bubbles;
		}

		private _cancelable: boolean;
		public get cancelable(): boolean {
			return this._cancelable;
		}

		private _eventPhase: number = EventPhase.AT_TARGET;
		public get eventPhase(): number {
			return this._eventPhase;
		}

		private _currentTarget: IEventDispatcher | undefined;
		public get currentTarget(): IEventDispatcher | undefined {
			return this._currentTarget;
		}

		private _target: IEventDispatcher | undefined;
		public get target(): IEventDispatcher | undefined {
			return this._target;
		}

		private _isDefaultPrevented: boolean = false;
		public get isDefaultPrevented(): boolean {
			return this._isDefaultPrevented;
		}

		private _isPropagationStopped: boolean = false;
		public get isPropagationStopped(): boolean {
			return this._isPropagationStopped;
		}

		private _isPropagationImmediateStopped: boolean = false;
		public get isPropagationImmediateStopped(): boolean {
			return this._isPropagationImmediateStopped;
		}

		public preventDefault(): void {
			if (this._cancelable) this._isDefaultPrevented = true;
		}

		public stopPropagation(): void {
			if (this._bubbles) this._isPropagationStopped = true;
		}

		public stopImmediatePropagation(): void {
			if (this._bubbles) this._isPropagationImmediateStopped = true;
		}

		internalReset(type: string, bubbles?: boolean, cancelable?: boolean): void {
			this._type = type;
			this._bubbles = !!bubbles;
			this._cancelable = !!cancelable;
			this._eventPhase = EventPhase.AT_TARGET;
			this._isDefaultPrevented = false;
			this._isPropagationStopped = false;
			this._isPropagationImmediateStopped = false;
			this._currentTarget = undefined;
			this._target = undefined;
			this.data = undefined;
		}

		setTarget(target: IEventDispatcher | undefined): void {
			this._target = target;
		}

		setCurrentTarget(currentTarget: IEventDispatcher | undefined): void {
			this._currentTarget = currentTarget;
		}
	}
}

namespace heron.sys {
	export interface ListenerEntry {
		type: string;
		listener: (event: heron.Event) => void;
		priority: number;
		useCapture: boolean;
		once: boolean;
	}
}

namespace heron {
	let ONCE_LIST: sys.ListenerEntry[] = [];

	export class EventDispatcher extends HashObject implements IEventDispatcher {
		public constructor(target?: IEventDispatcher) {
			super();
			this._target = target ?? this;
			this._listeners = new Map();
			this._captureListeners = new Map();
			this._notifyLevel = 0;
		}

		private _target: IEventDispatcher;
		private _listeners: Map<string, sys.ListenerEntry[]>;
		private _captureListeners: Map<string, sys.ListenerEntry[]>;
		private _notifyLevel: number;

		private getMap(useCapture?: boolean): Map<string, sys.ListenerEntry[]> {
			return useCapture ? this._captureListeners : this._listeners;
		}

		public addEventListener(
			type: string,
			listener: (event: Event) => void,
			useCapture?: boolean,
			priority?: number,
		): void {
			this.$addListener(type, listener, useCapture, priority, false);
		}

		public once(
			type: string,
			listener: (event: Event) => void,
			useCapture?: boolean,
			priority?: number,
		): void {
			this.$addListener(type, listener, useCapture, priority, true);
		}

		public removeEventListener(type: string, listener: (event: Event) => void, useCapture?: boolean): void {
			const map = this.getMap(useCapture);
			const list = map.get(type);
			if (!list) return;

			let workList = list;
			if (this._notifyLevel !== 0) {
				workList = list.slice();
				map.set(type, workList);
			}

			this.$removeEntry(workList, listener);
			if (workList.length === 0) {
				map.delete(type);
			}
		}

		public hasEventListener(type: string): boolean {
			return this._listeners.has(type) || this._captureListeners.has(type);
		}

		public willTrigger(type: string): boolean {
			return this.hasEventListener(type);
		}

		public dispatchEvent(event: Event): boolean {
			event.setCurrentTarget(this._target);
			event.setTarget(this._target);
			return this.$notifyListener(event, false);
		}

		public dispatchEventWith(type: string, bubbles?: boolean, data?: unknown): boolean {
			if (!bubbles && !this.hasEventListener(type)) {
				return true;
			}
			const event = new Event(type, bubbles);
			event.data = data;
			const result = this.dispatchEvent(event);
			return result;
		}

		$addListener(
			type: string,
			listener: (event: Event) => void,
			useCapture?: boolean,
			priority?: number,
			once?: boolean,
		): void {
			const map = this.getMap(useCapture);
			let list = map.get(type);
			if (!list) {
				list = [];
				map.set(type, list);
			} else if (this._notifyLevel !== 0) {
				list = list.slice();
				map.set(type, list);
			}

			this.$insertEntry(list, {
				type,
				listener,
				priority: (priority ?? 0) | 0,
				useCapture: !!useCapture,
				once: !!once,
			});
		}

		$insertEntry(list: sys.ListenerEntry[], entry: sys.ListenerEntry): boolean {
			let insertIndex = -1;
			for (let i = 0; i < list.length; i++) {
				const existing = list[i];
				if (existing.listener === entry.listener && existing.useCapture === entry.useCapture) {
					return false;
				}
				if (insertIndex === -1 && existing.priority < entry.priority) {
					insertIndex = i;
				}
			}
			if (insertIndex !== -1) {
				list.splice(insertIndex, 0, entry);
			} else {
				list.push(entry);
			}
			return true;
		}

		$removeEntry(list: sys.ListenerEntry[], listener: (event: Event) => void): boolean {
			for (let i = 0; i < list.length; i++) {
				if (list[i].listener === listener) {
					list.splice(i, 1);
					return true;
				}
			}
			return false;
		}

		$notifyListener(event: Event, capturePhase: boolean): boolean {
			const map = this.getMap(capturePhase);
			const list = map.get(event.type);
			if (!list || list.length === 0) return true;

			const onceList = ONCE_LIST;
			this._notifyLevel++;

			for (let i = 0; i < list.length; i++) {
				const entry = list[i];
				entry.listener.call(undefined, event);
				if (entry.once) {
					onceList.push(entry);
				}
				if (event.isPropagationImmediateStopped) {
					break;
				}
			}

			this._notifyLevel--;

			while (onceList.length) {
				const entry = onceList.pop()!;
				this.removeEventListener(entry.type, entry.listener, entry.useCapture);
			}

			return !event.isDefaultPrevented;
		}
	}
}

export { heron };
