import type { ResourceItem } from './ResourceItem.js';
import type { AnalyzerBase } from './analyzers/AnalyzerBase.js';

/**
 * Queue-based resource loader with concurrency control.
 *
 * - Items are processed in priority order (higher priority first).
 * - Concurrency is limited to `threadCount` (default 2).
 * - Failed items are retried up to `retryCount` times (default 3).
 * - Progress is reported via the `onProgress` callback.
 */
export class ResourceLoader {
	// ── Configuration ──────────────────────────────────────────────────────

	/** Maximum concurrent loads */
	public threadCount = 2;
	/** Maximum retries for failed items */
	public retryCount = 3;

	// ── Callbacks ──────────────────────────────────────────────────────────

	/** Called for each successfully loaded item */
	public onComplete: ((item: ResourceItem) => void) | null = null;
	/** Called for each failed item (after retries exhausted) */
	public onError: ((item: ResourceItem) => void) | null = null;
	/** Called with (loaded, total) progress */
	public onProgress: ((loaded: number, total: number) => void) | null = null;

	// ── Internal state ─────────────────────────────────────────────────────

	private pendingList: ResourceItem[] = [];
	private loadingList: ResourceItem[] = [];
	private retryDic: Map<string, number> = new Map<string, number>();
	private analyzerMap: Map<string, AnalyzerBase> = new Map<string, AnalyzerBase>();
	private activeCount = 0;

	// ── Public API ─────────────────────────────────────────────────────────

	/**
	 * Register an analyzer for a resource type.
	 */
	public registerAnalyzer(type: string, analyzer: AnalyzerBase): void {
		this.analyzerMap.set(type, analyzer);
	}

	/**
	 * Enqueue items for loading. Does not start loading — call `start()` to begin.
	 */
	public loadResourceList(list: ResourceItem[]): void {
		this.pendingList = list.slice();
		this.loadingList = [];
	}

	/**
	 * Start or resume loading. Returns a promise that resolves when all items are loaded.
	 */
	public start(): Promise<void> {
		return new Promise<void>(resolve => {
			this._resolve = resolve;
			this.next();
		});
	}

	/**
	 * Abort all loading.
	 */
	public abort(): void {
		this.pendingList = [];
		this.loadingList = [];
		this.activeCount = 0;
		if (this._resolve) {
			this._resolve();
			this._resolve = null;
		}
	}

	// ── Private methods ────────────────────────────────────────────────────

	private _resolve: (() => void) | null = null;

	private next(): void {
		// All done?
		if (this.pendingList.length === 0 && this.activeCount === 0) {
			if (this._resolve) {
				this._resolve();
				this._resolve = null;
			}
			return;
		}

		// Fill up to threadCount
		while (this.activeCount < this.threadCount && this.pendingList.length > 0) {
			const item = this.pendingList.shift()!;
			this.loadingList.push(item);
			this.activeCount++;
			this.loadItem(item);
		}
	}

	private loadItem(item: ResourceItem): void {
		const analyzer = this.analyzerMap.get(item.type);
		if (!analyzer) {
			item.loaded = false;
			this.onItemError(item);
			return;
		}

		analyzer
			.loadFile(item)
			.then(result => {
				this.loadingList = this.loadingList.filter(i => i !== item);
				this.activeCount--;

				if (result.loaded) {
					this.onItemComplete(result);
				} else {
					this.onItemError(result);
				}
			})
			.catch(() => {
				this.loadingList = this.loadingList.filter(i => i !== item);
				this.activeCount--;
				this.onItemError(item);
			});
	}

	private onItemComplete(item: ResourceItem): void {
		this.reportProgress();

		if (this.onComplete) {
			this.onComplete(item);
		}

		this.next();
	}

	private onItemError(item: ResourceItem): void {
		const retries = this.retryDic.get(item.name) ?? 0;
		if (retries < this.retryCount) {
			this.retryDic.set(item.name, retries + 1);
			this.pendingList.push(item);
			this.activeCount--;
			this.next();
			return;
		}

		// Retries exhausted
		if (this.onError) {
			this.onError(item);
		}

		this.reportProgress();
		this.next();
	}

	private reportProgress(): void {
		if (this.onProgress) {
			const total = this.pendingList.length + this.loadingList.length + this.activeCount;
			const loaded = total > 0 ? this.activeCount : 0;
			this.onProgress(loaded, total + loaded);
		}
	}
}
