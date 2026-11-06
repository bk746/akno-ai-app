import { defineConfig, type Plugin } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

type Req = { method?: string; url?: string; headers: { authorization?: string }; on?: (ev: string, cb: (x?: unknown) => void) => void }
type Res = { statusCode: number; setHeader: (k: string, v: string) => void; end: (b?: string) => void }

function readJson(req: Req): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const parts: string[] = []
    if (!req.on) { resolve({}); return }
    req.on("data", chunk => { parts.push(typeof chunk === "string" ? chunk : String(chunk)) })
    req.on("end", () => {
      try {
        const raw = parts.join("")
        resolve(raw ? JSON.parse(raw) : {})
      } catch (e) { reject(e) }
    })
    req.on("error", reject)
  })
}

function json(res: Res, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader("Content-Type", "application/json")
  res.setHeader("Cache-Control", "no-store")
  res.end(JSON.stringify(body))
}

function apiDev(): Plugin {
  const middleware = async (req: Req, res: Res, next: () => void) => {
    const path = req.url?.split("?")[0]
    if (path !== "/api/voice-token" && path !== "/api/booking") return next()
    if (req.method === "OPTIONS") { res.statusCode = 204; res.end(); return }
    if (req.method !== "POST") { json(res, 405, { error: "Méthode non autorisée." }); return }
    try {
      if (path === "/api/voice-token") {
        const { mintVoiceToken } = await import("./api/voice-token")
        const result = await mintVoiceToken(req.headers.authorization)
        json(res, result.status, result.body)
        return
      }
      const { handleBooking } = await import("./api/booking")
      const result = await handleBooking(req.headers.authorization, await readJson(req))
      json(res, result.status, result.body)
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
