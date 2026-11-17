import type { SupabaseClient } from "@supabase/supabase-js"
import { adminClient } from "./mail.js"

const TZ = "Europe/Paris"

function parts(d: Date) {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
  return Object.fromEntries(f.formatToParts(d).filter(x => x.type !== "literal").map(x => [x.type, x.value])) as Record<string, string>
}
export const monthKey = (d = new Date()) => { const p = parts(d); return `${p.year}-${p.month}` }
export const dayKey = (d = new Date()) => { const p = parts(d); return `${p.year}-${p.month}-${p.day}` }
export const minuteKey = (d = new Date()) => { const p = parts(d); return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}` }

let warned = false
function admin(): SupabaseClient | null {
  try { return adminClient() } catch {
    if (!warned) { console.warn("[akno-limits] SUPABASE_SERVICE_ROLE_KEY absente : quotas et limites de débit non appliqués."); warned = true }
    return null
  }
}

/** Consomme `amount` sur un compteur. Renvoie false si la limite est atteinte. limit <= 0 = illimité.
 *  Sans clé service_role, on laisse passer (comportement d'avant l'update44) et on le signale dans les logs. */
export async function consume(artisanId: string, metric: string, period: string, limit: number, amount = 1): Promise<boolean> {
  const sb = admin()
  if (!sb) return true
  const { data, error } = await sb.rpc("consume_usage", { p_artisan: artisanId, p_metric: metric, p_period: period, p_limit: limit, p_amount: amount })
  if (error) { console.error("[akno-limits] consume_usage", error.message); return true }
  return data !== false
}

/** Limite de débit : `max` appels par minute et par artisan pour une route. */
export function rateLimit(artisanId: string, route: string, max: number) {
  return consume(artisanId, `rl:${route}`, minuteKey(), max)
}

export async function usage(artisanId: string, metric: string, period: string): Promise<number> {
  const sb = admin()
  if (!sb) return 0
  const { data } = await sb.from("usage_counters").select("count").eq("artisan_id", artisanId).eq("metric", metric).eq("period", period).maybeSingle()
  return Number((data as { count?: number } | null)?.count || 0)
}

/** Limite de débit pour les formulaires publics (clé = empreinte de l'IP). */
export async function publicRate(key: string, max: number): Promise<boolean> {
  const sb = admin()
  if (!sb) return true
  const { data, error } = await sb.rpc("consume_public_rate", { p_key: key, p_period: minuteKey().slice(0, 13), p_limit: max })
  if (error) { console.error("[akno-limits] consume_public_rate", error.message); return true }
  return data !== false
}
