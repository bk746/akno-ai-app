import { defineConfig, type Plugin } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

function voiceTokenDev(): Plugin {
  const middleware = async (req: { method?: string; url?: string; headers: { authorization?: string } }, res: { statusCode: number; setHeader: (k: string, v: string) => void; end: (b?: string) => void }, next: () => void) => {
    const path = req.url?.split("?")[0]
    if (path !== "/api/voice-token") return next()
    if (req.method === "OPTIONS") { res.statusCode = 204; res.end(); return }
    if (req.method !== "POST") {
      res.statusCode = 405
      res.setHeader("Content-Type", "application/json")
      res.end(JSON.stringify({ error: "Méthode non autorisée." }))
      return
    }
    const { mintVoiceToken } = await import("./api/voice-token")
    const result = await mintVoiceToken(req.headers.authorization)
    res.statusCode = result.status
    res.setHeader("Content-Type", "application/json")
    res.setHeader("Cache-Control", "no-store")
    res.end(JSON.stringify(result.body))
  }
  return {
    name: "akno-voice-token",
    configureServer(server) { server.middlewares.use(middleware as never) },
    configurePreviewServer(server) { server.middlewares.use(middleware as never) },
  }
}

export default defineConfig({ plugins: [react(), tailwindcss(), voiceTokenDev()] })
