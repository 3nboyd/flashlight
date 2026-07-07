/** Growable byte buffer writer mirroring BinaryReader's encodings, for round-trip fidelity. */
export class BinaryWriter {
  private chunks: Buffer[] = []

  get length(): number {
    return this.chunks.reduce((sum, c) => sum + c.length, 0)
  }

  writeUInt8(value: number): this {
    const b = Buffer.alloc(1)
    b.writeUInt8(value, 0)
    this.chunks.push(b)
    return this
  }

  writeBool(value: boolean): this {
    return this.writeUInt8(value ? 1 : 0)
  }

  writeUInt16BE(value: number): this {
    const b = Buffer.alloc(2)
    b.writeUInt16BE(value, 0)
    this.chunks.push(b)
    return this
  }

  writeUInt32BE(value: number): this {
    const b = Buffer.alloc(4)
    b.writeUInt32BE(value, 0)
    this.chunks.push(b)
    return this
  }

  writeUInt32LE(value: number): this {
    const b = Buffer.alloc(4)
    b.writeUInt32LE(value, 0)
    this.chunks.push(b)
    return this
  }

  writeFloatBE(value: number): this {
    const b = Buffer.alloc(4)
    b.writeFloatBE(value, 0)
    this.chunks.push(b)
    return this
  }

  writeBytes(bytes: Buffer | Uint8Array): this {
    this.chunks.push(Buffer.from(bytes))
    return this
  }

  writeTag4(tag: string): this {
    if (tag.length !== 4) throw new Error(`Record tag must be exactly 4 chars, got "${tag}"`)
    return this.writeBytes(Buffer.from(tag, 'ascii'))
  }

  writeCString(value: string, encoding: 'ascii' | 'latin1' | 'utf8' = 'ascii'): this {
    this.writeBytes(Buffer.from(value, encoding))
    return this.writeUInt8(0)
  }

  writeUtf16BEString(value: string, withTerminator = true): this {
    const utf16le = Buffer.from(value, 'utf16le')
    const utf16be = utf16le.length > 0 ? Buffer.from(utf16le).swap16() : utf16le
    this.writeBytes(utf16be)
    if (withTerminator) this.writeUInt16BE(0)
    return this
  }

  writeUtf8CString(value: string): this {
    return this.writeCString(value, 'utf8')
  }

  toBuffer(): Buffer {
    return Buffer.concat(this.chunks)
  }
}
