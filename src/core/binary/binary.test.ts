import { describe, it, expect } from 'vitest'
import { BinaryReader } from './BinaryReader'
import { BinaryWriter } from './BinaryWriter'

describe('BinaryWriter/BinaryReader round-trip', () => {
  it('round-trips fixed-width integers', () => {
    const w = new BinaryWriter()
    w.writeUInt8(0xff).writeUInt16BE(0x1234).writeUInt32BE(0xdeadbeef).writeUInt32LE(0xdeadbeef)
    const r = new BinaryReader(w.toBuffer())
    expect(r.readUInt8()).toBe(0xff)
    expect(r.readUInt16BE()).toBe(0x1234)
    expect(r.readUInt32BE()).toBe(0xdeadbeef)
    expect(r.readUInt32LE()).toBe(0xdeadbeef)
    expect(r.eof()).toBe(true)
  })

  it('round-trips a 4-char record tag', () => {
    const w = new BinaryWriter().writeTag4('vrsn')
    const r = new BinaryReader(w.toBuffer())
    expect(r.readTag4()).toBe('vrsn')
  })

  it('rejects non-4-char tags', () => {
    expect(() => new BinaryWriter().writeTag4('abc')).toThrow()
  })

  it('round-trips null-terminated ASCII strings including empty string', () => {
    const w = new BinaryWriter().writeCString('hello').writeCString('')
    const r = new BinaryReader(w.toBuffer())
    expect(r.readCString()).toBe('hello')
    expect(r.readCString()).toBe('')
    expect(r.eof()).toBe(true)
  })

  it('round-trips UTF-16BE strings with unicode content', () => {
    const samples = ['Café Del Mar', '東京 Anthem', '', 'Björk - Jóga']
    const w = new BinaryWriter()
    for (const s of samples) w.writeUtf16BEString(s)
    const r = new BinaryReader(w.toBuffer())
    for (const s of samples) expect(r.readUtf16BEString()).toBe(s)
  })

  it('round-trips UTF-8 null-terminated strings for Markers2 entry names', () => {
    const w = new BinaryWriter().writeUtf8CString('Drop 🔥').writeUtf8CString('Intro')
    const r = new BinaryReader(w.toBuffer())
    expect(r.readUtf8CString()).toBe('Drop 🔥')
    expect(r.readUtf8CString()).toBe('Intro')
  })

  it('throws on buffer underrun instead of returning garbage', () => {
    const r = new BinaryReader(Buffer.from([1, 2]))
    r.readUInt8()
    expect(() => r.readUInt32BE()).toThrow(RangeError)
  })

  it('seek/skip navigate correctly and respect bounds', () => {
    const r = new BinaryReader(Buffer.from([1, 2, 3, 4, 5]))
    r.skip(2)
    expect(r.readUInt8()).toBe(3)
    r.seek(0)
    expect(r.readUInt8()).toBe(1)
    expect(() => r.seek(99)).toThrow(RangeError)
  })

  it('length-prefixed TLV record round-trips like Serato DB V2', () => {
    const inner = new BinaryWriter().writeUtf16BEString('1.0/Serato Scratch LIVE Database').toBuffer()
    const w = new BinaryWriter().writeTag4('vrsn').writeUInt32BE(inner.length).writeBytes(inner)
    const r = new BinaryReader(w.toBuffer())
    expect(r.readTag4()).toBe('vrsn')
    const len = r.readUInt32BE()
    const payload = r.readBytes(len)
    expect(new BinaryReader(payload).readUtf16BEString()).toBe('1.0/Serato Scratch LIVE Database')
  })
})
