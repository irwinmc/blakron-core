namespace heron {
	export interface IHashObject {
		hashCode: number;
	}

	export let $hashCount: number = 1;

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
