import { defineConfig, type Plugin } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

type Req = { method?: string; url?: string; headers: { authorization?: string; host?: string } & Record<string, string | undefined>; on?: (ev: string, cb: (x?: unknown) => void) => void }
type Res = { statusCode: number; setHeader: (k: string, v: string) => void; end: (b?: string) => void }

function readRaw(req: Req): Promise<string> {
  // Octets bruts puis décodage UTF-8 unique (un caractère accentué coupé entre deux paquets reste intact)
  return new Promise((resolve, reject) => {
    const parts: Uint8Array[] = []
    if (!req.on) { resolve(""); return }
    req.on("data", chunk => { parts.push(typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk as Uint8Array) })
    req.on("end", () => {
      const all = new Uint8Array(parts.reduce((a, p) => a + p.length, 0))
      let o = 0
      for (const p of parts) { all.set(p, o); o += p.length }
      resolve(new TextDecoder().decode(all))
    })
    req.on("error", reject)
  })
}

/** Les webhooks / formulaires publics utilisent le format Web standard (Request → Response). */
async function webStandard(req: Req, res: Res, mod: { POST?: (r: Request) => Promise<Response> | Response; OPTIONS?: () => Response }) {
  const raw = req.method === "POST" ? await readRaw(req) : ""
  const headers = new Headers()
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v)
  const request = new Request(`http://${req.headers.host || "localhost"}${req.url || "/"}`, { method: req.method, headers, body: req.method === "POST" ? raw : undefined })
  const fn = req.method === "OPTIONS" ? mod.OPTIONS : req.method === "POST" ? mod.POST : undefined
  const response = fn ? await fn(request) : new Response(JSON.stringify({ error: "Méthode non autorisée." }), { status: 405 })
  res.statusCode = response.status
  response.headers.forEach((v, k) => res.setHeader(k, v))
  res.end(await response.text())
}

function json(res: Res, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader("Content-Type", "application/json")
  res.setHeader("Cache-Control", "no-store")
  res.end(JSON.stringify(body))
}

const API = new Set(["/api/voice-token", "/api/booking", "/api/devis", "/api/relances", "/api/devis-public", "/api/resend-webhook", "/api/notify", "/api/account", "/api/stripe-webhook", "/api/lead", "/api/twilio"])
const WEB_STANDARD: Record<string, () => Promise<{ POST?: (r: Request) => Promise<Response> | Response; OPTIONS?: () => Response }>> = {
  "/api/resend-webhook": () => import("./api/resend-webhook"),
  "/api/stripe-webhook": () => import("./api/stripe-webhook"),
  "/api/lead": () => import("./api/lead"),
  "/api/twilio": () => import("./api/twilio"),
}

function apiDev(): Plugin {
  const middleware = async (req: Req, res: Res, next: () => void) => {
    const path = req.url?.split("?")[0] || ""
    if (!API.has(path)) return next()
    try {
      if (WEB_STANDARD[path]) { await webStandard(req, res, await WEB_STANDARD[path]()); return }
      if (req.method === "OPTIONS") { res.statusCode = 204; res.end(); return }
      if (path === "/api/voice-token") {
        if (req.method !== "POST") { json(res, 405, { error: "Méthode non autorisée." }); return }
        const { mintVoiceToken } = await import("./api/voice-token")
        const result = await mintVoiceToken(req.headers.authorization)
        json(res, result.status, result.body)
        return
      }
      if (path === "/api/booking") {
        if (req.method !== "POST") { json(res, 405, { error: "Méthode non autorisée." }); return }
        const raw = await readRaw(req)
        const { handleBooking } = await import("./api/booking")
        const result = await handleBooking(req.headers.authorization, raw ? JSON.parse(raw) : {})
        json(res, result.status, result.body)
        return
      }
      if (path === "/api/devis") {
        if (req.method !== "POST") { json(res, 405, { error: "Méthode non autorisée." }); return }
        const raw = await readRaw(req)
        const { handleDevis } = await import("./api/devis")
        const result = await handleDevis(req.headers.authorization, raw ? JSON.parse(raw) : {})
        json(res, result.status, result.body)
        return
      }
      if (path === "/api/relances") {
        const { handleRelancesCron } = await import("./api/relances")
        const result = await handleRelancesCron(req.headers.authorization, { forceReport: /[?&]report=1/.test(req.url || "") })
        json(res, result.status, result.body)
        return
      }
      if (path === "/api/devis-public") {
        const raw = req.method === "POST" ? await readRaw(req) : ""
        const { handleDevisPublic } = await import("./api/devis-public")
        const result = await handleDevisPublic(req.method, req.url, raw ? JSON.parse(raw) : {}, req.headers)
        json(res, result.status, result.body)
        return
      }
      if (path === "/api/notify") {
        if (req.method !== "POST") { json(res, 405, { error: "Méthode non autorisée." }); return }
        const raw = await readRaw(req)
        const { handleNotify } = await import("./api/notify")
        const result = await handleNotify(req.headers.authorization, raw ? JSON.parse(raw) : {})
        json(res, result.status, result.body)
        return
      }
      if (path === "/api/account") {
        if (req.method !== "POST") { json(res, 405, { error: "Méthode non autorisée." }); return }
        const raw = await readRaw(req)
        const { handleAccount } = await import("./api/account")
        const result = await handleAccount(req.headers.authorization, raw ? JSON.parse(raw) : {}, req.headers)
        json(res, result.status, result.body)
        return
      }
    } catch {
      json(res, 500, { error: "Erreur serveur." })
    }
  }
  return {
    name: "akno-api-dev",
    configureServer(server) { server.middlewares.use(middleware as never) },
    configurePreviewServer(server) { server.middlewares.use(middleware as never) },
  }
}

export default defineConfig({ plugins: [react(), tailwindcss(), apiDev()] })
