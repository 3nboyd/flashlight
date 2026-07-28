import { describe, it, expect } from 'vitest'
import { Universe } from './Universe'
import { encodeArtDmx, encodeArtPoll, parseArtPollReply, ARTNET_PORT } from './artnet'
import { encodeSacnData, sacnMulticastAddress, SACN_PORT } from './sacn'

describe('Universe', () => {
  it('uses 1-based channel numbers and clamps values to 0-255', () => {
    const u = new Universe()
    u.setChannel(1, 255)
    u.setChannel(512, 300)
    u.setChannel(10, -5)
    expect(u.getChannel(1)).toBe(255)
    expect(u.getChannel(512)).toBe(255)
    expect(u.getChannel(10)).toBe(0)
    expect(u.toBuffer()[0]).toBe(255)
    expect(u.toBuffer()[511]).toBe(255)
  })

  it('rejects out-of-range channels', () => {
    const u = new Universe()
    expect(() => u.setChannel(0, 1)).toThrow(RangeError)
    expect(() => u.setChannel(513, 1)).toThrow(RangeError)
  })

  it('clear() zeroes all channels', () => {
    const u = new Universe()
    u.setChannel(100, 200)
    u.clear()
    expect(u.getChannel(100)).toBe(0)
  })
})

describe('ArtDmx encoder', () => {
  it('produces a byte-exact packet for a full universe', () => {
    const data = Buffer.alloc(512)
    data[0] = 0xaa
    data[511] = 0xbb
    const packet = encodeArtDmx({ universe: 0, sequence: 1, data })

    expect(packet.length).toBe(18 + 512)
    expect(packet.subarray(0, 8).toString('ascii')).toBe('Art-Net\0')
    expect(packet.readUInt16LE(8)).toBe(0x5000) // OpDmx, little-endian
    expect(packet.readUInt16BE(10)).toBe(14) // protocol version, big-endian
    expect(packet[12]).toBe(1) // sequence
    expect(packet[13]).toBe(0) // physical
    expect(packet[14]).toBe(0) // SubUni
    expect(packet[15]).toBe(0) // Net
    expect(packet.readUInt16BE(16)).toBe(512) // length, big-endian
    expect(packet[18]).toBe(0xaa)
    expect(packet[18 + 511]).toBe(0xbb)
  })

  it('splits a 15-bit port-address across SubUni and Net bytes', () => {
    // Universe 0x1234 → Net = 0x12, SubUni = 0x34
    const packet = encodeArtDmx({ universe: 0x1234, data: Buffer.alloc(2) })
    expect(packet[14]).toBe(0x34)
    expect(packet[15]).toBe(0x12)
  })

  it('pads odd-length data to an even slot count per spec', () => {
    const packet = encodeArtDmx({ universe: 0, data: Buffer.from([1, 2, 3]) })
    expect(packet.readUInt16BE(16)).toBe(4)
    expect(packet.length).toBe(18 + 4)
  })

  it('rejects out-of-range universes and data lengths', () => {
    expect(() => encodeArtDmx({ universe: -1, data: Buffer.alloc(2) })).toThrow(RangeError)
    expect(() => encodeArtDmx({ universe: 0x8000, data: Buffer.alloc(2) })).toThrow(RangeError)
    expect(() => encodeArtDmx({ universe: 0, data: Buffer.alloc(0) })).toThrow(RangeError)
    expect(() => encodeArtDmx({ universe: 0, data: Buffer.alloc(513) })).toThrow(RangeError)
  })

  it('exports the standard Art-Net port', () => {
    expect(ARTNET_PORT).toBe(6454)
  })
})

describe('Art-Net discovery (ArtPoll / ArtPollReply)', () => {
  it('encodes a 14-byte ArtPoll with the right id and opcode', () => {
    const poll = encodeArtPoll()
    expect(poll.length).toBe(14)
    expect(poll.toString('ascii', 0, 8)).toBe('Art-Net\0')
    expect(poll.readUInt16LE(8)).toBe(0x2000) // OpPoll
    expect(poll.readUInt16BE(10)).toBe(14) // protocol version
  })

  function fakeReply(ip: number[], shortName: string, longName: string, numPorts: number): Buffer {
    const buf = Buffer.alloc(239)
    Buffer.from('Art-Net\0', 'ascii').copy(buf, 0)
    buf.writeUInt16LE(0x2100, 8) // OpPollReply
    ip.forEach((b, i) => (buf[10 + i] = b))
    buf.writeUInt16LE(6454, 14)
    buf.write(shortName, 26, 'ascii')
    buf.write(longName, 44, 'ascii')
    buf.writeUInt16BE(numPorts, 172)
    return buf
  }

  it('parses a well-formed reply into node info', () => {
    const node = parseArtPollReply(fakeReply([2, 0, 0, 10], 'DMX King', 'eDMX1 Pro Node', 1))
    expect(node).not.toBeNull()
    expect(node!.ip).toBe('2.0.0.10')
    expect(node!.port).toBe(6454)
    expect(node!.shortName).toBe('DMX King')
    expect(node!.longName).toBe('eDMX1 Pro Node')
    expect(node!.numPorts).toBe(1)
  })

  it('rejects non-reply and truncated datagrams instead of throwing', () => {
    expect(parseArtPollReply(encodeArtPoll())).toBeNull() // an ArtPoll, not a reply
    expect(parseArtPollReply(Buffer.from('Art-Net\0hello', 'ascii'))).toBeNull()
    expect(parseArtPollReply(Buffer.from('not artnet at all', 'ascii'))).toBeNull()
    expect(parseArtPollReply(Buffer.alloc(4))).toBeNull()
  })
})

describe('sACN E1.31 encoder', () => {
  const cid = Buffer.from('0123456789abcdef', 'ascii')

  it('produces a byte-exact 638-byte packet for a full universe', () => {
    const data = Buffer.alloc(512)
    data[0] = 0xcc
    data[511] = 0xdd
    const packet = encodeSacnData({
      universe: 1,
      sequence: 7,
      priority: 100,
      cid,
      sourceName: 'DJ Companion',
      data
    })

    expect(packet.length).toBe(638)

    // Root layer
    expect(packet.readUInt16BE(0)).toBe(0x0010) // preamble size
    expect(packet.readUInt16BE(2)).toBe(0x0000) // post-amble size
    expect(packet.subarray(4, 16)).toEqual(
      Buffer.from([0x41, 0x53, 0x43, 0x2d, 0x45, 0x31, 0x2e, 0x31, 0x37, 0x00, 0x00, 0x00])
    )
    expect(packet.readUInt16BE(16)).toBe(0x7000 | (638 - 16)) // root flags+length
    expect(packet.readUInt32BE(18)).toBe(0x00000004) // root vector
    expect(packet.subarray(22, 38)).toEqual(cid)

    // Framing layer
    expect(packet.readUInt16BE(38)).toBe(0x7000 | (638 - 38))
    expect(packet.readUInt32BE(40)).toBe(0x00000002)
    expect(packet.subarray(44, 44 + 12).toString('utf8')).toBe('DJ Companion')
    expect(packet[44 + 63]).toBe(0) // source name null-padded to 64 bytes
    expect(packet[108]).toBe(100) // priority
    expect(packet.readUInt16BE(109)).toBe(0) // sync address
    expect(packet[111]).toBe(7) // sequence
    expect(packet[112]).toBe(0) // options
    expect(packet.readUInt16BE(113)).toBe(1) // universe

    // DMP layer
    expect(packet.readUInt16BE(115)).toBe(0x7000 | (638 - 115))
    expect(packet[117]).toBe(0x02) // DMP vector
    expect(packet[118]).toBe(0xa1) // address & data type
    expect(packet.readUInt16BE(119)).toBe(0) // first property address
    expect(packet.readUInt16BE(121)).toBe(1) // address increment
    expect(packet.readUInt16BE(123)).toBe(513) // property value count
    expect(packet[125]).toBe(0x00) // start code
    expect(packet[126]).toBe(0xcc)
    expect(packet[637]).toBe(0xdd)
  })

  it('computes per-universe multicast groups', () => {
    expect(sacnMulticastAddress(1)).toBe('239.255.0.1')
    expect(sacnMulticastAddress(256)).toBe('239.255.1.0')
    expect(sacnMulticastAddress(1000)).toBe('239.255.3.232')
    expect(SACN_PORT).toBe(5568)
  })

  it('rejects invalid universe, priority, CID, and data sizes', () => {
    const ok = { cid, sourceName: 'x', data: Buffer.alloc(1) }
    expect(() => encodeSacnData({ ...ok, universe: 0 })).toThrow(RangeError)
    expect(() => encodeSacnData({ ...ok, universe: 64000 })).toThrow(RangeError)
    expect(() => encodeSacnData({ ...ok, universe: 1, priority: 201 })).toThrow(RangeError)
    expect(() => encodeSacnData({ ...ok, universe: 1, cid: Buffer.alloc(15) })).toThrow(RangeError)
    expect(() =>
      encodeSacnData({ ...ok, universe: 1, data: Buffer.alloc(513) })
    ).toThrow(RangeError)
  })

  it('truncates over-long source names to fit the 64-byte field', () => {
    const packet = encodeSacnData({
      universe: 1,
      cid,
      sourceName: 'y'.repeat(200),
      data: Buffer.alloc(1)
    })
    expect(packet[44 + 63]).toBe(0) // final byte of the name field stays null
    expect(packet[108]).toBe(100) // priority not overwritten by the name
  })
})
