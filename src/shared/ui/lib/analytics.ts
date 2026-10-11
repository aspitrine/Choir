import type { IdentifyPayload, OpenPanel, TrackProperties } from '@openpanel/web'

// Product analytics, sent to the self-hosted OpenPanel. Off unless a client id
// was baked in at build time: dev, tests and forks send nothing.
const clientId = import.meta.env.VITE_OPENPANEL_CLIENT_ID as string | undefined
const apiUrl = import.meta.env.VITE_OPENPANEL_API_URL as string | undefined

let client: Promise<OpenPanel> | null = null

// Loaded on first use, in the browser only: keeps the SDK out of SSR and of the
// initial bundle. Calls made before it loads are chained, so order is kept.
function withClient(run: (op: OpenPanel) => unknown) {
  if (!clientId || typeof window === 'undefined') return
  client ??= import('@openpanel/web').then(
    ({ OpenPanel }) =>
      new OpenPanel({
        clientId,
        apiUrl,
        // Screen views are sent by hand, with share tokens stripped from the path;
        // outgoing links would leak presigned (signed) file URLs.
        trackScreenViews: false,
        trackOutgoingLinks: false,
        trackAttributes: false,
      }),
  )
  void client.then(run).catch(() => {})
}

export function track(name: string, properties?: TrackProperties) {
  withClient((op) => op.track(name, properties))
}

/** `path` must already be redacted (see `redactPath`). */
export function screenView(path: string, properties?: TrackProperties) {
  withClient((op) => op.screenView(`${window.location.origin}${path}`, properties))
}

export function identify(payload: IdentifyPayload) {
  withClient((op) => op.identify(payload))
}

/** Properties added to every following event (e.g. the active choir). */
export function setGlobalProperties(properties: Record<string, unknown>) {
  withClient((op) => op.setGlobalProperties(properties))
}

/** Forgets the signed-in profile (sign out). */
export function clearIdentity() {
  withClient((op) => op.clear())
}

// A share link token or an invitation id grants access on its own: they must
// never reach the analytics store.
export function redactPath(pathname: string) {
  return pathname
    .replace(/^\/s\/[^/]+/, '/s/:token')
    .replace(/^\/accept-invite\/[^/]+/, '/accept-invite/:invitationId')
}
