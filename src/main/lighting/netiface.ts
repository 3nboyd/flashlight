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
