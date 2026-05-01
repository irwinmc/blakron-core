const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const lookup = new Uint8Array(256);
for (let i = 0; i < CHARS.length; i++) {
	lookup[CHARS.charCodeAt(i)] = i;
}

export class Base64Util {
	public static encode(buffer: ArrayBuffer): string {
		const bytes = new Uint8Array(buffer);
		const len = bytes.length;
		let base64 = '';

		for (let i = 0; i < len; i += 3) {
			base64 += CHARS[bytes[i] >> 2];
			base64 += CHARS[((bytes[i] & 3) << 4) | (bytes[i + 1] >> 4)];
			base64 += CHARS[((bytes[i + 1] & 15) << 2) | (bytes[i + 2] >> 6)];
			base64 += CHARS[bytes[i + 2] & 63];
		}

		if (len % 3 === 2) return base64.slice(0, -1) + '=';
		if (len % 3 === 1) return base64.slice(0, -2) + '==';
		return base64;
	}

	public static decode(base64: string): ArrayBuffer {
		const len = base64.length;
		let bufferLength = len * 0.75;
		if (base64[len - 1] === '=') bufferLength--;
		if (base64[len - 2] === '=') bufferLength--;

		const buffer = new ArrayBuffer(bufferLength);
		const bytes = new Uint8Array(buffer);
		let p = 0;

		for (let i = 0; i < len; i += 4) {
			const e1 = lookup[base64.charCodeAt(i)];
			const e2 = lookup[base64.charCodeAt(i + 1)];
			const e3 = lookup[base64.charCodeAt(i + 2)];
			const e4 = lookup[base64.charCodeAt(i + 3)];
			bytes[p++] = (e1 << 2) | (e2 >> 4);
			bytes[p++] = ((e2 & 15) << 4) | (e3 >> 2);
			bytes[p++] = ((e3 & 3) << 6) | (e4 & 63);
		}

		return buffer;
	}
}
