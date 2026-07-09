/**
 * Enttec DMX USB Pro serial framing — the de-facto standard for USB-to-DMX
 * interfaces (the genuine Pro and its many clones). Each API frame is:
 *
 *   0x7E                       start delimiter
 *   label (1 byte)             6 = "Output Only Send DMX Packet Request"
 *   length LSB, length MSB     payload length (start code + slots)
 *   payload                    0x00 DMX start code, then up to 512 slots
 *   0xE7                       end delimiter
 *
 * NOTE: the original "Open DMX USB" (raw FTDI, no microcontroller) is NOT
 * supported — it requires bit-banged break timing that can't be done
 * reliably from JavaScript. Pro-compatible interfaces handle timing on
 * their own MCU, which is exactly why they're the ones we target.
 */

const START_DELIMITER = 0x7e
const END_DELIMITER = 0xe7
const LABEL_OUTPUT_DMX = 6
const DMX_START_CODE = 0x00

export function encodeEnttecProDmx(data: Buffer): Buffer {
  if (data.length < 1 || data.length > 512) {
    throw new RangeError(`Enttec DMX data length must be 1-512, got ${data.length}`)
  }
  const payloadLength = data.length + 1 // + start code
  const frame = Buffer.alloc(5 + payloadLength)
  frame[0] = START_DELIMITER
  frame[1] = LABEL_OUTPUT_DMX
  frame[2] = payloadLength & 0xff
  frame[3] = (payloadLength >> 8) & 0xff
  frame[4] = DMX_START_CODE
  data.copy(frame, 5)
  frame[frame.length - 1] = END_DELIMITER
  return frame
}
