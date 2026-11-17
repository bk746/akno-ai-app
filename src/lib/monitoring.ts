/* update45 · Sentry optionnel côté navigateur : actif seulement si VITE_SENTRY_DSN est défini.
   Envoi minimal par l'API « envelope » (pas de SDK, pas de dépendance). Aucune donnée client n'est jointe. */
const DSN = (import.meta.env.VITE_SENTRY_DSN as string | undefined) || ""

function parse(dsn: string) {
  const m = /^https:\/\/([^@]+)@([^/]+)\/(\d+)$/.exec(dsn.trim())
  return m ? { key: m[1], host: m[2], project: m[3] } : null
}

let sent = 0
export function reportClientError(err: unknown, context?: Record<string, unknown>) {
  const d = parse(DSN)
  if (!d || sent > 20) return
  sent++
  const e = err instanceof Error ? err : new Error(String(err))
  const event = {
    event_id: crypto.randomUUID().replace(/-/g, ""),
    timestamp: Date.now() / 1000,
    platform: "javascript",
    level: "error",
    environment: import.meta.env.MODE,
    request: { url: location.origin + location.pathname },
    exception: { values: [{ type: e.name, value: e.message, stacktrace: e.stack ? { frames: e.stack.split("\n").slice(0, 30).map(l => ({ function: l.trim() })) } : undefined }] },
    extra: context,
  }
  const body = `${JSON.stringify({ event_id: event.event_id, dsn: DSN })}\n${JSON.stringify({ type: "event" })}\n${JSON.stringify(event)}`
  void fetch(`https://${d.host}/api/${d.project}/envelope/?sentry_key=${d.key}&sentry_version=7`, { method: "POST", body, keepalive: true }).catch(() => {})
}

export function initMonitoring() {
  if (!parse(DSN)) return
  addEventListener("error", e => reportClientError(e.error || e.message))
  addEventListener("unhandledrejection", e => reportClientError(e.reason))
}
