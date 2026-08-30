import { networkInterfaces } from 'os'

/**
 * Picks which network interface Art-Net traffic should go out of. With several
 * networks connected at once (e.g. an iPhone hotspot on Wi-Fi plus a USB
 * Ethernet adapter wired to the lighting rig), a UDP socket bound to 0.0.0.0
 * sends broadcasts - and ArtPoll discovery - out the DEFAULT interface, which is
 * usually NOT the rig. Binding the socket to the local address on the same
 * subnet as the Art-Net host forces the packets out the right NIC.
 */

function ipToInt(ip: string): number | null {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((o) => !Number.isInteger(o) || o < 0 || o > 255)) return null
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0
}

function intToIp(n: number): string {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.')
}

export interface NetIface {
  name: string
  address: string
  netmask: string
  /** Directed broadcast for this interface's subnet (e.g. 2.0.0.100/8 -> 2.255.255.255). */
  broadcast: string
  /** Looks like an Art-Net/lighting network (2.x or 10.x), not a home/hotspot LAN. */
  artnetLikely: boolean
}

/** All usable IPv4 interfaces with their directed-broadcast addresses. */
export function listCandidates(): NetIface[] {
  const out: NetIface[] = []
  for (const [name, list] of Object.entries(networkInterfaces())) {
    for (const ni of list ?? []) {
      const isV4 = ni.family === 'IPv4' || (ni.family as unknown) === 4
      if (!isV4 || ni.internal) continue
      const a = ipToInt(ni.address)
      const m = ipToInt(ni.netmask)
      if (a == null || m == null) continue
      const bcast = intToIp((a | (~m >>> 0)) >>> 0)
      out.push({
        name,
        address: ni.address,
        netmask: ni.netmask,
        broadcast: bcast,
        artnetLikely: ni.address.startsWith('2.') || ni.address.startsWith('10.')
      })
    }
  }
  return out
}

/**
 * Best guess at the rig's interface: prefer the Art-Net convention (2.0.0.0/8),
 * then 10.x, then any wired network that isn't an iPhone hotspot (172.20.10.x)
 * or a typical home Wi-Fi (192.168.x). Used by the one-button auto-connect.
 */
export function pickArtnetInterface(): NetIface | undefined {
  const c = listCandidates()
  return (
    c.find((i) => i.address.startsWith('2.')) ??
    c.find((i) => i.address.startsWith('10.')) ??
    c.find((i) => !i.address.startsWith('172.20.10.') && !i.address.startsWith('192.168.')) ??
    c[0]
  )
}

/**
 * Local IPv4 address on the same subnet as `host`, or undefined to let the OS
 * choose (0.0.0.0). A global broadcast (255.255.255.255) is ambiguous across
 * interfaces, so we can't pick for it.
 */
export function bindAddressFor(host: string): string | undefined {
  if (!host || host === '255.255.255.255') return undefined
  const hostInt = ipToInt(host)
  if (hostInt == null) return undefined
  for (const list of Object.values(networkInterfaces())) {
    for (const ni of list ?? []) {
      const isV4 = ni.family === 'IPv4' || (ni.family as unknown) === 4
      if (!isV4 || ni.internal) continue
      const addr = ipToInt(ni.address)
      const mask = ipToInt(ni.netmask)
      if (addr == null || mask == null) continue
      if ((addr & mask) === (hostInt & mask)) return ni.address
    }
  }
  return undefined
}
