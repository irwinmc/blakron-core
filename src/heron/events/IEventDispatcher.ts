import type { IHashObject } from '../utils/index.js';
import type { Event } from './Event.js';

export interface IEventDispatcher extends IHashObject {
	addEventListener(type: string, listener: (event: Event) => void, useCapture?: boolean, priority?: number): void;
	once(type: string, listener: (event: Event) => void, useCapture?: boolean, priority?: number): void;
	removeEventListener(type: string, listener: (event: Event) => void, useCapture?: boolean): void;
	hasEventListener(type: string): boolean;
	dispatchEvent(event: Event): boolean;
	willTrigger(type: string): boolean;
}
