import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import { useLightingStore } from '../../state/lightingStore'
import type { OutputDiagnostics as Diagnostics } from '../../../../main/lighting/LightingHost'
import type { DiscoveredNode } from '../../../../main/lighting/ArtNetDiscovery'

/**
 * Output troubleshooting panel: is the app sending, where to, and is a real
 * Art-Net node answering on the wire. Art-Net is fire-and-forget UDP, so this
 * is the only place the app can confirm the network path end to end - packets
 * leaving, plus an ArtPoll scan that proves a node is reachable.
 */
export function OutputDiagnostics(): JSX.Element {
  const { project } = useLightingStore()
  const [diag, setDiag] = useState<Diagnostics | null>(null)
  const [pps, setPps] = useState(0)
  const [scanning, setScanning] = useState(false)
  const [nodes, setNodes] = useState<DiscoveredNode[] | null>(null)
  const [identifyId, setIdentifyId] = useState<string | null>(null)
  const [probeError, setProbeError] = useState<string | null>(null)
  const lastSample = useRef<{ packets: number; ms: number } | null>(null)

  useEffect(() => {
    let alive = true
    const poll = async (): Promise<void> => {
      try {
        const next = await window.djCompanion.lighting.getOutputDiagnostics()
        if (!alive) return
        const now = performance.now()
        const prev = lastSample.current
        if (prev && now > prev.ms) {
          const rate = ((next.packetsSent - prev.packets) / (now - prev.ms)) * 1000
          setPps(Math.max(0, Math.round(rate)))
        }
        lastSample.current = { packets: next.packetsSent, ms: now }
        setDiag(next)
        setProbeError(null)
      } catch (err) {
        // Handler missing (stale build) or engine down: surface it instead of
        // sitting on "Checking output..." forever.
        if (alive) setProbeError(err instanceof Error ? err.message : String(err))
      }
    }
    void poll()
    const interval = setInterval(poll, 700)
    return () => {
      alive = false
      clearInterval(interval)
    }
  }, [])

  const scan = useCallback(async () => {
    setScanning(true)
    try {
      const found = await window.djCompanion.lighting.scanArtNet()
      setNodes(found)
    } finally {
      setScanning(false)
    }
  }, [])

  const toggleIdentify = useCallback(
    async (patchId: string) => {
      const next = identifyId === patchId ? null : patchId
      const active = await window.djCompanion.lighting.identifyFixture(next)
      setIdentifyId(active)
    },
    [identifyId]
  )

  const isArtnet = diag?.protocol === 'artnet'
  const sending = diag?.running && pps > 0

  return (
    <div className="diag">
      {probeError && (
        <div className="banner error">
          Output diagnostics unavailable ({probeError}). Fully quit and reopen the app to load the
          latest build.
        </div>
      )}
      <div className="diag-row">
        <span className={`diag-dot ${sending ? 'ok' : diag?.running ? 'warn' : 'off'}`} />
        <div className="diag-status">
          {!diag ? (
            probeError ? (
              'Output info unavailable - restart the app.'
            ) : (
              'Checking output…'
            )
          ) : !diag.running ? (
            <>
              Output stopped. Press <strong>Start Output</strong> in Perform to begin sending.
            </>
          ) : sending ? (
            <>
              Sending <strong>{pps}</strong> frames/s to <strong>{diag.target}</strong> over{' '}
              {diag.protocol.toUpperCase()}
            </>
          ) : (
            <>Output running but no frames counted yet…</>
          )}
        </div>
      </div>

      {diag?.lastError && <div className="banner error">Output error: {diag.lastError}</div>}

      <div className="diag-block">
        <div className="diag-label">This computer</div>
        {diag && diag.interfaces.length > 0 ? (
          <ul className="diag-iface-list">
            {diag.interfaces.map((iface) => (
              <li key={`${iface.name}-${iface.address}`}>
                <code>{iface.address}</code>
                <span className="diag-iface-name">{iface.name}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="settings-hint">No active network interface found.</p>
        )}
        <p className="settings-hint">
          Your node&apos;s IP must be in the same range as one of these. Classic Art-Net nodes
          default to a 2.x.x.x or 10.x.x.x address; set the Target above to the node&apos;s exact IP
          to force output out the right adapter.
        </p>
      </div>

      {isArtnet && (
        <div className="diag-block">
          <div className="diag-label">
            Art-Net nodes on the network
            <button className="secondary-button" onClick={scan} disabled={scanning}>
              {scanning ? 'Scanning…' : 'Scan for nodes'}
            </button>
          </div>
          {nodes === null ? (
            <p className="settings-hint">
              Scan sends an ArtPoll and lists every node that answers. A reply proves the Ethernet
              path and the node are alive.
            </p>
          ) : nodes.length === 0 ? (
            <div className="banner warn">
              No nodes replied. Check: Ethernet link light, node powered on, your computer and the
              node on the same IP subnet, and no firewall blocking UDP 6454.
            </div>
          ) : (
            <ul className="diag-node-list">
              {nodes.map((node) => (
                <li key={node.from} className="diag-node">
                  <span className="diag-dot ok" />
                  <div>
                    <div className="diag-node-name">{node.shortName || node.longName || 'Art-Net node'}</div>
                    <div className="diag-node-meta">
                      <code>{node.ip}</code>
                      {node.from !== node.ip && <code>via {node.from}</code>}
                      <span>
                        {node.numPorts} DMX port{node.numPorts === 1 ? '' : 's'}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="diag-block">
        <div className="diag-label">Identify a fixture</div>
        {project.patches.length === 0 ? (
          <p className="settings-hint">Patch a fixture first, then test the signal chain to it here.</p>
        ) : (
          <>
            <div className="diag-identify-grid">
              {project.patches.map((patch) => (
                <button
                  key={patch.id}
                  className={`secondary-button${identifyId === patch.id ? ' on' : ''}`}
                  title="Force this fixture full-on white to confirm the whole chain reaches it"
                  onClick={() => toggleIdentify(patch.id)}
                >
                  {identifyId === patch.id ? '● ' : ''}
                  {patch.label} <span className="diag-identify-addr">U{patch.universe}·{patch.address}</span>
                </button>
              ))}
            </div>
            <p className="settings-hint">
              The selected fixture is driven full-on white (Start Output must be running). If it does
              not light, the break is between the node and that fixture: DMX addressing, mode, or the
              wireless link.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
