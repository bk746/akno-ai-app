import { defineConfig, type Plugin } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

type Req = { method?: string; url?: string; headers: { authorization?: string } & Record<string, string | undefined>; on?: (ev: string, cb: (x?: unknown) => void) => void }
type Res = { statusCode: number; setHeader: (k: string, v: string) => void; end: (b?: string) => void }

function readRaw(req: Req): Promise<string> {
  return new Promise((resolve, reject) => {
    const parts: string[] = []
    if (!req.on) { resolve(""); return }
    req.on("data", chunk => { parts.push(typeof chunk === "string" ? chunk : String(chunk)) })
    req.on("end", () => resolve(parts.join("")))
    req.on("error", reject)
  })
}

function json(res: Res, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader("Content-Type", "application/json")
  res.setHeader("Cache-Control", "no-store")
  res.end(JSON.stringify(body))
}

const API = new Set(["/api/voice-token", "/api/booking", "/api/devis", "/api/relances", "/api/devis-public", "/api/resend-webhook", "/api/notify"])

function apiDev(): Plugin {
  const middleware = async (req: Req, res: Res, next: () => void) => {
    const path = req.url?.split("?")[0] || ""
    if (!API.has(path)) return next()
    if (req.method === "OPTIONS") { res.statusCode = 204; res.end(); return }
    try {
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
        const result = await handleRelancesCron(req.headers.authorization)
        json(res, result.status, result.body)
        return
      }
      if (path === "/api/devis-public") {
        const raw = req.method === "POST" ? await readRaw(req) : ""
        const { handleDevisPublic } = await import("./api/devis-public")
        const result = await handleDevisPublic(req.method, req.url, raw ? JSON.parse(raw) : {})
        json(res, result.status, result.body)
        return
      }
      if (path === "/api/resend-webhook") {
        if (req.method !== "POST") { json(res, 405, { error: "Méthode non autorisée." }); return }
        const raw = await readRaw(req)
        const { handleResendWebhook } = await import("./api/resend-webhook")
        const result = await handleResendWebhook(raw, req.headers)
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
