export const DMX_CHANNELS_PER_UNIVERSE = 512

/**
 * One DMX universe: 512 channels, each 0–255. Channel numbers are 1-based
 * everywhere in this codebase (matching how fixtures are addressed on
 * physical hardware); the raw buffer index is channel - 1.
 */
export class Universe {
  private readonly slots = new Uint8Array(DMX_CHANNELS_PER_UNIVERSE)

  setChannel(channel: number, value: number): void {
    if (channel < 1 || channel > DMX_CHANNELS_PER_UNIVERSE) {
      throw new RangeError(`DMX channel out of range: ${channel}`)
    }
    this.slots[channel - 1] = Math.max(0, Math.min(255, Math.round(value)))
  }

  getChannel(channel: number): number {
    if (channel < 1 || channel > DMX_CHANNELS_PER_UNIVERSE) {
      throw new RangeError(`DMX channel out of range: ${channel}`)
    }
    return this.slots[channel - 1]
  }

  clear(): void {
    this.slots.fill(0)
  }

  /** Raw 512-byte snapshot for packet encoders. */
  toBuffer(): Buffer {
    return Buffer.from(this.slots)
  }
}
