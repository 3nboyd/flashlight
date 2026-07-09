/**
 * ArtDmx packet encoder (Art-Net 4). Sent over UDP to port 6454, broadcast
 * (255.255.255.255 or subnet broadcast) or unicast to a node's IP.
 *
 * Layout per the Art-Net 4 spec (art-net.org.uk):
 *   0-7    "Art-Net\0" ASCII id
 *   8-9    OpCode 0x5000 (ArtDmx), LITTLE-endian on the wire
 *   10-11  Protocol version 14, high byte first
 *   12     Sequence (1-255 cycling; 0 = disabled)
 *   13     Physical input port (informational, 0)
 *   14     SubUni: low 8 bits of the 15-bit port-address
 *   15     Net: high 7 bits of the 15-bit port-address
 *   16-17  Length of DMX payload, BIG-endian (even, 2-512)
 *   18+    DMX channel values
 *
 * Note the endianness mismatch is real and per-spec: OpCode is
 * little-endian while Length is big-endian.
 */

export const ARTNET_PORT = 6454

const ARTNET_ID = Buffer.from('Art-Net\0', 'ascii')
const OP_DMX = 0x5000
const PROTOCOL_VERSION = 14

export interface ArtDmxOptions {
  /** 15-bit port-address: (net << 8) | subUni. Plain "universe 0..N" maps directly. */
  universe: number
  sequence?: number
  data: Buffer
}

export function encodeArtDmx({ universe, sequence = 0, data }: ArtDmxOptions): Buffer {
  if (universe < 0 || universe > 0x7fff) {
    throw new RangeError(`Art-Net universe out of range: ${universe}`)
  }
  if (data.length < 2 || data.length > 512) {
    throw new RangeError(`ArtDmx data length must be 2-512, got ${data.length}`)
  }
  // Spec requires an even number of slots.
  const payload = data.length % 2 === 0 ? data : Buffer.concat([data, Buffer.from([0])])

  const packet = Buffer.alloc(18 + payload.length)
  ARTNET_ID.copy(packet, 0)
  packet.writeUInt16LE(OP_DMX, 8)
  packet.writeUInt16BE(PROTOCOL_VERSION, 10)
  packet.writeUInt8(sequence & 0xff, 12)
  packet.writeUInt8(0, 13)
  packet.writeUInt8(universe & 0xff, 14)
  packet.writeUInt8((universe >> 8) & 0x7f, 15)
  packet.writeUInt16BE(payload.length, 16)
  payload.copy(packet, 18)
  return packet
}
