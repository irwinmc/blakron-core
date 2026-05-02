import { describe, it, expect } from 'vitest';
import { ByteArray, Endian } from '../src/blakron/utils/ByteArray.js';

describe('ByteArray', () => {
	it('empty constructor', () => {
		const ba = new ByteArray();
		expect(ba.length).toBe(0);
		expect(ba.position).toBe(0);
	});

	it('construct from ArrayBuffer', () => {
		const buf = new Uint8Array([1, 2, 3]).buffer;
		const ba = new ByteArray(buf);
		expect(ba.length).toBe(3);
	});

	it('construct from Uint8Array', () => {
		const ba = new ByteArray(new Uint8Array([10, 20]));
		expect(ba.length).toBe(2);
	});

	it('writeBoolean / readBoolean', () => {
		const ba = new ByteArray();
		ba.writeBoolean(true);
		ba.writeBoolean(false);
		ba.position = 0;
		expect(ba.readBoolean()).toBe(true);
		expect(ba.readBoolean()).toBe(false);
	});

	it('writeByte / readByte signed', () => {
		const ba = new ByteArray();
		ba.writeByte(-1);
		ba.writeByte(127);
		ba.position = 0;
		expect(ba.readByte()).toBe(-1);
		expect(ba.readByte()).toBe(127);
	});

	it('writeUnsignedByte / readUnsignedByte', () => {
		const ba = new ByteArray();
		ba.writeUnsignedByte(0);
		ba.writeUnsignedByte(255);
		ba.position = 0;
		expect(ba.readUnsignedByte()).toBe(0);
		expect(ba.readUnsignedByte()).toBe(255);
	});

	it('writeShort / readShort', () => {
		const ba = new ByteArray();
		ba.writeShort(-32768);
		ba.writeShort(32767);
		ba.position = 0;
		expect(ba.readShort()).toBe(-32768);
		expect(ba.readShort()).toBe(32767);
	});

	it('writeInt / readInt', () => {
		const ba = new ByteArray();
		ba.writeInt(-100000);
		ba.writeInt(100000);
		ba.position = 0;
		expect(ba.readInt()).toBe(-100000);
		expect(ba.readInt()).toBe(100000);
	});

	it('writeFloat / readFloat', () => {
		const ba = new ByteArray();
		ba.writeFloat(3.14);
		ba.position = 0;
		expect(ba.readFloat()).toBeCloseTo(3.14, 2);
	});

	it('writeDouble / readDouble', () => {
		const ba = new ByteArray();
		ba.writeDouble(Math.PI);
		ba.position = 0;
		expect(ba.readDouble()).toBeCloseTo(Math.PI, 14);
	});

	it('writeUTF / readUTF ASCII', () => {
		const ba = new ByteArray();
		ba.writeUTF('hello');
		ba.position = 0;
		expect(ba.readUTF()).toBe('hello');
	});

	it('writeUTF / readUTF Chinese + emoji', () => {
		const ba = new ByteArray();
		const text = '你好世界🎮';
		ba.writeUTF(text);
		ba.position = 0;
		expect(ba.readUTF()).toBe(text);
	});

	it('writeUTFBytes / readUTFBytes', () => {
		const ba = new ByteArray();
		const text = 'test';
		ba.writeUTFBytes(text);
		const len = ba.position;
		ba.position = 0;
		expect(ba.readUTFBytes(len)).toBe(text);
	});

	it('endian switch', () => {
		const ba = new ByteArray();
		ba.endian = Endian.LITTLE_ENDIAN;
		ba.writeInt(0x01020304);
		ba.position = 0;
		ba.endian = Endian.BIG_ENDIAN;
		const bigEndianValue = ba.readInt();
		expect(bigEndianValue).not.toBe(0x01020304);

		ba.position = 0;
		ba.endian = Endian.LITTLE_ENDIAN;
		expect(ba.readInt()).toBe(0x01020304);
	});

	it('writeBytes / readBytes cross-ByteArray', () => {
		const src = new ByteArray();
		src.writeInt(42);
		src.writeInt(99);

		const dst = new ByteArray();
		src.position = 0;
		dst.writeBytes(src, 0, src.length);

		dst.position = 0;
		expect(dst.readInt()).toBe(42);
		expect(dst.readInt()).toBe(99);
	});

	it('auto-expands on write', () => {
		const ba = new ByteArray();
		for (let i = 0; i < 100; i++) ba.writeInt(i);
		expect(ba.length).toBe(400);
		ba.position = 0;
		for (let i = 0; i < 100; i++) expect(ba.readInt()).toBe(i);
	});

	it('read past end throws RangeError', () => {
		const ba = new ByteArray();
		ba.writeByte(1);
		ba.position = 0;
		ba.readByte(); // ok
		expect(() => ba.readByte()).toThrow(RangeError);
	});

	it('clear resets state', () => {
		const ba = new ByteArray();
		ba.writeInt(42);
		ba.clear();
		expect(ba.length).toBe(0);
		expect(ba.position).toBe(0);
	});

	it('position setter extends writePosition', () => {
		const ba = new ByteArray();
		ba.position = 10;
		expect(ba.length).toBe(10);
	});

	it('buffer getter returns truncated copy', () => {
		const ba = new ByteArray(undefined, 1024);
		ba.writeInt(42);
		const buf = ba.buffer;
		expect(buf.byteLength).toBe(4);
	});

	it('bytesAvailable reflects remaining', () => {
		const ba = new ByteArray();
		ba.writeInt(1);
		ba.writeInt(2);
		ba.position = 0;
		expect(ba.readAvailable).toBe(8);
		ba.readInt();
		expect(ba.readAvailable).toBe(4);
	});
});
