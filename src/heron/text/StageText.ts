import { EventDispatcher } from '../events/EventDispatcher.js';
import type { TextField } from './TextField.js';

/**
 * Manages a native HTML <input> or <textarea> element overlaid on the canvas
 * for text input. Follows Egret's pattern:
 *
 * - A wrapper div (_inputDiv) is positioned at the TextField's global coords.
 * - The actual <input>/<textarea> lives inside that div.
 * - The input element starts with opacity:0 (invisible) and is revealed on focus.
 * - On blur, the element is hidden and moved off-screen.
 *
 * Dispatches 'updateText', 'focus', and 'blur' events.
 */
export class StageText extends EventDispatcher {
	// ── Instance fields ───────────────────────────────────────────────────────

	private _textField: TextField | undefined = undefined;
	private _inputElement: HTMLInputElement | HTMLTextAreaElement | undefined = undefined;
	private _inputDiv: HTMLDivElement | undefined = undefined;
	private _text = '';

	/** Accumulated global scale (stageScale × displayObject hierarchy scale) */
	private _gscaleX = 1;
	private _gscaleY = 1;

	/** IME composition lock */
	private _compositionLock = false;

	/** Guard against re-entrant clearInputElement calls triggered by el.blur() */
	private _clearing = false;

	// ── Public API ─────────────────────────────────────────────────────────────

	setTextField(textField: TextField): void {
		this._textField = textField;
	}

	getText(): string {
		return this._text;
	}

	setText(value: string): void {
		this._text = value;
		if (this._inputElement) this._inputElement.value = value;
	}

	setColor(value: number): void {
		if (this._inputElement) {
			this._inputElement.style.color = colorString(value);
		}
	}

	/**
	 * Makes the native input visible and optionally focuses it.
	 * Called by InputController when the TextField is tapped.
	 */
	show(active = false): void {
		if (!this._textField) return;
		this.ensureElements();
		this.initElementPosition();
		this.executeShow();
	}

	/**
	 * Hides the native input (blur + opacity:0).
	 */
	hide(): void {
		this.clearInputElement();
	}

	addToStage(): void {
		this.ensureElements();
	}

	removeFromStage(): void {
		this.clearInputElement();
		if (this._inputDiv?.parentElement) {
			this._inputDiv.parentElement.removeChild(this._inputDiv);
			this._inputDiv = undefined;
		}
		this._inputElement = undefined;
	}

	onBlur(): void {
		// clearInputElement is already called from the native blur event listener.
		// Nothing extra needed here.
	}

	/**
	 * Updates the native input element's styles and position to match
	 * the current TextField state. Called every frame while focused,
	 * and when the TextField's properties change.
	 */
	resetStageText(): void {
		if (!this._textField || !this._inputElement || !this._inputDiv) return;
		const tf = this._textField;
		const el = this._inputElement;

		// ── Compute global scale ────────────────────────────────────────────
		// stageScale = canvas CSS width / stage.stageWidth
		// Then multiply by accumulated display-object hierarchy scale
		const canvas = this.getCanvas();
		const stage = tf.stage;
		if (canvas && stage) {
			const rect = canvas.getBoundingClientRect();
			const stageScaleX = rect.width / (stage.stageWidth || 1);
			const stageScaleY = rect.height / (stage.stageHeight || 1);

			// Walk up the display list to accumulate scaleX/Y
			let cX = 1;
			let cY = 1;
			let node: typeof tf | undefined = tf;
			while (node) {
				cX *= node.scaleX;
				cY *= node.scaleY;
				node = (node as any).parent;
			}

			this._gscaleX = stageScaleX * cX;
			this._gscaleY = stageScaleY * cY;
		}

		// ── Font styles ─────────────────────────────────────────────────────
		el.style.fontFamily = tf.fontFamily;
		el.style.fontSize = tf.size * this._gscaleY + 'px';
		el.style.fontWeight = tf.bold ? 'bold' : 'normal';
		el.style.fontStyle = tf.italic ? 'italic' : 'normal';
		el.style.textAlign = tf.textAlign;
		el.style.color = colorString(tf.textColor);

		if (el instanceof HTMLInputElement) {
			el.type = tf.inputType;
			if (tf.maxChars > 0) {
				el.setAttribute('maxlength', String(tf.maxChars));
			} else {
				el.removeAttribute('maxlength');
			}
		}

		// ── Width with scale correction ─────────────────────────────────────
		// If the TextField is scaled non-uniformly, we compensate with CSS transform
		let tw: number;
		if (tf.stage) {
			const globalX = tf.localToGlobal(0, 0).x;
			tw = Math.min(tf.width, tf.stage.stageWidth - globalX);
		} else {
			tw = tf.width;
		}

		const inputWidth = tw * this._gscaleX;
		const rawScaleRatio = this._gscaleX / this._gscaleY;
		const scale = isFinite(rawScaleRatio) ? rawScaleRatio : 1;

		el.style.width = inputWidth / scale + 'px';
		el.style.transform = `scale(${scale}, 1)`;
		el.style.left = `${((scale - 1) * inputWidth) / scale / 2}px`;

		// ── Height & vertical padding ───────────────────────────────────────
		el.style.verticalAlign = tf.verticalAlign;

		if (tf.multiline) {
			this.setAreaHeight(tf, el);
		} else {
			el.style.lineHeight = tf.size * this._gscaleY + 'px';
			if (tf.height < tf.size) {
				el.style.height = tf.size * this._gscaleY + 'px';
				el.style.padding = `0px 0px ${(tf.size / 2) * this._gscaleY}px 0px`;
			} else {
				el.style.height = tf.size * this._gscaleY + 'px';
				const rap = (tf.height - tf.size) * this._gscaleY;
				// valign: 0=top, 0.5=middle, 1=bottom
				const valign = tf.verticalAlign === 'middle' ? 0.5 : tf.verticalAlign === 'bottom' ? 1 : 0;
				const top = rap * valign;
				let bottom = rap - top;
				if (bottom < (tf.size / 2) * this._gscaleY) {
					bottom = (tf.size / 2) * this._gscaleY;
				}
				el.style.padding = `${top}px 0px ${bottom}px 0px`;
			}
		}

		// ── Wrapper div clip ────────────────────────────────────────────────
		this._inputDiv.style.clip = `rect(0px ${tf.width * this._gscaleX}px ${tf.height * this._gscaleY}px 0px)`;
		this._inputDiv.style.height = tf.height * this._gscaleY + 'px';
		this._inputDiv.style.width = tw * this._gscaleX + 'px';
	}

	// ── Private ───────────────────────────────────────────────────────────────

	/**
	 * Creates the wrapper div and input element if they don't exist yet.
	 */
	private ensureElements(): void {
		if (this._inputDiv && this._inputElement) return;
		if (!this._textField) return;

		// Create wrapper div (like Egret's _inputDIV)
		if (!this._inputDiv) {
			const div = document.createElement('div');
			div.style.position = 'fixed';
			div.style.left = '0px';
			div.style.top = '-100px'; // off-screen initially
			div.style.border = 'none';
			div.style.padding = '0';
			div.style.margin = '0';
			div.style.width = '0px';
			div.style.height = '0px';
			div.style.overflow = 'hidden';
			div.style.transformOrigin = '0% 0% 0px';
			div.style.zIndex = '10000';
			document.body.appendChild(div);
			this._inputDiv = div;
		}

		// Create input element
		if (!this._inputElement) {
			const tf = this._textField;
			const el = tf.multiline ? document.createElement('textarea') : document.createElement('input');

			if (el instanceof HTMLTextAreaElement) {
				el.style.resize = 'none';
			}

			el.style.position = 'absolute';
			el.style.left = '0px';
			el.style.top = '0px';
			el.style.border = 'none';
			el.style.padding = '0';
			el.style.margin = '0';
			el.style.outline = 'thin';
			el.style.background = 'none transparent';
			el.style.overflow = 'hidden';
			el.style.wordBreak = 'break-all';
			el.style.boxSizing = 'border-box';

			// Hidden initially (Egret pattern: opacity 0)
			el.style.opacity = '0';

			el.value = this._text;

			// Input events with IME composition support
			el.addEventListener('input', () => {
				if (!this._compositionLock) {
					this.onTextInput();
				}
			});
			el.addEventListener('compositionstart', () => {
				this._compositionLock = true;
			});
			el.addEventListener('compositionend', () => {
				this._compositionLock = false;
				this.onTextInput();
			});

			el.addEventListener('focus', () => this.dispatchEventWith('focus'));
			el.addEventListener('blur', () => {
				// Dispatch blur first so InputController can read the final text value,
				// then clear the element. clearInputElement is guarded against re-entry.
				this.dispatchEventWith('blur');
				this.clearInputElement();
			});

			this._inputDiv.appendChild(el);
			this._inputElement = el;
		}

		this.resetStageText();
	}

	/**
	 * Positions the wrapper div at the TextField's global coordinates.
	 * Equivalent to Egret's _initElement().
	 */
	private initElementPosition(): void {
		if (!this._textField || !this._inputDiv) return;
		const tf = this._textField;

		const point = tf.localToGlobal(0, 0);
		const x = point.x;
		const y = point.y;

		const canvas = this.getCanvas();
		const stage = tf.stage;
		let scaleX = 1;
		let scaleY = 1;
		let canvasLeft = 0;
		let canvasTop = 0;
		if (canvas && stage) {
			const rect = canvas.getBoundingClientRect();
			scaleX = rect.width / (stage.stageWidth || 1);
			scaleY = rect.height / (stage.stageHeight || 1);
			canvasLeft = rect.left;
			canvasTop = rect.top;
		}

		this._inputDiv.style.left = canvasLeft + x * scaleX + 'px';
		this._inputDiv.style.top = canvasTop + y * scaleY + 'px';

		// Adjust top for multiline
		if (tf.multiline && tf.height > tf.size && this._inputElement) {
			this._inputElement.style.top = `${(-tf.lineSpacing / 2) * scaleY}px`;
		} else if (this._inputElement) {
			this._inputElement.style.top = '0px';
		}

		// Handle rotation from display hierarchy
		let rotation = 0;
		let node: typeof tf | undefined = tf;
		while (node) {
			rotation += (node as any).rotation ?? 0;
			node = (node as any).parent;
		}
		this._inputDiv.style.transform = `rotate(${rotation}deg)`;
	}

	/**
	 * Shows the input element (opacity 1), sets value, focuses.
	 * Equivalent to Egret's executeShow().
	 */
	private executeShow(): void {
		const el = this._inputElement;
		if (!el) return;

		if (el.value !== this._text) {
			el.value = this._text;
		}

		this.resetStageText();

		// Move cursor to end
		el.selectionStart = el.value.length;
		el.selectionEnd = el.value.length;

		// Reveal
		el.style.opacity = '1';
		el.focus();
	}

	/**
	 * Hides the input element and resets it to the off-screen state.
	 * Equivalent to Egret's clearInputElement().
	 */
	private clearInputElement(): void {
		if (this._clearing) return;
		this._clearing = true;

		const el = this._inputElement;
		const div = this._inputDiv;

		if (el) {
			el.value = '';
			el.style.width = '1px';
			el.style.height = '12px';
			el.style.left = '0px';
			el.style.top = '0px';
			el.style.opacity = '0';
			// Remove blur listener temporarily to avoid re-entrant clearInputElement call
			el.blur();
		}

		if (div) {
			div.style.left = '0px';
			div.style.top = '-100px';
			div.style.height = '0px';
			div.style.width = '0px';
		}

		this._clearing = false;
	}

	/**
	 * Sets the height and padding for multiline text areas.
	 */
	private setAreaHeight(tf: TextField, el: HTMLElement): void {
		if (tf.height <= tf.size) {
			el.style.height = tf.size * this._gscaleY + 'px';
			el.style.padding = '0px';
			el.style.lineHeight = tf.size * this._gscaleY + 'px';
		} else {
			// Use the TextField height as the area height
			el.style.height = tf.height * this._gscaleY + 'px';
			const valign = tf.verticalAlign === 'middle' ? 0.5 : tf.verticalAlign === 'bottom' ? 1 : 0;
			const rap = (tf.height - tf.size) * this._gscaleY;
			const top = rap * valign;
			const bottom = rap - top;
			el.style.padding = `${top}px 0px ${bottom}px 0px`;
			el.style.lineHeight = tf.size * this._gscaleY + 'px';
		}
	}

	private onTextInput(): void {
		if (this._inputElement) {
			this._text = this._inputElement.value;
			this.dispatchEventWith('updateText');
		}
	}

	private getCanvas(): HTMLCanvasElement | undefined {
		return (document.querySelector('canvas') as HTMLCanvasElement | undefined) ?? undefined;
	}
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function colorString(color: number): string {
	const r = (color >> 16) & 0xff;
	const g = (color >> 8) & 0xff;
	const b = color & 0xff;
	return `rgb(${r},${g},${b})`;
}
