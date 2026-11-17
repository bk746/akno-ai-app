import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { env } from "./mail.js"

export type Json = Record<string, unknown>
export type ApiResult = { status: number; body: Json }
export type Headers = Record<string, string | string[] | undefined>
export type Res = { status: (n: number) => Res; json: (b: unknown) => void; setHeader: (k: string, v: string) => void; end: (b?: string) => void; send?: (b: string) => void }
export type Req = { method?: string; url?: string; headers: Headers; body?: unknown }

export function header(h: Headers | undefined, name: string) {
  if (!h) return ""
  const key = Object.keys(h).find(k => k.toLowerCase() === name.toLowerCase())
  if (!key) return ""
  const v = h[key]
  return (Array.isArray(v) ? v[0] : v) || ""
}

export function bearer(h: Headers | undefined) {
  return header(h, "authorization") || undefined
}

export function parseBody(body: unknown): Json {
  if (typeof body === "string") { try { return JSON.parse(body) as Json } catch { return {} } }
  return (body && typeof body === "object" ? body : {}) as Json
}

export function supabaseEnv() {
  const url = env("VITE_SUPABASE_URL") || env("SUPABASE_URL")
  const anon = env("VITE_SUPABASE_ANON_KEY") || env("SUPABASE_ANON_KEY")
  return { url, anon }
}

export type Session = { supabase: SupabaseClient; userId: string; email?: string }

/** Vérifie le JWT Supabase et renvoie un client qui agit AVEC les droits (RLS) de l'artisan. */
export async function authed(authorization?: string): Promise<Session | ApiResult> {
  const access = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : ""
  if (!access) return { status: 401, body: { error: "Non authentifié." } }
  const { url, anon } = supabaseEnv()
  if (!url || !anon) return { status: 503, body: { error: "Configuration Supabase manquante." } }
  const probe = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
  const { data: { user }, error } = await probe.auth.getUser(access)
  if (error || !user) return { status: 401, body: { error: "Session invalide." } }
  const supabase = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${access}` } },
  })
  return { supabase, userId: user.id, email: user.email || undefined }
}

export function isResult(x: unknown): x is ApiResult {
  return !!x && typeof x === "object" && "status" in x && "body" in x
}

export function clientIp(h: Headers | undefined) {
  const fwd = header(h, "x-forwarded-for").split(",")[0].trim()
  return fwd || header(h, "x-real-ip") || ""
}

export async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("")
}

export function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

export function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } })
}

export function headersOf(request: Request): Headers {
  const out: Headers = {}
  request.headers.forEach((v, k) => { out[k] = v })
  return out
}

/** Lit le corps brut d'une requête Node (utilisé par le serveur de dev Vite). */
export function readRawNode(req: { on?: (ev: string, cb: (x?: unknown) => void) => void }): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!req.on) { resolve(""); return }
    const parts: Uint8Array[] = []
    req.on("data", chunk => { parts.push(typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk as Uint8Array) })
    req.on("end", () => {
      const size = parts.reduce((a, p) => a + p.length, 0)
      const all = new Uint8Array(size)
      let o = 0
      for (const p of parts) { all.set(p, o); o += p.length }
      resolve(new TextDecoder().decode(all))
    })
    req.on("error", reject)
  })
}
