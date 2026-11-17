import { env } from "./mail.js"

/** Envoi minimal d'une erreur à Sentry (sans SDK). Inactif si SENTRY_DSN n'est pas défini. */
export async function reportError(err: unknown, context?: Record<string, unknown>) {
  const dsn = (env("SENTRY_DSN") || "").trim()
  const message = err instanceof Error ? err.message : String(err)
  console.error("[akno]", message, context || "")
  if (!dsn) return
  try {
    const u = new URL(dsn)
    const key = u.username
    const project = u.pathname.replace(/^\//, "")
    const id = crypto.randomUUID().replace(/-/g, "")
    const event = {
      event_id: id,
      timestamp: new Date().toISOString(),
      platform: "node",
      level: "error",
      environment: env("VERCEL_ENV") || "development",
      server_name: "akno-api",
      exception: { values: [{ type: err instanceof Error ? err.name : "Error", value: message, stacktrace: err instanceof Error && err.stack ? { frames: err.stack.split("\n").slice(1, 15).reverse().map(l => ({ function: l.trim() })) } : undefined }] },
      extra: context,
    }
    const body = `${JSON.stringify({ event_id: id, sent_at: new Date().toISOString(), dsn })}\n${JSON.stringify({ type: "event" })}\n${JSON.stringify(event)}`
    await fetch(`${u.protocol}//${u.host}/api/${project}/envelope/?sentry_key=${key}&sentry_version=7`, { method: "POST", body, headers: { "Content-Type": "application/x-sentry-envelope" } })
  } catch { /* le monitoring ne doit jamais casser une requête */ }
}
