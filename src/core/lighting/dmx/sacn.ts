/**
 * sACN (ANSI E1.31-2016) data packet encoder. Sent over UDP to port 5568,
 * normally to the per-universe multicast group 239.255.<hi>.<lo>.
 *
 * A full-universe packet is 638 bytes across three nested layers, each with
 * a "flags & length" field whose top nibble is 0x7 and whose low 12 bits
 * hold the byte count from that field to the end of the packet:
 *
 *   Root layer     (0-37):   preamble 0x0010, postamble 0x0000,
 *                            "ASC-E1.17\0\0\0" id, flags+len, vector 4, CID
 *   Framing layer  (38-114): flags+len, vector 2, source name (64B),
 *                            priority, sync addr, sequence, options, universe
 *   DMP layer      (115+):   flags+len, vector 0x02, addr type 0xa1,
 *                            first addr 0, increment 1, count = 1+slots,
 *                            start code 0x00, then DMX slots
 */

export const SACN_PORT = 5568

const ACN_PACKET_ID = Buffer.from([
  0x41, 0x53, 0x43, 0x2d, 0x45, 0x31, 0x2e, 0x31, 0x37, 0x00, 0x00, 0x00
])
const VECTOR_ROOT_E131_DATA = 0x00000004
const VECTOR_E131_DATA_PACKET = 0x00000002
const VECTOR_DMP_SET_PROPERTY = 0x02

export interface SacnDataOptions {
  universe: number
  sequence?: number
  priority?: number
  /** 16-byte stable sender id (CID). Same value for the app's lifetime. */
  cid: Buffer
  sourceName: string
  data: Buffer
}

function flagsAndLength(lengthFromHere: number): number {
  return 0x7000 | (lengthFromHere & 0x0fff)
}

export function sacnMulticastAddress(universe: number): string {
  return `239.255.${(universe >> 8) & 0xff}.${universe & 0xff}`
}

export function encodeSacnData({
  universe,
  sequence = 0,
  priority = 100,
  cid,
  sourceName,
  data
}: SacnDataOptions): Buffer {
  if (universe < 1 || universe > 63999) {
    throw new RangeError(`sACN universe out of range (1-63999): ${universe}`)
  }
  if (priority < 0 || priority > 200) {
    throw new RangeError(`sACN priority out of range (0-200): ${priority}`)
  }
  if (cid.length !== 16) {
    throw new RangeError(`sACN CID must be exactly 16 bytes, got ${cid.length}`)
  }
  if (data.length < 1 || data.length > 512) {
    throw new RangeError(`sACN data length must be 1-512, got ${data.length}`)
  }

  const packetLength = 126 + data.length
  const packet = Buffer.alloc(packetLength)

  // Root layer
  packet.writeUInt16BE(0x0010, 0) // preamble size
  packet.writeUInt16BE(0x0000, 2) // post-amble size
  ACN_PACKET_ID.copy(packet, 4)
  packet.writeUInt16BE(flagsAndLength(packetLength - 16), 16)
  packet.writeUInt32BE(VECTOR_ROOT_E131_DATA, 18)
  cid.copy(packet, 22)

  // Framing layer
  packet.writeUInt16BE(flagsAndLength(packetLength - 38), 38)
  packet.writeUInt32BE(VECTOR_E131_DATA_PACKET, 40)
  packet.write(sourceName.slice(0, 63), 44, 'utf8') // 64-byte field, null-padded by alloc
  packet.writeUInt8(priority, 108)
  packet.writeUInt16BE(0, 109) // synchronization address: none
  packet.writeUInt8(sequence & 0xff, 111)
  packet.writeUInt8(0, 112) // options
  packet.writeUInt16BE(universe, 113)

  // DMP layer
  packet.writeUInt16BE(flagsAndLength(packetLength - 115), 115)
  packet.writeUInt8(VECTOR_DMP_SET_PROPERTY, 117)
  packet.writeUInt8(0xa1, 118) // address type & data type
  packet.writeUInt16BE(0x0000, 119) // first property address
  packet.writeUInt16BE(0x0001, 121) // address increment
  packet.writeUInt16BE(1 + data.length, 123) // property value count (start code + slots)
  packet.writeUInt8(0x00, 125) // DMX start code
  data.copy(packet, 126)

  return packet
}
