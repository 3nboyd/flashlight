import { createSocket, type Socket } from 'dgram'
import { randomBytes } from 'crypto'
import { encodeArtDmx, ARTNET_PORT } from '@core/lighting/dmx/artnet'
import { encodeSacnData, sacnMulticastAddress, SACN_PORT } from '@core/lighting/dmx/sacn'

export interface DmxSenderConfig {
  protocol: 'artnet' | 'sacn'
  /** Art-Net destination: '255.255.255.255' broadcast or a node's IP. */
  artnetHost: string
}

/**
 * Owns the UDP socket and per-universe sequence counters. One instance per
 * app; reconfigure() swaps protocol/host without dropping the socket.
 */
export class DmxSender {
  private socket: Socket | null = null
  private config: DmxSenderConfig
  private readonly sequences = new Map<number, number>()
  private readonly cid = randomBytes(16)
  private lastError: string | null = null

  constructor(config: DmxSenderConfig) {
    this.config = config
  }

  private ensureSocket(): Socket {
    if (this.socket) return this.socket
    const socket = createSocket({ type: 'udp4', reuseAddr: true })
    socket.on('error', (err) => {
      this.lastError = err.message
    })
    socket.bind(() => {
      try {
        socket.setBroadcast(true)
        // Keep multicast on-LAN.
        socket.setMulticastTTL(1)
      } catch {
        // Socket may already be closing; error listener captures real failures.
      }
    })
    this.socket = socket
    return socket
  }

  reconfigure(config: DmxSenderConfig): void {
    this.config = config
  }

  getLastError(): string | null {
    return this.lastError
  }

  private nextSequence(universe: number): number {
    const next = ((this.sequences.get(universe) ?? 0) % 255) + 1
    this.sequences.set(universe, next)
    return next
  }

  sendUniverse(universe: number, data: Buffer): void {
    const socket = this.ensureSocket()
    if (this.config.protocol === 'artnet') {
      const packet = encodeArtDmx({ universe, sequence: this.nextSequence(universe), data })
      socket.send(packet, ARTNET_PORT, this.config.artnetHost)
    } else {
      const packet = encodeSacnData({
        universe: Math.max(1, universe), // sACN universes are 1-based
        sequence: this.nextSequence(universe),
        cid: this.cid,
        sourceName: 'DJ Companion',
        data
      })
      socket.send(packet, SACN_PORT, sacnMulticastAddress(Math.max(1, universe)))
    }
  }

  /**
   * Deferred close: dgram sends are queued asynchronously, so closing the
   * socket synchronously right after sendUniverse() can drop the final
   * datagram — which would leave fixtures frozen on the last look instead
   * of receiving the blackout frame sent on shutdown.
   */
  close(delayMs = 150): void {
    const socket = this.socket
    this.socket = null
    if (socket) {
      setTimeout(() => {
        try {
          socket.close()
        } catch {
          // Already closed.
        }
      }, delayMs)
    }
  }
}
