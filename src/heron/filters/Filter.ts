import { HashObject } from '../utils/HashObject.js';

export class Filter extends HashObject {
	// ── Instance fields ───────────────────────────────────────────────────────

	public type = '';

	/** @internal Uniform values consumed by the renderer. */
	uniforms: Record<string, unknown> = {};

	protected paddingTop = 0;
	protected paddingBottom = 0;
	protected paddingLeft = 0;
	protected paddingRight = 0;

	// ── Constructor ───────────────────────────────────────────────────────────

	public constructor() {
		super();
	}

	// ── Public methods ────────────────────────────────────────────────────────

	public onPropertyChange(): void {
		this.updatePadding();
	}

	// ── Internal methods ──────────────────────────────────────────────────────

	protected updatePadding(): void {}

	toJson(): string {
		return '';
	}
}
