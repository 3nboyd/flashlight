import { createServer, type Server, type Socket } from 'net'
import { createSocket, type Socket as DgramSocket } from 'dgram'
import { networkInterfaces, hostname } from 'os'
import { Os2lStreamParser, type Os2lEvent } from '@core/lighting/os2l/protocol'

export interface Os2lServerEvents {
  onEvent: (event: Os2lEvent) => void
  onConnectionChange: (connected: boolean, remote: string | null) => void
}

const MDNS_ADDRESS = '224.0.0.251'
const MDNS_PORT = 5353
const SERVICE = '_os2l._tcp.local'

function encodeDnsName(name: string): Buffer {
  const parts = name.split('.').filter((p) => p.length > 0)
  const chunks: Buffer[] = []
  for (const part of parts) {
    chunks.push(Buffer.from([part.length]), Buffer.from(part, 'ascii'))
  }
  chunks.push(Buffer.from([0]))
  return Buffer.concat(chunks)
}

function record(name: string, type: number, rdata: Buffer, ttl = 120): Buffer {
  const header = Buffer.alloc(10)
  header.writeUInt16BE(type, 0)
  header.writeUInt16BE(0x8001, 2) // IN class, cache-flush bit
  header.writeUInt32BE(ttl, 4)
  header.writeUInt16BE(rdata.length, 8)
  return Buffer.concat([encodeDnsName(name), header, rdata])
}

function localIpv4(): string | null {
  for (const infos of Object.values(networkInterfaces())) {
    for (const info of infos ?? []) {
      if (info.family === 'IPv4' && !info.internal) return info.address
    }
  }
  return null
}

/**
 * OS2L server: we're the DMX side, so we listen on TCP and let the DJ
 * software (VirtualDJ etc.) connect and stream beat/btn/cmd events.
 *
 * Discovery is best-effort: a minimal built-in mDNS responder answers
 * DNS-SD queries for _os2l._tcp so VirtualDJ finds us automatically on
 * most networks. If multicast is blocked (some venue WiFi, VPNs), VDJ can
 * be pointed manually via its `os2lNetworkAddress` setting — the Setup UI
 * shows the exact ip:port to enter.
 */
export class Os2lServer {
  private server: Server | null = null
  private mdns: DgramSocket | null = null
  private client: Socket | null = null
  private events: Os2lServerEvents
  private port: number
  private lastError: string | null = null

  constructor(port: number, events: Os2lServerEvents) {
    this.port = port
    this.events = events
  }

  getPort(): number {
    return this.port
  }

  getAdvertisedAddress(): string {
    return `${localIpv4() ?? '127.0.0.1'}:${this.port}`
  }

  getLastError(): string | null {
    return this.lastError
  }

  isClientConnected(): boolean {
    return this.client !== null
  }

  start(): void {
    if (this.server) return
    this.lastError = null

    const server = createServer((socket) => {
      // OS2L is one audio-software peer at a time; newest connection wins.
      if (this.client) this.client.destroy()
      this.client = socket
      const parser = new Os2lStreamParser()
      this.events.onConnectionChange(true, socket.remoteAddress ?? null)

      socket.on('data', (chunk) => {
        for (const event of parser.feed(chunk)) {
          this.events.onEvent(event)
        }
      })
      const drop = (): void => {
        if (this.client === socket) {
          this.client = null
          this.events.onConnectionChange(false, null)
        }
      }
      socket.on('close', drop)
      socket.on('error', drop)
    })
    server.on('error', (err) => {
      this.lastError = err.message
    })
    server.listen(this.port)
    this.server = server

    this.startMdnsResponder()
  }

  private startMdnsResponder(): void {
    try {
      const socket = createSocket({ type: 'udp4', reuseAddr: true })
      socket.on('error', () => {
        // Discovery is best-effort; manual pointing still works.
        socket.close()
        this.mdns = null
      })
      socket.on('message', (msg, rinfo) => {
        // Respond to any mDNS query mentioning our service name.
        if (msg.length > 12 && msg.readUInt16BE(2) === 0 && msg.includes(Buffer.from('_os2l'))) {
          const response = this.buildMdnsResponse()
          if (response) {
            socket.send(response, MDNS_PORT, MDNS_ADDRESS)
            socket.send(response, rinfo.port, rinfo.address)
          }
        }
      })
      socket.bind(MDNS_PORT, () => {
        try {
          socket.addMembership(MDNS_ADDRESS)
          // Unsolicited announce so already-running VDJ instances notice us.
          const announce = this.buildMdnsResponse()
          if (announce) socket.send(announce, MDNS_PORT, MDNS_ADDRESS)
        } catch {
          // Multicast unavailable — manual pointing still works.
        }
      })
      this.mdns = socket
    } catch {
      this.mdns = null
    }
  }

  private buildMdnsResponse(): Buffer | null {
    const ip = localIpv4()
    if (!ip) return null
    const host = `${hostname().split('.')[0]}.local`
    const instance = `DJ Companion.${SERVICE}`

    const header = Buffer.alloc(12)
    header.writeUInt16BE(0x8400, 2) // authoritative response
    header.writeUInt16BE(4, 6) // answer count

    const ptr = record(SERVICE, 12, encodeDnsName(instance))
    const srvData = Buffer.concat([
      Buffer.from([0, 0, 0, 0]), // priority, weight
      (() => {
        const b = Buffer.alloc(2)
        b.writeUInt16BE(this.port, 0)
        return b
      })(),
      encodeDnsName(host)
    ])
    const srv = record(instance, 33, srvData)
    const txt = record(instance, 16, Buffer.from([0]))
    const a = record(host, 1, Buffer.from(ip.split('.').map(Number)))

    return Buffer.concat([header, ptr, srv, txt, a])
  }

  stop(): void {
    this.client?.destroy()
    this.client = null
    this.server?.close()
    this.server = null
    this.mdns?.close()
    this.mdns = null
  }
}
