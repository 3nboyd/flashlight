/** Cursor-based big/little-endian reader over a Buffer, used by every binary DJ format parser. */
export class BinaryReader {
  private offset = 0

  constructor(private readonly buf: Buffer) {}

  get position(): number {
    return this.offset
  }

  get remaining(): number {
    return this.buf.length - this.offset
  }

  seek(offset: number): void {
    if (offset < 0 || offset > this.buf.length) {
      throw new RangeError(`Seek out of bounds: ${offset} (length ${this.buf.length})`)
    }
    this.offset = offset
  }

  skip(count: number): void {
    this.seek(this.offset + count)
  }

  eof(): boolean {
    return this.offset >= this.buf.length
  }

  private ensure(count: number): void {
    if (this.offset + count > this.buf.length) {
      throw new RangeError(
        `Buffer underrun: need ${count} bytes at offset ${this.offset}, have ${this.remaining}`
      )
    }
  }

  readUInt8(): number {
    this.ensure(1)
    const value = this.buf.readUInt8(this.offset)
    this.offset += 1
    return value
  }

  readInt8(): number {
    this.ensure(1)
    const value = this.buf.readInt8(this.offset)
    this.offset += 1
    return value
  }

  readBool(): boolean {
    return this.readUInt8() !== 0
  }

  readUInt16BE(): number {
    this.ensure(2)
    const value = this.buf.readUInt16BE(this.offset)
    this.offset += 2
    return value
  }

  readUInt32BE(): number {
    this.ensure(4)
    const value = this.buf.readUInt32BE(this.offset)
    this.offset += 4
    return value
  }

  readUInt32LE(): number {
    this.ensure(4)
    const value = this.buf.readUInt32LE(this.offset)
    this.offset += 4
    return value
  }

  readInt32BE(): number {
    this.ensure(4)
    const value = this.buf.readInt32BE(this.offset)
    this.offset += 4
    return value
  }

  readFloatBE(): number {
    this.ensure(4)
    const value = this.buf.readFloatBE(this.offset)
    this.offset += 4
    return value
  }

  readBytes(count: number): Buffer {
    this.ensure(count)
    const value = this.buf.subarray(this.offset, this.offset + count)
    this.offset += count
    return value
  }

  /** 4-char ASCII record tag, as used by Serato's database V2 / crate TLV format. */
  readTag4(): string {
    return this.readBytes(4).toString('ascii')
  }

  /** Null-terminated ASCII/Latin1 string, as used inside GEOB entry headers. */
  readCString(encoding: 'ascii' | 'latin1' | 'utf8' = 'ascii'): string {
    const start = this.offset
    while (this.offset < this.buf.length && this.buf[this.offset] !== 0) {
      this.offset += 1
    }
    const value = this.buf.subarray(start, this.offset).toString(encoding)
    if (this.offset < this.buf.length) this.offset += 1 // consume terminator
    return value
  }

  /** UTF-16BE string, null-terminated by a 0x0000 code unit - Serato DB V2 text fields. */
  readUtf16BEString(byteLength?: number): string {
    if (byteLength !== undefined) {
      const bytes = this.readBytes(byteLength)
      return bytes.swap16().toString('utf16le').replace(/\0+$/, '')
    }
    const start = this.offset
    while (this.offset + 1 < this.buf.length) {
      if (this.buf[this.offset] === 0 && this.buf[this.offset + 1] === 0) break
      this.offset += 2
    }
    const bytes = this.buf.subarray(start, this.offset)
    if (this.offset + 1 < this.buf.length) this.offset += 2 // consume terminator
    return Buffer.from(bytes).swap16().toString('utf16le')
  }

  /** Null-terminated UTF-8 string - used inside Serato Markers2 entry payloads. */
  readUtf8CString(): string {
    return this.readCString('utf8')
  }
}
