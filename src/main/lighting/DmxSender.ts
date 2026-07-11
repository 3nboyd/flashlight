import { createSocket, type Socket } from 'dgram'
import { randomBytes } from 'crypto'
import { encodeArtDmx, ARTNET_PORT } from '@core/lighting/dmx/artnet'
import { encodeSacnData, sacnMulticastAddress, SACN_PORT } from '@core/lighting/dmx/sacn'
import { encodeEnttecProDmx } from '@core/lighting/dmx/enttec'

export interface DmxSenderConfig {
  protocol: 'artnet' | 'sacn' | 'enttec'
  /** Art-Net destination: '255.255.255.255' broadcast or a node's IP. */
  artnetHost: string
  /** Serial device path for Enttec Pro-compatible interfaces. */
  serialPath: string | null
}

interface SerialPortLike {
  write(data: Buffer): boolean
  close(cb?: (err?: Error | null) => void): void
  isOpen: boolean
}

/**
 * Owns the output transport (UDP socket for Art-Net/sACN, serial port for
 * Enttec Pro USB interfaces) and per-universe sequence counters.
 * `serialport` is loaded lazily so the app runs fine on machines where the
 * native module isn't available; USB output just reports an error instead.
 */
export class DmxSender {
  private socket: Socket | null = null
  private serial: SerialPortLike | null = null
  private serialOpeningPath: string | null = null
  private config: DmxSenderConfig
  private readonly sequences = new Map<number, number>()
  private readonly cid = randomBytes(16)
  private lastError: string | null = null

  constructor(config: DmxSenderConfig) {
    this.config = config
  }

  static async listSerialPorts(): Promise<{ path: string; label: string }[]> {
    try {
      const { SerialPort } = await import('serialport')
      const ports = await SerialPort.list()
      return ports.map((p) => ({
        path: p.path,
        label: [p.manufacturer, p.path].filter(Boolean).join(' - ')
      }))
    } catch {
      return []
    }
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
        socket.setMulticastTTL(1)
      } catch {
        // Socket may already be closing; error listener captures real failures.
      }
    })
    this.socket = socket
    return socket
  }

  private async ensureSerial(): Promise<SerialPortLike | null> {
    const path = this.config.serialPath
    if (!path) {
      this.lastError = 'No serial port selected for USB DMX output'
      return null
    }
    if (this.serial?.isOpen) return this.serial
    if (this.serialOpeningPath === path) return null // open in progress
    this.serialOpeningPath = path
    try {
      const { SerialPort } = await import('serialport')
      const port = new SerialPort({ path, baudRate: 115200 }, (err) => {
        if (err) {
          this.lastError = `USB DMX: ${err.message}`
          this.serial = null
        } else {
          this.lastError = null
        }
        this.serialOpeningPath = null
      })
      port.on('error', (err: Error) => {
        this.lastError = `USB DMX: ${err.message}`
      })
      port.on('close', () => {
        if (this.serial === (port as unknown as SerialPortLike)) this.serial = null
      })
      this.serial = port as unknown as SerialPortLike
      return null // first frames drop while opening; steady state follows
    } catch (err) {
      this.lastError = `serialport module unavailable: ${err instanceof Error ? err.message : String(err)}`
      this.serialOpeningPath = null
      return null
    }
  }

  reconfigure(config: DmxSenderConfig): void {
    const serialChanged =
      config.protocol !== this.config.protocol || config.serialPath !== this.config.serialPath
    this.config = config
    if (serialChanged && this.serial) {
      const serial = this.serial
      this.serial = null
      try {
        serial.close()
      } catch {
        // Already closed.
      }
    }
    if (serialChanged) this.lastError = null
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
    switch (this.config.protocol) {
      case 'artnet': {
        const packet = encodeArtDmx({ universe, sequence: this.nextSequence(universe), data })
        this.ensureSocket().send(packet, ARTNET_PORT, this.config.artnetHost)
        return
      }
      case 'sacn': {
        const u = Math.max(1, universe) // sACN universes are 1-based
        const packet = encodeSacnData({
          universe: u,
          sequence: this.nextSequence(u),
          cid: this.cid,
          sourceName: 'DJ Companion',
          data
        })
        this.ensureSocket().send(packet, SACN_PORT, sacnMulticastAddress(u))
        return
      }
      case 'enttec': {
        if (this.serial?.isOpen) {
          this.serial.write(encodeEnttecProDmx(data))
        } else {
          void this.ensureSerial()
        }
        return
      }
    }
  }

  /**
   * Deferred close: dgram sends are queued asynchronously, so closing the
   * socket synchronously right after sendUniverse() can drop the final
   * datagram - which would leave fixtures frozen on the last look instead
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
    const serial = this.serial
    this.serial = null
    if (serial) {
      setTimeout(() => {
        try {
          serial.close()
        } catch {
          // Already closed.
        }
      }, delayMs)
    }
  }
}
