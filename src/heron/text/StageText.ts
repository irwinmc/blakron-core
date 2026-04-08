import { EventDispatcher } from '../events/EventDispatcher.js';
import { Event } from '../events/Event.js';
import type { TextField } from './TextField.js';

/**
 * Manages a native HTML <input> or <textarea> element overlaid on the canvas
 * for text input. Dispatches 'updateText', 'focus', and 'blur' events.
 */
export class StageText extends EventDispatcher {
	private _textField: TextField | undefined = undefined;
	private _inputElement: HTMLInputElement | HTMLTextAreaElement | undefined = undefined;
	private _text = '';

	setTextField(textField: TextField): void {
		this._textField = textField;
	}

	getText(): string {
		return this._inputElement?.value ?? this._text;
	}

	setText(value: string): void {
		this._text = value;
		if (this._inputElement) this._inputElement.value = value;
	}

	setColor(value: number): void {
		if (this._inputElement) {
			const r = (value >> 16) & 0xff;
			const g = (value >> 8) & 0xff;
			const b = value & 0xff;
			this._inputElement.style.color = `rgb(${r},${g},${b})`;
		}
	}

	show(active = false): void {
		if (!this._textField) return;
		this.createInput();
		if (this._inputElement) {
			this._inputElement.style.display = 'block';
			if (active) this._inputElement.focus();
		}
	}

	hide(): void {
		if (this._inputElement) {
			this._inputElement.blur();
			this._inputElement.style.display = 'none';
		}
	}

	addToStage(): void {
		this.createInput();
	}

	removeFromStage(): void {
		if (this._inputElement?.parentElement) {
			this._inputElement.parentElement.removeChild(this._inputElement);
			this._inputElement = undefined;
		}
	}

	onBlur(): void {
		this.hide();
	}

	resetStageText(): void {
		if (!this._textField || !this._inputElement) return;
		const tf = this._textField;
		const el = this._inputElement;

		el.style.fontFamily = tf.fontFamily;
		el.style.fontSize = tf.size + 'px';
		el.style.fontWeight = tf.bold ? 'bold' : 'normal';
		el.style.fontStyle = tf.italic ? 'italic' : 'normal';
		el.style.textAlign = tf.textAlign;

		if (el instanceof HTMLInputElement) {
			el.type = tf.inputType;
			el.maxLength = tf.maxChars > 0 ? tf.maxChars : -1;
		}
	}

	private createInput(): void {
		if (this._inputElement) return;
		if (!this._textField) return;

		const tf = this._textField;
		const isMultiline = tf.multiline;

		const el = isMultiline ? document.createElement('textarea') : document.createElement('input');

		el.style.position = 'absolute';
		el.style.outline = 'none';
		el.style.border = 'none';
		el.style.background = 'transparent';
		el.style.padding = '0';
		el.style.margin = '0';
		el.style.display = 'none';
		el.style.zIndex = '10000';
		el.value = this._text;

		el.addEventListener('input', () => {
			this._text = el.value;
			this.dispatchEventWith('updateText');
		});

		el.addEventListener('focus', () => {
			this.dispatchEventWith('focus');
		});

		el.addEventListener('blur', () => {
			this.dispatchEventWith('blur');
		});

		// Append to canvas parent or body
		const canvas = tf.stage ? document.querySelector('canvas') : undefined;
		const container = canvas?.parentElement ?? document.body;
		container.appendChild(el);
		this._inputElement = el;

		this.resetStageText();
	}
}
