import { createSocket, type Socket } from 'dgram'
import { encodeArtPoll, parseArtPollReply, ARTNET_PORT, type ArtNetNodeInfo } from '@core/lighting/dmx/artnet'
import { bindAddressFor } from './netiface'

export interface DiscoveredNode extends ArtNetNodeInfo {
  /** Source address of the UDP datagram (what actually answered us). */
  from: string
  /** Wall-clock ms of the most recent reply. */
  lastSeenMs: number
}

/**
 * Art-Net node discovery. Binds the Art-Net port, broadcasts an ArtPoll, and
 * collects the ArtPollReply datagrams every node answers with. A reply is
 * hard proof that the Ethernet path to a node is alive and that it speaks
 * Art-Net, which is the one thing a fire-and-forget ArtDmx sender can never
 * tell you on its own.
 *
 * A scan is one-shot: it opens the port, polls, gathers replies for a short
 * window, then closes so it never fights other Art-Net software for 6454.
 */
export class ArtNetDiscovery {
  private socket: Socket | null = null
  private nodes = new Map<string, DiscoveredNode>()
  private lastError: string | null = null

  getLastError(): string | null {
    return this.lastError
  }

  /**
   * Runs one discovery pass: poll, listen for `windowMs`, return whatever
   * answered. Nodes are keyed by source IP so duplicates collapse. Resolves
   * even if the port cannot be bound (lastError is set), so the UI can show a
   * helpful message instead of hanging.
   */
  scan(broadcastAddress = '255.255.255.255', windowMs = 1500, host?: string): Promise<DiscoveredNode[]> {
    return new Promise((resolve) => {
      this.close()
      this.nodes.clear()
      this.lastError = null

      const socket = createSocket({ type: 'udp4', reuseAddr: true })
      this.socket = socket
      let settled = false
      const finish = (): void => {
        if (settled) return
        settled = true
        this.close()
        resolve(Array.from(this.nodes.values()))
      }

      socket.on('error', (err) => {
        this.lastError = err.message
        finish()
      })

      socket.on('message', (msg, rinfo) => {
        const info = parseArtPollReply(msg)
        if (!info) return
        this.nodes.set(rinfo.address, { ...info, from: rinfo.address, lastSeenMs: Date.now() })
      })

      const onBound = (): void => {
        try {
          socket.setBroadcast(true)
        } catch {
          // Non-fatal; unicast replies still arrive.
        }
        const poll = encodeArtPoll()
        const send = (): void => {
          socket.send(poll, ARTNET_PORT, broadcastAddress)
          // Also poll the configured node directly - some only answer unicast.
          if (host && host !== broadcastAddress) socket.send(poll, ARTNET_PORT, host)
        }
        send()
        // Poll twice: some nodes miss or rate-limit the first request.
        setTimeout(() => {
          if (this.socket === socket) send()
        }, 250)
        setTimeout(finish, windowMs)
      }
      // Bind to the rig's NIC so the poll doesn't go out an unrelated interface
      // (e.g. an iPhone hotspot) - the usual reason a scan finds nothing.
      const bindAddr = host ? bindAddressFor(host) : undefined
      if (bindAddr) socket.bind(ARTNET_PORT, bindAddr, onBound)
      else socket.bind(ARTNET_PORT, onBound)
    })
  }

  close(): void {
    const socket = this.socket
    this.socket = null
    if (socket) {
      try {
        socket.close()
      } catch {
        // Already closed.
      }
    }
  }
}
