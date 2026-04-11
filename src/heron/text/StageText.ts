import { EventDispatcher } from '../events/EventDispatcher.js';
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

		// ── Font styles ───────────────────────────────────────────────────────
		// Scale font size by the canvas CSS scale so the input text matches
		// the rendered text size exactly.
		const scaleY = this.getCanvasScaleY();
		el.style.fontFamily = tf.fontFamily;
		el.style.fontSize = tf.size * scaleY + 'px';
		el.style.fontWeight = tf.bold ? 'bold' : 'normal';
		el.style.fontStyle = tf.italic ? 'italic' : 'normal';
		el.style.textAlign = tf.textAlign;
		el.style.color = this.colorString(tf.textColor);

		if (el instanceof HTMLInputElement) {
			el.type = tf.inputType;
			if (tf.maxChars > 0) el.maxLength = tf.maxChars;
		}

		// ── Position ──────────────────────────────────────────────────────────
		// Convert TextField's local origin to stage (global) coords, then to
		// CSS pixels using the canvas bounding rect.
		const globalPos = tf.localToGlobal(0, 0);
		const canvas = this.getCanvas();
		if (canvas) {
			const rect = canvas.getBoundingClientRect();
			// canvas.width is the logical pixel size; rect.width is the CSS size
			const cssScaleX = rect.width / (canvas.width || 1);
			const cssScaleY = rect.height / (canvas.height || 1);
			el.style.left = rect.left + globalPos.x * cssScaleX + 'px';
			el.style.top = rect.top + globalPos.y * cssScaleY + 'px';
			el.style.width = tf.width * cssScaleX + 'px';
			el.style.height = tf.height * cssScaleY + 'px';
		} else {
			el.style.left = globalPos.x + 'px';
			el.style.top = globalPos.y + 'px';
			el.style.width = tf.width + 'px';
			el.style.height = tf.height + 'px';
		}
	}

	// ── Private ───────────────────────────────────────────────────────────────

	private createInput(): void {
		if (this._inputElement) return;
		if (!this._textField) return;

		const tf = this._textField;
		const el = tf.multiline ? document.createElement('textarea') : document.createElement('input');

		el.style.position = 'fixed';
		el.style.outline = 'none';
		el.style.border = 'none';
		el.style.background = 'transparent';
		el.style.padding = '0';
		el.style.margin = '0';
		el.style.display = 'none';
		el.style.zIndex = '10000';
		el.style.boxSizing = 'border-box';
		el.value = this._text;

		el.addEventListener('input', () => {
			this._text = el.value;
			this.dispatchEventWith('updateText');
		});
		el.addEventListener('focus', () => this.dispatchEventWith('focus'));
		el.addEventListener('blur', () => this.dispatchEventWith('blur'));

		document.body.appendChild(el);
		this._inputElement = el;

		this.resetStageText();
	}

	private getCanvas(): HTMLCanvasElement | undefined {
		const stage = this._textField?.stage;
		if (!stage) return undefined;
		// Walk up from the stage's canvas — ScreenAdapter sets canvas.width/height
		// We find the canvas by querying the document
		return (document.querySelector('canvas') as HTMLCanvasElement | undefined) ?? undefined;
	}

	private getCanvasScaleY(): number {
		const canvas = this.getCanvas();
		if (!canvas) return 1;
		const rect = canvas.getBoundingClientRect();
		return rect.height / (canvas.height || 1);
	}

	private colorString(color: number): string {
		const r = (color >> 16) & 0xff;
		const g = (color >> 8) & 0xff;
		const b = color & 0xff;
		return `rgb(${r},${g},${b})`;
	}
}
