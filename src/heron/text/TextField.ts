import { DisplayObject } from '../display/DisplayObject.js';
import type { Stage } from '../display/Stage.js';
import { Rectangle } from '../geom/index.js';
import { measureText, getFontString } from './TextMeasurer.js';
import type { ITextElement, ILineElement, IWTextElement } from './types/ITextElement.js';
import { HorizontalAlign } from './enums/HorizontalAlign.js';
import { VerticalAlign } from './enums/VerticalAlign.js';
import { TextFieldType } from './enums/TextFieldType.js';
import { TextFieldInputType } from './enums/TextFieldInputType.js';
import { InputController } from './InputController.js';

/**
 * TextField displays text content. Supports single-line, multi-line, word wrap,
 * rich text (textFlow), input mode, and basic styling.
 *
 * Simplified from Egret's TextField — uses normal properties instead of the
 * internal $TextField array-based storage.
 */
export class TextField extends DisplayObject {
	// ── Static fields ─────────────────────────────────────────────────────────

	public static default_fontFamily = 'Arial';
	public static default_size = 30;
	public static default_textColor = 0xffffff;

	// ── Instance fields ───────────────────────────────────────────────────────

	private _fontFamily = TextField.default_fontFamily;
	private _fontSize = TextField.default_size;
	private _bold = false;
	private _italic = false;
	private _textAlign: HorizontalAlign = HorizontalAlign.LEFT;
	private _verticalAlign: VerticalAlign = VerticalAlign.TOP;
	private _textColor = TextField.default_textColor;
	private _strokeColor = 0x000000;
	private _stroke = 0;
	private _lineSpacing = 0;
	private _wordWrap = false;
	private _multiline = false;
	private _type: TextFieldType = TextFieldType.DYNAMIC;
	private _inputType: TextFieldInputType = TextFieldInputType.TEXT;
	private _text = '';
	private _displayAsPassword = false;
	private _maxChars = 0;
	private _scrollV = 1;
	private _restrict: string | undefined = undefined;
	private _restrictAnd: string | undefined = undefined;
	private _restrictNot: string | undefined = undefined;
	private _border = false;
	private _borderColor = 0x000000;
	private _background = false;
	private _backgroundColor = 0xffffff;
	private _textFlow: ITextElement[] | undefined = undefined;
	private _textWidth = 0;
	private _textHeight = 0;
	private _numLines = 0;
	private _linesArr: ILineElement[] | undefined = undefined;
	private _textDirty = true;
	private _fontString = '';
	private _selectionAnchor = 0;
	private _selectionActive = 0;
	private _isTyping = false;
	private _inputController: InputController | undefined = undefined;

	// ── Constructor ───────────────────────────────────────────────────────────

	public constructor() {
		super();
		this.invalidateFontString();
	}

	// ── Getters / Setters ─────────────────────────────────────────────────────

	public get fontFamily(): string {
		return this._fontFamily;
	}
	public set fontFamily(value: string) {
		if (this._fontFamily !== value) {
			this._fontFamily = value;
			this.invalidateText();
		}
	}

	public get size(): number {
		return this._fontSize;
	}
	public set size(value: number) {
		if (this._fontSize !== value) {
			this._fontSize = value;
			this.invalidateText();
		}
	}

	public get bold(): boolean {
		return this._bold;
	}
	public set bold(value: boolean) {
		if (this._bold !== value) {
			this._bold = value;
			this.invalidateText();
		}
	}

	public get italic(): boolean {
		return this._italic;
	}
	public set italic(value: boolean) {
		if (this._italic !== value) {
			this._italic = value;
			this.invalidateText();
		}
	}

	public get textAlign(): HorizontalAlign {
		return this._textAlign;
	}
	public set textAlign(value: HorizontalAlign) {
		if (this._textAlign !== value) {
			this._textAlign = value;
			this.invalidateText();
		}
	}

	public get verticalAlign(): VerticalAlign {
		return this._verticalAlign;
	}
	public set verticalAlign(value: VerticalAlign) {
		if (this._verticalAlign !== value) {
			this._verticalAlign = value;
			this.invalidateText();
		}
	}

	public get textColor(): number {
		return this._textColor;
	}
	public set textColor(value: number) {
		if (this._textColor !== value) {
			this._textColor = value;
			this._inputController?.setColor(value);
			this.markDirty();
		}
	}

	public get strokeColor(): number {
		return this._strokeColor;
	}
	public set strokeColor(value: number) {
		if (this._strokeColor !== value) {
			this._strokeColor = value;
			this.markDirty();
		}
	}

	public get stroke(): number {
		return this._stroke;
	}
	public set stroke(value: number) {
		if (this._stroke !== value) {
			this._stroke = value;
			this.markDirty();
		}
	}

	public get lineSpacing(): number {
		return this._lineSpacing;
	}
	public set lineSpacing(value: number) {
		if (this._lineSpacing !== value) {
			this._lineSpacing = value;
			this.invalidateText();
		}
	}

	public get wordWrap(): boolean {
		return this._wordWrap;
	}
	public set wordWrap(value: boolean) {
		if (this._wordWrap !== value) {
			this._wordWrap = value;
			this.invalidateText();
		}
	}

	public get multiline(): boolean {
		return this._multiline;
	}
	public set multiline(value: boolean) {
		if (this._multiline !== value) {
			this._multiline = value;
			this.invalidateText();
		}
	}

	public get type(): TextFieldType {
		return this._type;
	}
	public set type(value: TextFieldType) {
		if (this._type === value) return;
		this._type = value;
		if (value === TextFieldType.INPUT) {
			if (!this._inputController) {
				this._inputController = new InputController(this);
			}
			this.touchEnabled = true;
			if (this.stage) {
				this._inputController.addStageText();
			}
		} else {
			if (this._inputController) {
				this._inputController.removeStageText();
				this._inputController = undefined;
			}
			this.touchEnabled = false;
		}
		this.markDirty();
	}

	public get inputType(): TextFieldInputType {
		return this._inputType;
	}
	public set inputType(value: TextFieldInputType) {
		this._inputType = value;
	}

	public get text(): string {
		if (this._type === TextFieldType.INPUT && this._inputController) {
			return this._inputController.getText();
		}
		return this._text;
	}
	public set text(value: string) {
		if (this._text === value) return;
		this._text = value;
		this._textFlow = undefined;
		if (this._inputController) {
			this._inputController.setText(value);
		}
		this.invalidateText();
	}

	public get displayAsPassword(): boolean {
		return this._displayAsPassword;
	}
	public set displayAsPassword(value: boolean) {
		if (this._displayAsPassword !== value) {
			this._displayAsPassword = value;
			this.invalidateText();
		}
	}

	public get maxChars(): number {
		return this._maxChars;
	}
	public set maxChars(value: number) {
		this._maxChars = value;
	}

	public get scrollV(): number {
		return Math.min(Math.max(this._scrollV, 1), this.maxScrollV);
	}
	public set scrollV(value: number) {
		value = Math.max(value, 1);
		if (this._scrollV !== value) {
			this._scrollV = value;
			this.markDirty();
		}
	}

	public get maxScrollV(): number {
		this.ensureLines();
		return Math.max(1, this._numLines);
	}

	public get numLines(): number {
		this.ensureLines();
		return this._numLines;
	}

	public get restrict(): string | undefined {
		return this._restrict;
	}
	public set restrict(value: string | undefined) {
		this._restrict = value;
		if (value === undefined) {
			this._restrictAnd = undefined;
			this._restrictNot = undefined;
		} else {
			// Find the first unescaped '^'
			let index = -1;
			let i = 0;
			while (i < value.length) {
				const pos = value.indexOf('^', i);
				if (pos < 0) break;
				if (pos === 0 || value.charAt(pos - 1) !== '\\') {
					index = pos;
					break;
				}
				i = pos + 1;
			}
			if (index === 0) {
				this._restrictAnd = undefined;
				this._restrictNot = value.substring(1);
			} else if (index > 0) {
				this._restrictAnd = value.substring(0, index);
				this._restrictNot = value.substring(index + 1);
			} else {
				this._restrictAnd = value;
				this._restrictNot = undefined;
			}
		}
	}

	/** @internal Parsed whitelist portion of restrict. */
	get restrictAnd(): string | undefined {
		return this._restrictAnd;
	}

	/** @internal Parsed blacklist portion of restrict. */
	get restrictNot(): string | undefined {
		return this._restrictNot;
	}

	public get border(): boolean {
		return this._border;
	}
	public set border(value: boolean) {
		if (this._border !== value) {
			this._border = value;
			this.markDirty();
		}
	}

	public get borderColor(): number {
		return this._borderColor;
	}
	public set borderColor(value: number) {
		if (this._borderColor !== value) {
			this._borderColor = value;
			this.markDirty();
		}
	}

	public get background(): boolean {
		return this._background;
	}
	public set background(value: boolean) {
		if (this._background !== value) {
			this._background = value;
			this.markDirty();
		}
	}

	public get backgroundColor(): number {
		return this._backgroundColor;
	}
	public set backgroundColor(value: number) {
		if (this._backgroundColor !== value) {
			this._backgroundColor = value;
			this.markDirty();
		}
	}

	public get textFlow(): ITextElement[] | undefined {
		return this._textFlow;
	}
	public set textFlow(value: ITextElement[] | undefined) {
		this._textFlow = value;
		if (value) {
			this._text = value.map(e => e.text).join('');
		}
		this.invalidateText();
	}

	public get textWidth(): number {
		this.ensureLines();
		return this._textWidth;
	}
	public get textHeight(): number {
		this.ensureLines();
		return this._textHeight;
	}

	/** @internal Font string for Canvas 2D rendering. */
	get fontString(): string {
		return this._fontString;
	}

	public get selectionBeginIndex(): number {
		return this._selectionAnchor;
	}
	public get selectionEndIndex(): number {
		return this._selectionActive;
	}
	public get caretIndex(): number {
		return this._selectionActive;
	}

	/** @internal Computed line layout data. */
	getLinesArr(): ILineElement[] {
		this.ensureLines();
		return this._linesArr ?? [];
	}

	// ── Public methods ────────────────────────────────────────────────────────

	public appendText(text: string): void {
		this.text = this._text + text;
	}

	public appendElement(element: ITextElement): void {
		const flow = this._textFlow ? [...this._textFlow] : [];
		flow.push(element);
		this.textFlow = flow;
	}

	public setFocus(): void {
		if (this._type === TextFieldType.INPUT && this.stage && this._inputController) {
			this._inputController.focus(true);
		}
	}

	public setSelection(beginIndex: number, endIndex: number): void {
		this._selectionAnchor = beginIndex;
		this._selectionActive = endIndex;
	}

	/** @internal Called by InputController when typing state changes. */
	setIsTyping(value: boolean): void {
		this._isTyping = value;
		this.renderDirty = true;
		this.markDirty();
	}

	public getLineHeight(): number {
		return this._fontSize + this._lineSpacing;
	}

	// ── Internal methods ──────────────────────────────────────────────────────

	override onAddToStage(stage: Stage, nestLevel: number): void {
		super.onAddToStage(stage, nestLevel);
		if (this._type === TextFieldType.INPUT && this._inputController) {
			this._inputController.addStageText();
		}
	}

	override onRemoveFromStage(): void {
		super.onRemoveFromStage();
		if (this._inputController) {
			this._inputController.removeStageText();
		}
	}

	override measureContentBounds(bounds: Rectangle): void {
		this.ensureLines();
		const w = !isNaN(this.explicitWidth) ? this.explicitWidth : this._textWidth;
		const h = !isNaN(this.explicitHeight) ? this.explicitHeight : this._textHeight;
		bounds.setTo(0, 0, w, h);
	}

	// ── Private methods ───────────────────────────────────────────────────────

	private invalidateText(): void {
		this._textDirty = true;
		this._linesArr = undefined;
		this.invalidateFontString();
		this.renderDirty = true;
		this.markDirty();
	}

	private invalidateFontString(): void {
		this._fontString = getFontString(this._fontSize, this._fontFamily, this._bold, this._italic);
	}

	private ensureLines(): void {
		if (!this._textDirty && this._linesArr) return;
		this._textDirty = false;
		this._linesArr = this.calculateLines();
		this._numLines = this._linesArr.length;

		let maxWidth = 0;
		let totalHeight = 0;
		for (let i = 0; i < this._linesArr.length; i++) {
			const line = this._linesArr[i];
			if (line.width > maxWidth) maxWidth = line.width;
			totalHeight += line.height;
			if (i > 0) totalHeight += this._lineSpacing;
		}
		this._textWidth = maxWidth;
		this._textHeight = totalHeight;
	}

	private calculateLines(): ILineElement[] {
		const elements = this._textFlow ?? [{ text: this.getDisplayText() }];
		const maxWidth = !isNaN(this.explicitWidth) ? this.explicitWidth : Infinity;
		const lines: ILineElement[] = [];

		let currentLine: IWTextElement[] = [];
		let lineWidth = 0;
		let lineHeight = this._fontSize;

		for (const element of elements) {
			const style = element.style;
			const fontSize = style?.size ?? this._fontSize;
			const fontFamily = style?.fontFamily ?? this._fontFamily;
			const bold = style?.bold ?? this._bold;
			const italic = style?.italic ?? this._italic;
			const text = element.text;

			for (let i = 0; i < text.length; i++) {
				const char = text[i];

				if (char === '\n') {
					lines.push(this.buildLine(currentLine, lineWidth, lineHeight));
					currentLine = [];
					lineWidth = 0;
					lineHeight = fontSize;
					continue;
				}

				const charWidth = measureText(char, fontFamily, fontSize, bold, italic);

				if (this._wordWrap && lineWidth + charWidth > maxWidth && currentLine.length > 0) {
					lines.push(this.buildLine(currentLine, lineWidth, lineHeight));
					currentLine = [];
					lineWidth = 0;
					lineHeight = fontSize;
				}

				currentLine.push({ text: char, width: charWidth, style });
				lineWidth += charWidth;
				if (fontSize > lineHeight) lineHeight = fontSize;
			}
		}

		if (currentLine.length > 0) {
			lines.push(this.buildLine(currentLine, lineWidth, lineHeight));
		}

		if (lines.length === 0) {
			lines.push({ width: 0, height: this._fontSize, charNum: 0, hasNextLine: false, elements: [] });
		}

		return lines;
	}

	private buildLine(elements: IWTextElement[], width: number, height: number): ILineElement {
		let charNum = 0;
		for (const e of elements) charNum += e.text.length;
		return { width, height, charNum, hasNextLine: true, elements };
	}

	private getDisplayText(): string {
		if (this._displayAsPassword) return '•'.repeat(this._text.length);
		return this._text;
	}
}
