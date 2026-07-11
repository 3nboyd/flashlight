import { createServer, type Server, type Socket } from 'net'
import { createSocket, type Socket as DgramSocket } from 'dgram'
import { networkInterfaces, hostname, platform } from 'os'
import { spawn, type ChildProcess } from 'child_process'
import { Os2lStreamParser, type Os2lEvent } from '@core/lighting/os2l/protocol'

export type DiscoveryMode = 'bonjour' | 'udp' | 'off'

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
 * be pointed manually via its `os2lNetworkAddress` setting - the Setup UI
 * shows the exact ip:port to enter.
 */
export class Os2lServer {
  private server: Server | null = null
  private mdns: DgramSocket | null = null
  private mdnsAnnounceTimer: NodeJS.Timeout | null = null
  private bonjourProcess: ChildProcess | null = null
  private discoveryMode: DiscoveryMode = 'off'
  private client: Socket | null = null
  private events: Os2lServerEvents
  private port: number
  private lastError: string | null = null

  constructor(port: number, events: Os2lServerEvents) {
    this.port = port
    this.events = events
  }

  getDiscoveryMode(): DiscoveryMode {
    return this.discoveryMode
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

    this.startDiscovery()
  }

  /**
   * DNS-SD advertisement so VDJ's "auto" mode finds us. On macOS the system
   * Bonjour daemon owns UDP 5353 in a way plain sockets can't share, so the
   * reliable path is registering through it via the stock `dns-sd` CLI.
   * Elsewhere (or if dns-sd is missing) fall back to a minimal built-in
   * multicast responder. Manual pointing (VDJ's os2lDirectIp) always works
   * regardless of what discovery ends up doing.
   */
  private startDiscovery(): void {
    if (platform() === 'darwin') {
      try {
        const child = spawn('dns-sd', ['-R', 'DJ Companion', '_os2l._tcp', '.', String(this.port)], {
          stdio: 'ignore'
        })
        child.on('error', () => {
          this.bonjourProcess = null
          this.discoveryMode = 'off'
          this.startMdnsResponder()
        })
        child.on('exit', () => {
          if (this.bonjourProcess === child) {
            this.bonjourProcess = null
            this.discoveryMode = 'off'
          }
        })
        this.bonjourProcess = child
        this.discoveryMode = 'bonjour'
        return
      } catch {
        // Fall through to the UDP responder.
      }
    }
    this.startMdnsResponder()
  }

  private startMdnsResponder(): void {
    try {
      const socket = createSocket({ type: 'udp4', reuseAddr: true })
      socket.on('error', (err) => {
        // Discovery is best-effort; manual pointing still works.
        this.lastError = `discovery: ${err.message}`
        socket.close()
        this.mdns = null
        this.discoveryMode = 'off'
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
          this.discoveryMode = 'udp'
          // Announce now and re-announce periodically so a DJ app launched
          // later (or one that missed the first packet) still finds us.
          const announce = (): void => {
            const response = this.buildMdnsResponse()
            if (response) socket.send(response, MDNS_PORT, MDNS_ADDRESS)
          }
          announce()
          this.mdnsAnnounceTimer = setInterval(announce, 30000)
        } catch (err) {
          this.lastError = `discovery: ${err instanceof Error ? err.message : String(err)}`
          this.discoveryMode = 'off'
        }
      })
      this.mdns = socket
    } catch (err) {
      this.lastError = `discovery: ${err instanceof Error ? err.message : String(err)}`
      this.mdns = null
      this.discoveryMode = 'off'
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
    if (this.mdnsAnnounceTimer) {
      clearInterval(this.mdnsAnnounceTimer)
      this.mdnsAnnounceTimer = null
    }
    this.mdns?.close()
    this.mdns = null
    const bonjour = this.bonjourProcess
    this.bonjourProcess = null
    bonjour?.kill()
    this.discoveryMode = 'off'
  }
}
