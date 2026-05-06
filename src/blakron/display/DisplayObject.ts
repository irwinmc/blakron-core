import { EventDispatcher } from '../events/EventDispatcher.js';
import { Event } from '../events/Event.js';
import { EventPhase } from '../events/EventPhase.js';
import { Matrix, sharedMatrix } from '../geom/Matrix.js';
import { Point } from '../geom/Point.js';
import { Rectangle, sharedRectangle } from '../geom/Rectangle.js';
import { DisplayList } from '../player/canvas/DisplayList.js';
import type { Filter } from '../filters/Filter.js';
import { blendModeToNumber, numberToBlendMode } from './enums/BlendMode.js';
import type { DisplayObjectContainer } from './DisplayObjectContainer.js';
import type { Stage } from './Stage.js';
import type { Graphics } from './Graphics.js';

function clampRotation(value: number): number {
	value %= 360;
	if (value > 180) {
		value -= 360;
	} else if (value < -180) {
		value += 360;
	}
	return value;
}

/** @internal Render mode hint for the renderer. */
export const enum RenderMode {
	NONE = 1,
	FILTER = 2,
	CLIP = 3,
	SCROLLRECT = 4,
}

/** @internal Identifies the concrete renderable type, replacing instanceof checks in hot paths. */
export const enum RenderObjectType {
	NONE = 0,
	BITMAP = 1,
	MESH = 2,
	SHAPE = 3,
	SPRITE = 4,
	TEXT = 5,
	PARTICLE = 6,
}

export class DisplayObject extends EventDispatcher {
	// ── Static fields ─────────────────────────────────────────────────────────

	static defaultTouchEnabled = false;
	static enterFrameCallBackList: DisplayObject[] = [];
	static renderCallBackList: DisplayObject[] = [];

	/**
	 * @internal
	 * Injected by Player at startup. Called when renderMode changes (visible,
	 * filters, mask, blendMode) so the WebGLRenderer can mark its InstructionSet dirty.
	 */
	static _onStructureChange?: () => void;

	/**
	 * @internal
	 * Injected by Player at startup. Called when a DisplayObject's visual data
	 * changes (position, texture, alpha, tint) but the scene structure is unchanged.
	 * The renderer uses this to update the transform snapshot in the InstructionSet
	 * without doing a full rebuild.
	 */
	static _onRenderableDirty?: (obj: DisplayObject) => void;

	/**
	 * @internal Register a structure-change listener. Returns an unregister function.
	 * Using a registration pattern instead of a single static field supports
	 * multiple Player instances on the same page.
	 */
	static addStructureChangeListener(fn: () => void): () => void {
		const prev = DisplayObject._onStructureChange;
		if (!prev) {
			DisplayObject._onStructureChange = fn;
		} else {
			DisplayObject._onStructureChange = () => {
				prev();
				fn();
			};
		}
		return () => {
			// Simple removal: if only one listener, clear; otherwise rebuild chain.
			// For the common single-player case this is zero overhead.
			if (DisplayObject._onStructureChange === fn) {
				DisplayObject._onStructureChange = undefined;
			}
		};
	}

	/**
	 * @internal Register a renderable-dirty listener. Returns an unregister function.
	 */
	static addRenderableDirtyListener(fn: (obj: DisplayObject) => void): () => void {
		const prev = DisplayObject._onRenderableDirty;
		if (!prev) {
			DisplayObject._onRenderableDirty = fn;
		} else {
			DisplayObject._onRenderableDirty = obj => {
				prev(obj);
				fn(obj);
			};
		}
		return () => {
			if (DisplayObject._onRenderableDirty === fn) {
				DisplayObject._onRenderableDirty = undefined;
			}
		};
	}

	// ── Instance fields ───────────────────────────────────────────────────────

	// 场景图
	protected _hasAddToStage = false;
	protected _children?: DisplayObject[];
	private _parent?: DisplayObjectContainer;
	protected _stage?: Stage;
	protected _nestLevel = 0;

	// 变换
	private _x = 0;
	private _y = 0;
	private _anchorOffsetX = 0;
	private _anchorOffsetY = 0;
	protected _explicitWidth: number = NaN;
	protected _explicitHeight: number = NaN;
	private _useTranslate = false;

	// 外观
	private _visible = true;
	private _alpha = 1;
	private _blendMode = 0;
	private _filters: Filter[] = [];
	private _cacheAsBitmap = false;
	private _touchEnabled: boolean = DisplayObject.defaultTouchEnabled;

	// 遮罩
	private _mask?: DisplayObject;
	private _maskRect?: Rectangle;
	private _scrollRect?: Rectangle;
	protected _maskedObject?: DisplayObject;

	// 渲染状态
	private _renderMode?: RenderMode;
	protected _renderObjectType: RenderObjectType = RenderObjectType.NONE;
	protected _renderDirty = false;
	protected _cacheDirty = false;
	private _displayList?: DisplayList;

	// 世界缓存（markDirty 更新，O(1) 读取）
	private _worldAlpha = 1;
	private _worldTint = 0xffffff;
	private _tintRGB = 0;

	// 排序
	protected _sortDirty = false;
	protected _lastSortedIndex = 0;

	// bounds 缓存
	private _boundsDirty = true;
	private readonly _cachedBounds = new Rectangle();

	// 私有
	private _name = '';
	private _matrix: Matrix = new Matrix();
	private _matrixDirty = false;
	private _concatenatedMatrix?: Matrix;
	private _invertedConcatenatedMatrix?: Matrix;
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

	protected _graphics?: Graphics;

	// ── Constructor ───────────────────────────────────────────────────────────

	public constructor() {
		super();
		this.tint = 0xffffff;
	}

	// ── Getters / Setters ─────────────────────────────────────────────────────

	public get hasAddToStage(): boolean {
		return this._hasAddToStage;
	}
	public set hasAddToStage(value: boolean) {
		this._hasAddToStage = value;
	}

	public get children(): DisplayObject[] | undefined {
		return this._children;
	}
	public set children(value: DisplayObject[] | undefined) {
		this._children = value;
	}

	public get graphics(): Graphics | undefined {
		return this._graphics;
	}

	public get name(): string {
		return this._name;
	}
	public set name(value: string) {
		this._name = value;
	}

	public get parent(): DisplayObjectContainer | undefined {
		return this._parent;
	}
	public get stage(): Stage | undefined {
		return this._stage;
	}

	public get nestLevel(): number {
		return this._nestLevel;
	}

	public get matrix(): Matrix {
		return this.getMatrix().clone();
	}
	public set matrix(value: Matrix) {
		this.setMatrix(value);
	}

	public get x(): number {
		return this._x;
	}
	public set x(value: number) {
		this.setX(value);
	}

	public get y(): number {
		return this._y;
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
		return isNaN(this._explicitWidth) ? this.getOriginalBounds().width : this._explicitWidth;
	}
	public set width(value: number) {
		this._explicitWidth = isNaN(value) ? NaN : value;
	}

	public get height(): number {
		return isNaN(this._explicitHeight) ? this.getOriginalBounds().height : this._explicitHeight;
	}
	public set height(value: number) {
		this._explicitHeight = isNaN(value) ? NaN : value;
	}

	public get measuredWidth(): number {
		return this.getOriginalBounds().width;
	}
	public get measuredHeight(): number {
		return this.getOriginalBounds().height;
	}

	public get anchorOffsetX(): number {
		return this._anchorOffsetX;
	}
	public set anchorOffsetX(value: number) {
		this.setAnchorOffsetX(value);
	}

	public get anchorOffsetY(): number {
		return this._anchorOffsetY;
	}
	public set anchorOffsetY(value: number) {
		this.setAnchorOffsetY(value);
	}

	public get explicitWidth(): number {
		return this._explicitWidth;
	}
	public set explicitWidth(value: number) {
		this._explicitWidth = value;
	}

	public get explicitHeight(): number {
		return this._explicitHeight;
	}
	public set explicitHeight(value: number) {
		this._explicitHeight = value;
	}

	public get useTranslate(): boolean {
		return this._useTranslate;
	}

	public get visible(): boolean {
		return this._visible;
	}
	public set visible(value: boolean) {
		this.setVisible(value);
	}

	public get cacheAsBitmap(): boolean {
		return this._cacheAsBitmap;
	}
	public set cacheAsBitmap(value: boolean) {
		this._cacheAsBitmap = value;
		this.setHasDisplayList(value);
	}

	public get filters(): Filter[] {
		return this._filters;
	}
	public set filters(value: Filter[]) {
		this._filters = value ? [...value] : [];
		this.updateRenderMode();
		this.markDirty();
	}

	public get alpha(): number {
		return this._alpha;
	}
	public set alpha(value: number) {
		this.setAlpha(value);
	}

	public get worldAlpha(): number {
		return this._worldAlpha;
	}

	public get worldTint(): number {
		return this._worldTint;
	}

	public get tintRGB(): number {
		return this._tintRGB;
	}

	public get touchEnabled(): boolean {
		return this._touchEnabled;
	}
	public set touchEnabled(value: boolean) {
		this._touchEnabled = !!value;
	}

	public get scrollRect(): Rectangle | undefined {
		return this._scrollRect;
	}
	public set scrollRect(value: Rectangle | undefined) {
		this.setScrollRect(value);
	}

	public get blendMode(): string {
		return numberToBlendMode(this._blendMode);
	}
	public set blendMode(value: string) {
		const mode = blendModeToNumber(value);
		if (this._blendMode === mode) {
			return;
		}
		this._blendMode = mode;
		this.updateRenderMode();
		this.markDirty();
	}

	public get internalBlendMode(): number {
		return this._blendMode;
	}

	public get mask(): DisplayObject | Rectangle | undefined {
		return this._mask ?? this._maskRect;
	}
	public set mask(value: DisplayObject | Rectangle | undefined) {
		this.setMask(value);
	}

	public get internalMask(): DisplayObject | undefined {
		return this._mask;
	}

	public get internalMaskRect(): Rectangle | undefined {
		return this._maskRect;
	}

	public get maskedObject(): DisplayObject | undefined {
		return this._maskedObject;
	}

	public get renderObjectType(): RenderObjectType {
		return this._renderObjectType;
	}
	public set renderObjectType(value: RenderObjectType) {
		this._renderObjectType = value;
	}

	public get renderDirty(): boolean {
		return this._renderDirty;
	}
	public set renderDirty(value: boolean) {
		this._renderDirty = value;
	}

	public get cacheDirty(): boolean {
		return this._cacheDirty;
	}
	public set cacheDirty(value: boolean) {
		this._cacheDirty = value;
	}

	public get renderMode(): RenderMode | undefined {
		return this._renderMode;
	}

	public get displayList(): DisplayList | undefined {
		return this._displayList;
	}

	public get tint(): number {
		return this._tint;
	}
	public set tint(value: number) {
		this._tint = typeof value === 'number' && value >= 0 && value <= 0xffffff ? value : 0xffffff;
		this._tintRGB = (this._tint >> 16) + (this._tint & 0xff00) + ((this._tint & 0xff) << 16);
		this.markDirty();
	}

	public get zIndex(): number {
		return this._zIndex;
	}
	public set zIndex(value: number) {
		this._zIndex = value;
		if (this.parent) {
			this.parent._sortDirty = true;
		}
	}

	public get sortableChildren(): boolean {
		return this._sortableChildren;
	}
	public set sortableChildren(value: boolean) {
		this._sortableChildren = value;
	}

	public get sortDirty(): boolean {
		return this._sortDirty;
	}
	public set sortDirty(value: boolean) {
		this._sortDirty = value;
	}

	public get lastSortedIndex(): number {
		return this._lastSortedIndex;
	}
	public set lastSortedIndex(value: number) {
		this._lastSortedIndex = value;
	}

	// ── Public methods ────────────────────────────────────────────────────────

	public getBounds(resultRect?: Rectangle, calculateAnchor = true): Rectangle {
		resultRect = this.getTransformedBoundsInternal(this, resultRect);
		if (calculateAnchor) {
			if (this._anchorOffsetX !== 0) {
				resultRect.x -= this._anchorOffsetX;
			}
			if (this._anchorOffsetY !== 0) {
				resultRect.y -= this._anchorOffsetY;
			}
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
		if (this._scaleX === 0 || this._scaleY === 0) {
			return false;
		}
		const m = this.getInvertedConcatenatedMatrix();
		const bounds = this.getBounds(undefined, false);
		const localX = m.a * x + m.c * y + m.tx;
		const localY = m.b * x + m.d * y + m.ty;
		if (!bounds.contains(localX, localY)) {
			return false;
		}
		const rect = this._scrollRect ?? this._maskRect;
		if (rect && !rect.contains(localX, localY)) {
			return false;
		}
		if (!shapeFlag) {
			return true;
		}
		// Pixel-perfect: delegate to hitTest which Shape/Sprite override
		return this.hitTest(x, y) !== undefined;
	}

	public sortChildren(): void {
		this._sortDirty = false;
	}

	public override dispatchEvent(event: Event): boolean {
		if (!event.bubbles) {
			return super.dispatchEvent(event);
		}
		const list = this.getPropagationList(this);
		const targetIndex = list.length * 0.5;
		event.setDispatchContext(this, EventPhase.AT_TARGET);
		this.dispatchPropagationEvent(event, list, targetIndex);
		return !event.isDefaultPrevented();
	}

	public override willTrigger(type: string): boolean {
		let node: DisplayObject | undefined = this;
		while (node) {
			if (node.hasEventListener(type)) {
				return true;
			}
			node = node._parent;
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
			if (!list.includes(this)) {
				list.push(this);
			}
		}
	}

	public override removeEventListener(type: string, listener: (event: Event) => void, useCapture?: boolean): void {
		super.removeEventListener(type, listener, useCapture);
		if ((type === Event.ENTER_FRAME || type === Event.RENDER) && !this.hasEventListener(type)) {
			const list =
				type === Event.ENTER_FRAME ? DisplayObject.enterFrameCallBackList : DisplayObject.renderCallBackList;
			const index = list.indexOf(this);
			if (index !== -1) {
				list.splice(index, 1);
			}
		}
	}

	// ── Internal methods (used by subclasses and framework) ───────────────────

	setParent(parent: DisplayObjectContainer | undefined): void {
		this._parent = parent;
	}

	onAddToStage(stage: Stage, nestLevel: number): void {
		this._stage = stage;
		this._nestLevel = nestLevel;
		this._hasAddToStage = true;
	}

	onRemoveFromStage(): void {
		this._nestLevel = 0;
		this._stage = undefined;
	}

	getMatrix(): Matrix {
		if (this._matrixDirty) {
			this._matrixDirty = false;
			this._matrix.updateScaleAndRotation(this._scaleX, this._scaleY, this._skewX, this._skewY);
		}
		this._matrix.tx = this._x;
		this._matrix.ty = this._y;
		return this._matrix;
	}

	setMatrix(matrix: Matrix, needUpdateProperties = true): void {
		const m = this._matrix;
		m.a = matrix.a;
		m.b = matrix.b;
		m.c = matrix.c;
		m.d = matrix.d;
		this._x = matrix.tx;
		this._y = matrix.ty;
		this._matrixDirty = false;
		this._useTranslate = !(m.a === 1 && m.b === 0 && m.c === 0 && m.d === 1);
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
		if (!this._concatenatedMatrix) {
			this._concatenatedMatrix = new Matrix();
		}
		const matrix = this._concatenatedMatrix;
		if (this._parent) {
			this._parent.getConcatenatedMatrix().preMultiplyInto(this.getMatrix(), matrix);
		} else {
			matrix.copyFrom(this.getMatrix());
		}
		const ox = this._anchorOffsetX;
		const oy = this._anchorOffsetY;
		const rect = this._scrollRect;
		if (rect) {
			matrix.preMultiplyInto(sharedMatrix.setTo(1, 0, 0, 1, -rect.x - ox, -rect.y - oy), matrix);
		} else if (ox !== 0 || oy !== 0) {
			matrix.preMultiplyInto(sharedMatrix.setTo(1, 0, 0, 1, -ox, -oy), matrix);
		}
		return matrix;
	}

	getInvertedConcatenatedMatrix(): Matrix {
		if (!this._invertedConcatenatedMatrix) {
			this._invertedConcatenatedMatrix = new Matrix();
		}
		this.getConcatenatedMatrix().invertInto(this._invertedConcatenatedMatrix);
		return this._invertedConcatenatedMatrix;
	}

	setX(value: number): boolean {
		if (this._x === value) {
			return false;
		}
		this._x = value;
		this.markDirty();
		return true;
	}

	setY(value: number): boolean {
		if (this._y === value) {
			return false;
		}
		this._y = value;
		this.markDirty();
		return true;
	}

	setScaleX(value: number): void {
		if (this._scaleX === value) {
			return;
		}
		this._scaleX = value;
		this._matrixDirty = true;
		this.updateUseTransform();
		this.markDirty();
	}

	setScaleY(value: number): void {
		if (this._scaleY === value) {
			return;
		}
		this._scaleY = value;
		this._matrixDirty = true;
		this.updateUseTransform();
		this.markDirty();
	}

	setRotation(value: number): void {
		value = clampRotation(value);
		if (value === this._rotation) {
			return;
		}
		const delta = ((value - this._rotation) / 180) * Math.PI;
		this._skewX += delta;
		this._skewY += delta;
		this._rotation = value;
		this._matrixDirty = true;
		this.updateUseTransform();
		this.markDirty();
	}

	setSkewX(value: number): void {
		if (value === this._skewXdeg) {
			return;
		}
		this._skewXdeg = value;
		this._skewX = (clampRotation(value) / 180) * Math.PI;
		this._matrixDirty = true;
		this.updateUseTransform();
		this.markDirty();
	}

	setSkewY(value: number): void {
		if (value === this._skewYdeg) {
			return;
		}
		this._skewYdeg = value;
		this._skewY = ((clampRotation(value) + this._rotation) / 180) * Math.PI;
		this._matrixDirty = true;
		this.updateUseTransform();
		this.markDirty();
	}

	setAnchorOffsetX(value: number): void {
		if (this._anchorOffsetX === value) {
			return;
		}
		this._anchorOffsetX = value;
		this.markDirty();
	}

	setAnchorOffsetY(value: number): void {
		if (this._anchorOffsetY === value) {
			return;
		}
		this._anchorOffsetY = value;
		this.markDirty();
	}

	setVisible(value: boolean): void {
		if (this._visible === value) {
			return;
		}
		this._visible = value;
		this.updateRenderMode();
		this.markDirty();
	}

	setAlpha(value: number): void {
		if (this._alpha === value) {
			return;
		}
		this._alpha = value;
		this.updateRenderMode();
		this.markDirty();
	}

	setScrollRect(value: Rectangle | undefined): void {
		if (!value && !this._scrollRect) {
			return;
		}
		if (value) {
			if (!this._scrollRect) {
				this._scrollRect = new Rectangle();
			}
			this._scrollRect.copyFrom(value);
		} else {
			this._scrollRect = undefined;
		}
		this.updateRenderMode();
		this.markDirty();
	}

	setHasDisplayList(value: boolean): void {
		const hasDisplayList = !!this._displayList;
		if (hasDisplayList === value) {
			return;
		}
		if (value) {
			const dl = DisplayList.create(this);
			if (dl) {
				this._displayList = dl;
				this._cacheDirty = true;
			}
		} else {
			if (this._displayList) {
				DisplayList.release(this._displayList);
				this._displayList = undefined;
			}
		}
		// cacheAsBitmap toggle changes the instruction set structure:
		// the subtree either collapses to a single displayListCache instruction
		// or expands back to individual leaf instructions.
		DisplayObject._onStructureChange?.();
		this.markDirty();
	}

	cacheDirtyUp(): void {
		const p = this._parent;
		if (p && !p._cacheDirty) {
			p._cacheDirty = true;
			p._boundsDirty = true;
			p.cacheDirtyUp();
		}
	}

	renderDirtyUp(): void {
		const p = this._parent;
		if (p && !p._renderDirty) {
			p._renderDirty = true;
			p.renderDirtyUp();
		}
	}

	updateUseTransform(): void {
		this._useTranslate = !(this._scaleX === 1 && this._scaleY === 1 && this._skewX === 0 && this._skewY === 0);
	}

	updateRenderMode(): void {
		if (!this._visible || this._alpha <= 0 || this._maskedObject) {
			this._renderMode = RenderMode.NONE;
		} else if (this._filters.length > 0) {
			this._renderMode = RenderMode.FILTER;
		} else if (this._blendMode !== 0 || (this._mask && this._mask._stage)) {
			this._renderMode = RenderMode.CLIP;
		} else if (this._scrollRect || this._maskRect) {
			this._renderMode = RenderMode.SCROLLRECT;
		} else {
			this._renderMode = undefined;
		}
		// RenderMode change means the instruction set structure is stale.
		DisplayObject._onStructureChange?.();
	}

	getOriginalBounds(): Rectangle {
		if (!this._boundsDirty) {
			return this._cachedBounds;
		}
		const bounds = this.getContentBounds();
		this.measureChildBounds(bounds);
		this._cachedBounds.copyFrom(bounds);
		this._boundsDirty = false;
		return this._cachedBounds;
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
		if (!resultRect) {
			resultRect = new Rectangle();
		}
		resultRect.copyFrom(bounds);
		if (targetCoordinateSpace === this) {
			return resultRect;
		}
		const m = sharedMatrix;
		targetCoordinateSpace.getInvertedConcatenatedMatrix().preMultiplyInto(this.getConcatenatedMatrix(), m);
		m.transformBounds(resultRect);
		return resultRect;
	}

	getConcatenatedMatrixAt(root: DisplayObject, matrix: Matrix): void {
		const invertMatrix = root.getInvertedConcatenatedMatrix();
		if ((invertMatrix.a === 0 || invertMatrix.d === 0) && (invertMatrix.b === 0 || invertMatrix.c === 0)) {
			let target: DisplayObject = this;
			const rootLevel = root._nestLevel;
			matrix.identity();
			while (target._nestLevel > rootLevel) {
				const rect = target._scrollRect;
				if (rect) matrix.concat(sharedMatrix.setTo(1, 0, 0, 1, -rect.x, -rect.y));
				matrix.concat(target.getMatrix());
				target = target._parent!;
			}
		} else {
			invertMatrix.preMultiplyInto(matrix, matrix);
		}
	}

	hitTest(stageX: number, stageY: number): DisplayObject | undefined {
		if (!this._visible || this._scaleX === 0 || this._scaleY === 0) {
			return undefined;
		}

		const m = this.getInvertedConcatenatedMatrix();
		if (m.a === 0 && m.b === 0 && m.c === 0 && m.d === 0) {
			return undefined;
		}

		const bounds = this.getContentBounds();
		const localX = m.a * stageX + m.c * stageY + m.tx;
		const localY = m.b * stageX + m.d * stageY + m.ty;
		if (bounds.contains(localX, localY)) {
			if (!this.children) {
				const rect = this._scrollRect ?? this._maskRect;
				if (rect && !rect.contains(localX, localY)) {
					return undefined;
				}
				if (this._mask && !this._mask.hitTest(stageX, stageY)) {
					return undefined;
				}
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
			current = current._parent;
		}
		return [...[...list].reverse(), ...list];
	}

	dispatchPropagationEvent(event: Event, list: DisplayObject[], targetIndex: number): void {
		for (let i = 0; i < list.length; i++) {
			const currentTarget = list[i];

			let phase: number;
			if (i < targetIndex - 1) {
				phase = EventPhase.CAPTURING_PHASE;
			} else if (i > targetIndex) {
				phase = EventPhase.BUBBLING_PHASE;
			} else {
				phase = EventPhase.AT_TARGET;
			}

			event.setCurrentTarget(currentTarget);
			event.setDispatchContext(currentTarget, phase);

			currentTarget.notifyListener(event, i < targetIndex);

			if (event.isPropagationStopped || event.isPropagationImmediateStopped) {
				return;
			}
		}
	}

	// ── Private methods ───────────────────────────────────────────────────────

	private setMask(value: DisplayObject | Rectangle | undefined): void {
		if (value === this) {
			return;
		}
		if (value instanceof DisplayObject) {
			if (value === this._mask) {
				return;
			}
			if (value._maskedObject) {
				value._maskedObject.mask = undefined;
			}
			value._maskedObject = this;
			this._mask = value;
			this._maskRect = undefined;
		} else if (value instanceof Rectangle) {
			if (!this._maskRect) {
				this._maskRect = new Rectangle();
			}
			this._maskRect.copyFrom(value);
			if (this._mask) {
				this._mask._maskedObject = undefined;
				this._mask = undefined;
			}
		} else {
			if (this._mask) {
				this._mask._maskedObject = undefined;
				this._mask = undefined;
			}
			this._maskRect = undefined;
		}
		this.updateRenderMode();
		this.markDirty();
	}

	markDirty(): void {
		this._renderDirty = true;
		this._boundsDirty = true;

		// Update cached world alpha and tint so _refreshLeafTransform can read
		// them in O(1) without walking the parent chain.
		let alpha = this._alpha;
		let tint = this._tintRGB;
		let p = this._parent;
		while (p) {
			alpha *= p._alpha;
			if (p._tintRGB !== 0xffffff) {
				tint = p._tintRGB;
			}
			p = p._parent;
		}
		this._worldAlpha = alpha;
		this._worldTint = tint;

		// Notify the renderer that this object's data changed.
		DisplayObject._onRenderableDirty?.(this);
		const parent = this._parent;
		if (parent && !parent._cacheDirty) {
			parent._cacheDirty = true;
			parent.cacheDirtyUp();
		}
		if (parent && !parent._renderDirty) {
			parent._renderDirty = true;
			parent.renderDirtyUp();
		}
		const masked = this._maskedObject;
		if (masked && !masked._cacheDirty) {
			masked._cacheDirty = true;
			masked.cacheDirtyUp();
		}
	}
}
