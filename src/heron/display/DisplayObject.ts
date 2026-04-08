import { EventDispatcher } from '../events/EventDispatcher.js';
import { Event } from '../events/Event.js';
import { EventPhase } from '../events/EventPhase.js';
import { Matrix, Point, Rectangle, sharedMatrix, sharedRectangle } from '../geom/index.js';
import { blendModeToNumber, numberToBlendMode } from './enums/index.js';
import type { Filter } from '../filters/index.js';
import type { DisplayObjectContainer } from './DisplayObjectContainer.js';
import type { Stage } from './Stage.js';
import { DisplayList } from '../player/DisplayList.js';

function clampRotation(value: number): number {
	value %= 360;
	if (value > 180) value -= 360;
	else if (value < -180) value += 360;
	return value;
}

/** @internal Render mode hint for the renderer. */
export const enum RenderMode {
	NONE = 1,
	FILTER = 2,
	CLIP = 3,
	SCROLLRECT = 4,
}

export class DisplayObject extends EventDispatcher {
	// ── Static fields ─────────────────────────────────────────────────────────

	static defaultTouchEnabled = false;
	static enterFrameCallBackList: DisplayObject[] = [];
	static renderCallBackList: DisplayObject[] = [];

	// ── Instance fields ───────────────────────────────────────────────────────

	/** @internal */ hasAddToStage = false;
	/** @internal */ children: DisplayObject[] | undefined = undefined;
	/** @internal */ internalStage: Stage | undefined = undefined;
	/** @internal */ nestLevel = 0;
	/** @internal */ useTranslate = false;
	/** @internal */ cacheDirty = false;
	/** @internal */ renderDirty = false;
	/** @internal */ renderMode: RenderMode | undefined = undefined;
	/** @internal */ maskedObject: DisplayObject | undefined = undefined;
	/** @internal */ sortDirty = false;
	/** @internal */ lastSortedIndex = 0;
	/** @internal */ tintRGB = 0;
	/** @internal */ internalParent: DisplayObjectContainer | undefined = undefined;
	/** @internal */ internalX = 0;
	/** @internal */ internalY = 0;
	/** @internal */ explicitWidth: number = NaN;
	/** @internal */ explicitHeight: number = NaN;
	/** @internal */ internalAnchorOffsetX = 0;
	/** @internal */ internalAnchorOffsetY = 0;
	/** @internal */ internalVisible = true;
	/** @internal */ internalAlpha = 1;
	/** @internal */ internalTouchEnabled: boolean = DisplayObject.defaultTouchEnabled;
	/** @internal */ internalScrollRect: Rectangle | undefined = undefined;
	/** @internal */ internalBlendMode = 0;
	/** @internal */ internalMask: DisplayObject | undefined = undefined;
	/** @internal */ internalMaskRect: Rectangle | undefined = undefined;
	/** @internal */ internalCacheAsBitmap = false;
	/** @internal */ internalFilters: Filter[] = [];
	/** @internal */ displayList: DisplayList | undefined = undefined;

	private _name = '';
	private _matrix: Matrix = new Matrix();
	private _matrixDirty = false;
	private _concatenatedMatrix: Matrix | undefined = undefined;
	private _invertedConcatenatedMatrix: Matrix | undefined = undefined;
	private _scaleX = 1;
	private _scaleY = 1;
	private _rotation = 0;
	private _skewX = 0;
	private _skewXdeg = 0;
	private _skewY = 0;
	private _skewYdeg = 0;
	private _tint = 0xffffff;
	private _zIndex = 0;
	private _sortableChildren = false;

	// ── Constructor ───────────────────────────────────────────────────────────

	public constructor() {
		super();
		this.tint = 0xffffff;
	}

	// ── Getters / Setters ─────────────────────────────────────────────────────

	public get name(): string {
		return this._name;
	}
	public set name(value: string) {
		this._name = value;
	}

	public get parent(): DisplayObjectContainer | undefined {
		return this.internalParent;
	}
	public get stage(): Stage | undefined {
		return this.internalStage;
	}

	public get matrix(): Matrix {
		return this.getMatrix().clone();
	}
	public set matrix(value: Matrix) {
		this.setMatrix(value);
	}

	public get x(): number {
		return this.internalX;
	}
	public set x(value: number) {
		this.setX(value);
	}

	public get y(): number {
		return this.internalY;
	}
	public set y(value: number) {
		this.setY(value);
	}

	public get scaleX(): number {
		return this._scaleX;
	}
	public set scaleX(value: number) {
		this.setScaleX(value);
	}

	public get scaleY(): number {
		return this._scaleY;
	}
	public set scaleY(value: number) {
		this.setScaleY(value);
	}

	public get rotation(): number {
		return this._rotation;
	}
	public set rotation(value: number) {
		this.setRotation(value);
	}

	public get skewX(): number {
		return this._skewXdeg;
	}
	public set skewX(value: number) {
		this.setSkewX(value);
	}

	public get skewY(): number {
		return this._skewYdeg;
	}
	public set skewY(value: number) {
		this.setSkewY(value);
	}

	public get width(): number {
		return isNaN(this.explicitWidth) ? this.getOriginalBounds().width : this.explicitWidth;
	}
	public set width(value: number) {
		this.explicitWidth = isNaN(value) ? NaN : value;
	}

	public get height(): number {
		return isNaN(this.explicitHeight) ? this.getOriginalBounds().height : this.explicitHeight;
	}
	public set height(value: number) {
		this.explicitHeight = isNaN(value) ? NaN : value;
	}

	public get measuredWidth(): number {
		return this.getOriginalBounds().width;
	}
	public get measuredHeight(): number {
		return this.getOriginalBounds().height;
	}

	public get anchorOffsetX(): number {
		return this.internalAnchorOffsetX;
	}
	public set anchorOffsetX(value: number) {
		this.setAnchorOffsetX(value);
	}

	public get anchorOffsetY(): number {
		return this.internalAnchorOffsetY;
	}
	public set anchorOffsetY(value: number) {
		this.setAnchorOffsetY(value);
	}

	public get visible(): boolean {
		return this.internalVisible;
	}
	public set visible(value: boolean) {
		this.setVisible(value);
	}

	public get cacheAsBitmap(): boolean {
		return this.internalCacheAsBitmap;
	}
	public set cacheAsBitmap(value: boolean) {
		this.internalCacheAsBitmap = value;
		this.setHasDisplayList(value);
	}

	public get filters(): Filter[] {
		return this.internalFilters;
	}
	public set filters(value: Filter[]) {
		this.internalFilters = value ? [...value] : [];
		this.updateRenderMode();
		this.markDirty();
	}

	public get alpha(): number {
		return this.internalAlpha;
	}
	public set alpha(value: number) {
		this.setAlpha(value);
	}

	public get touchEnabled(): boolean {
		return this.internalTouchEnabled;
	}
	public set touchEnabled(value: boolean) {
		this.internalTouchEnabled = !!value;
	}

	public get scrollRect(): Rectangle | undefined {
		return this.internalScrollRect;
	}
	public set scrollRect(value: Rectangle | undefined) {
		this.setScrollRect(value);
	}

	public get blendMode(): string {
		return numberToBlendMode(this.internalBlendMode);
	}
	public set blendMode(value: string) {
		const mode = blendModeToNumber(value);
		if (this.internalBlendMode === mode) return;
		this.internalBlendMode = mode;
		this.updateRenderMode();
		this.markDirty();
	}

	public get mask(): DisplayObject | Rectangle | undefined {
		return this.internalMask ?? this.internalMaskRect;
	}
	public set mask(value: DisplayObject | Rectangle | undefined) {
		this.setMask(value);
	}

	public get tint(): number {
		return this._tint;
	}
	public set tint(value: number) {
		this._tint = typeof value === 'number' && value >= 0 && value <= 0xffffff ? value : 0xffffff;
		this.tintRGB = (this._tint >> 16) + (this._tint & 0xff00) + ((this._tint & 0xff) << 16);
	}

	public get zIndex(): number {
		return this._zIndex;
	}
	public set zIndex(value: number) {
		this._zIndex = value;
		if (this.parent) this.parent.sortDirty = true;
	}

	public get sortableChildren(): boolean {
		return this._sortableChildren;
	}
	public set sortableChildren(value: boolean) {
		this._sortableChildren = value;
	}

	// ── Public methods ────────────────────────────────────────────────────────

	public getBounds(resultRect?: Rectangle, calculateAnchor = true): Rectangle {
		resultRect = this.getTransformedBoundsInternal(this, resultRect);
		if (calculateAnchor) {
			if (this.internalAnchorOffsetX !== 0) resultRect.x -= this.internalAnchorOffsetX;
			if (this.internalAnchorOffsetY !== 0) resultRect.y -= this.internalAnchorOffsetY;
		}
		return resultRect;
	}

	public getTransformedBounds(targetCoordinateSpace: DisplayObject, resultRect?: Rectangle): Rectangle {
		return this.getTransformedBoundsInternal(targetCoordinateSpace ?? this, resultRect);
	}

	public globalToLocal(stageX = 0, stageY = 0, resultPoint?: Point): Point {
		return this.getInvertedConcatenatedMatrix().transformPoint(stageX, stageY, resultPoint);
	}

	public localToGlobal(localX = 0, localY = 0, resultPoint?: Point): Point {
		return this.getConcatenatedMatrix().transformPoint(localX, localY, resultPoint);
	}

	public hitTestPoint(x: number, y: number, shapeFlag?: boolean): boolean {
		if (this._scaleX === 0 || this._scaleY === 0) return false;
		const m = this.getInvertedConcatenatedMatrix();
		const bounds = this.getBounds(undefined, false);
		const localX = m.a * x + m.c * y + m.tx;
		const localY = m.b * x + m.d * y + m.ty;
		if (!bounds.contains(localX, localY)) return false;
		const rect = this.internalScrollRect ?? this.internalMaskRect;
		if (rect && !rect.contains(localX, localY)) return false;
		if (!shapeFlag) return true;
		// Pixel-perfect: delegate to hitTest which Shape/Sprite override
		return this.hitTest(x, y) !== undefined;
	}

	public sortChildren(): void {
		this.sortDirty = false;
	}

	public override dispatchEvent(event: Event): boolean {
		if (!event.bubbles) return super.dispatchEvent(event);
		const list = this.getPropagationList(this);
		const targetIndex = list.length * 0.5;
		event.setDispatchContext(this, EventPhase.AT_TARGET);
		this.dispatchPropagationEvent(event, list, targetIndex);
		return !event.isDefaultPrevented();
	}

	public override willTrigger(type: string): boolean {
		let node: DisplayObject | undefined = this;
		while (node) {
			if (node.hasEventListener(type)) return true;
			node = node.internalParent;
		}
		return false;
	}

	public override addEventListener(
		type: string,
		listener: (event: Event) => void,
		useCapture?: boolean,
		priority?: number,
	): void {
		super.addEventListener(type, listener, useCapture, priority);
		if (type === Event.ENTER_FRAME || type === Event.RENDER) {
			const list =
				type === Event.ENTER_FRAME ? DisplayObject.enterFrameCallBackList : DisplayObject.renderCallBackList;
			if (!list.includes(this)) list.push(this);
		}
	}

	public override removeEventListener(type: string, listener: (event: Event) => void, useCapture?: boolean): void {
		super.removeEventListener(type, listener, useCapture);
		if ((type === Event.ENTER_FRAME || type === Event.RENDER) && !this.hasEventListener(type)) {
			const list =
				type === Event.ENTER_FRAME ? DisplayObject.enterFrameCallBackList : DisplayObject.renderCallBackList;
			const index = list.indexOf(this);
			if (index !== -1) list.splice(index, 1);
		}
	}

	// ── Internal methods (used by subclasses and framework) ───────────────────

	setParent(parent: DisplayObjectContainer | undefined): void {
		this.internalParent = parent;
	}

	onAddToStage(stage: Stage, nestLevel: number): void {
		this.internalStage = stage;
		this.nestLevel = nestLevel;
		this.hasAddToStage = true;
	}

	onRemoveFromStage(): void {
		this.nestLevel = 0;
		this.internalStage = undefined;
	}

	getMatrix(): Matrix {
		if (this._matrixDirty) {
			this._matrixDirty = false;
			this._matrix.updateScaleAndRotation(this._scaleX, this._scaleY, this._skewX, this._skewY);
		}
		this._matrix.tx = this.internalX;
		this._matrix.ty = this.internalY;
		return this._matrix;
	}

	setMatrix(matrix: Matrix, needUpdateProperties = true): void {
		const m = this._matrix;
		m.a = matrix.a;
		m.b = matrix.b;
		m.c = matrix.c;
		m.d = matrix.d;
		this.internalX = matrix.tx;
		this.internalY = matrix.ty;
		this._matrixDirty = false;
		this.useTranslate = !(m.a === 1 && m.b === 0 && m.c === 0 && m.d === 1);
		if (needUpdateProperties) {
			this._scaleX = m.getScaleX();
			this._scaleY = m.getScaleY();
			this._skewX = matrix.getSkewX();
			this._skewY = matrix.getSkewY();
			this._skewXdeg = clampRotation((this._skewX * 180) / Math.PI);
			this._skewYdeg = clampRotation((this._skewY * 180) / Math.PI);
			this._rotation = clampRotation((this._skewY * 180) / Math.PI);
		}
		this.markDirty();
	}

	getConcatenatedMatrix(): Matrix {
		if (!this._concatenatedMatrix) this._concatenatedMatrix = new Matrix();
		const matrix = this._concatenatedMatrix;
		if (this.internalParent) {
			this.internalParent.getConcatenatedMatrix().preMultiplyInto(this.getMatrix(), matrix);
		} else {
			matrix.copyFrom(this.getMatrix());
		}
		const ox = this.internalAnchorOffsetX;
		const oy = this.internalAnchorOffsetY;
		const rect = this.internalScrollRect;
		if (rect) {
			matrix.preMultiplyInto(sharedMatrix.setTo(1, 0, 0, 1, -rect.x - ox, -rect.y - oy), matrix);
		} else if (ox !== 0 || oy !== 0) {
			matrix.preMultiplyInto(sharedMatrix.setTo(1, 0, 0, 1, -ox, -oy), matrix);
		}
		return matrix;
	}

	getInvertedConcatenatedMatrix(): Matrix {
		if (!this._invertedConcatenatedMatrix) this._invertedConcatenatedMatrix = new Matrix();
		this.getConcatenatedMatrix().invertInto(this._invertedConcatenatedMatrix);
		return this._invertedConcatenatedMatrix;
	}

	setX(value: number): boolean {
		if (this.internalX === value) return false;
		this.internalX = value;
		this.markDirty();
		return true;
	}

	setY(value: number): boolean {
		if (this.internalY === value) return false;
		this.internalY = value;
		this.markDirty();
		return true;
	}

	setScaleX(value: number): void {
		if (this._scaleX === value) return;
		this._scaleX = value;
		this._matrixDirty = true;
		this.updateUseTransform();
		this.markDirty();
	}

	setScaleY(value: number): void {
		if (this._scaleY === value) return;
		this._scaleY = value;
		this._matrixDirty = true;
		this.updateUseTransform();
		this.markDirty();
	}

	setRotation(value: number): void {
		value = clampRotation(value);
		if (value === this._rotation) return;
		const delta = ((value - this._rotation) / 180) * Math.PI;
		this._skewX += delta;
		this._skewY += delta;
		this._rotation = value;
		this._matrixDirty = true;
		this.updateUseTransform();
		this.markDirty();
	}

	setSkewX(value: number): void {
		if (value === this._skewXdeg) return;
		this._skewXdeg = value;
		this._skewX = (clampRotation(value) / 180) * Math.PI;
		this._matrixDirty = true;
		this.updateUseTransform();
		this.markDirty();
	}

	setSkewY(value: number): void {
		if (value === this._skewYdeg) return;
		this._skewYdeg = value;
		this._skewY = ((clampRotation(value) + this._rotation) / 180) * Math.PI;
		this._matrixDirty = true;
		this.updateUseTransform();
		this.markDirty();
	}

	setAnchorOffsetX(value: number): void {
		if (this.internalAnchorOffsetX === value) return;
		this.internalAnchorOffsetX = value;
		this.markDirty();
	}

	setAnchorOffsetY(value: number): void {
		if (this.internalAnchorOffsetY === value) return;
		this.internalAnchorOffsetY = value;
		this.markDirty();
	}

	setVisible(value: boolean): void {
		if (this.internalVisible === value) return;
		this.internalVisible = value;
		this.updateRenderMode();
		this.markDirty();
	}

	setAlpha(value: number): void {
		if (this.internalAlpha === value) return;
		this.internalAlpha = value;
		this.updateRenderMode();
		this.markDirty();
	}

	setScrollRect(value: Rectangle | undefined): void {
		if (!value && !this.internalScrollRect) return;
		if (value) {
			if (!this.internalScrollRect) this.internalScrollRect = new Rectangle();
			this.internalScrollRect.copyFrom(value);
		} else {
			this.internalScrollRect = undefined;
		}
		this.updateRenderMode();
		this.markDirty();
	}

	setHasDisplayList(value: boolean): void {
		const hasDisplayList = !!this.displayList;
		if (hasDisplayList === value) return;
		if (value) {
			const dl = DisplayList.create(this);
			if (dl) {
				this.displayList = dl;
				this.cacheDirty = true;
			}
		} else {
			if (this.displayList) {
				DisplayList.release(this.displayList);
				this.displayList = undefined;
			}
		}
		this.markDirty();
	}

	cacheDirtyUp(): void {
		const p = this.internalParent;
		if (p && !p.cacheDirty) {
			p.cacheDirty = true;
			p.cacheDirtyUp();
		}
	}

	updateUseTransform(): void {
		this.useTranslate = !(this._scaleX === 1 && this._scaleY === 1 && this._skewX === 0 && this._skewY === 0);
	}

	updateRenderMode(): void {
		if (!this.internalVisible || this.internalAlpha <= 0 || this.maskedObject) {
			this.renderMode = RenderMode.NONE;
		} else if (this.internalFilters.length > 0) {
			this.renderMode = RenderMode.FILTER;
		} else if (this.internalBlendMode !== 0 || (this.internalMask && this.internalMask.internalStage)) {
			this.renderMode = RenderMode.CLIP;
		} else if (this.internalScrollRect || this.internalMaskRect) {
			this.renderMode = RenderMode.SCROLLRECT;
		} else {
			this.renderMode = undefined;
		}
	}

	getOriginalBounds(): Rectangle {
		const bounds = this.getContentBounds();
		this.measureChildBounds(bounds);
		return bounds;
	}

	measureChildBounds(_bounds: Rectangle): void {}

	getContentBounds(): Rectangle {
		const bounds = sharedRectangle;
		bounds.setEmpty();
		this.measureContentBounds(bounds);
		return bounds;
	}

	measureContentBounds(_bounds: Rectangle): void {}

	getTransformedBoundsInternal(targetCoordinateSpace: DisplayObject, resultRect?: Rectangle): Rectangle {
		const bounds = this.getOriginalBounds();
		if (!resultRect) resultRect = new Rectangle();
		resultRect.copyFrom(bounds);
		if (targetCoordinateSpace === this) return resultRect;
		const m = sharedMatrix;
		targetCoordinateSpace.getInvertedConcatenatedMatrix().preMultiplyInto(this.getConcatenatedMatrix(), m);
		m.transformBounds(resultRect);
		return resultRect;
	}

	getConcatenatedMatrixAt(root: DisplayObject, matrix: Matrix): void {
		const invertMatrix = root.getInvertedConcatenatedMatrix();
		if ((invertMatrix.a === 0 || invertMatrix.d === 0) && (invertMatrix.b === 0 || invertMatrix.c === 0)) {
			let target: DisplayObject = this;
			const rootLevel = root.nestLevel;
			matrix.identity();
			while (target.nestLevel > rootLevel) {
				const rect = target.internalScrollRect;
				if (rect) matrix.concat(sharedMatrix.setTo(1, 0, 0, 1, -rect.x, -rect.y));
				matrix.concat(target.getMatrix());
				target = target.internalParent!;
			}
		} else {
			invertMatrix.preMultiplyInto(matrix, matrix);
		}
	}

	hitTest(stageX: number, stageY: number): DisplayObject | undefined {
		if (!this.internalVisible || this._scaleX === 0 || this._scaleY === 0) return undefined;
		const m = this.getInvertedConcatenatedMatrix();
		if (m.a === 0 && m.b === 0 && m.c === 0 && m.d === 0) return undefined;
		const bounds = this.getContentBounds();
		const localX = m.a * stageX + m.c * stageY + m.tx;
		const localY = m.b * stageX + m.d * stageY + m.ty;
		if (bounds.contains(localX, localY)) {
			if (!this.children) {
				const rect = this.internalScrollRect ?? this.internalMaskRect;
				if (rect && !rect.contains(localX, localY)) return undefined;
				if (this.internalMask && !this.internalMask.hitTest(stageX, stageY)) return undefined;
			}
			return this;
		}
		return undefined;
	}

	updateRenderNode(): void {}

	getPropagationList(target: DisplayObject): DisplayObject[] {
		const list: DisplayObject[] = [];
		let current: DisplayObject | undefined = target;
		while (current) {
			list.push(current);
			current = current.internalParent;
		}
		return [...[...list].reverse(), ...list];
	}

	dispatchPropagationEvent(event: Event, list: DisplayObject[], targetIndex: number): void {
		const captureIndex = targetIndex - 1;
		for (let i = 0; i < list.length; i++) {
			const currentTarget = list[i];
			const phase =
				i < captureIndex
					? EventPhase.CAPTURING_PHASE
					: i === targetIndex || i === captureIndex
						? EventPhase.AT_TARGET
						: EventPhase.BUBBLING_PHASE;
			event.setCurrentTarget(currentTarget);
			event.setDispatchContext(currentTarget, phase);
			(currentTarget as unknown as { notifyListener(e: Event, capture: boolean): boolean }).notifyListener(
				event,
				i < targetIndex,
			);
			if (event.isPropagationStopped || event.isPropagationImmediateStopped) return;
		}
	}

	// ── Private methods ───────────────────────────────────────────────────────

	private setMask(value: DisplayObject | Rectangle | undefined): void {
		if (value === this) return;
		if (value instanceof DisplayObject) {
			if (value === this.internalMask) return;
			if (value.maskedObject) value.maskedObject.mask = undefined;
			value.maskedObject = this;
			this.internalMask = value;
			this.internalMaskRect = undefined;
		} else if (value instanceof Rectangle) {
			if (!this.internalMaskRect) this.internalMaskRect = new Rectangle();
			this.internalMaskRect.copyFrom(value);
			if (this.internalMask) {
				this.internalMask.maskedObject = undefined;
				this.internalMask = undefined;
			}
		} else {
			if (this.internalMask) {
				this.internalMask.maskedObject = undefined;
				this.internalMask = undefined;
			}
			this.internalMaskRect = undefined;
		}
		this.updateRenderMode();
		this.markDirty();
	}

	markDirty(): void {
		const p = this.internalParent;
		if (p && !p.cacheDirty) {
			p.cacheDirty = true;
			p.cacheDirtyUp();
		}
		const masked = this.maskedObject;
		if (masked && !masked.cacheDirty) {
			masked.cacheDirty = true;
			masked.cacheDirtyUp();
		}
	}
}
