export interface IHashObject {
	hashCode: number;
}

let hashCount = 1;

export class HashObject implements IHashObject {
	private _hashCode: number;

	public constructor() {
		this._hashCode = hashCount++;
	}

	public get hashCode(): number {
		return this._hashCode;
	}
}
