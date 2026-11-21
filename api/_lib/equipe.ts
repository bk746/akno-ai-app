/* update65 · Invitation SMS d'un membre de l'équipe (action « equipe_invite » de /api/account, pas de nouvelle fonction Vercel).
   Le SMS part par l'infra existante (Twilio, quota SMS de l'offre, journal sms_log). */
import type { SupabaseClient } from "@supabase/supabase-js"
import type { ApiResult } from "./http.js"
import { isMobileFr, toE164, type SmsResult } from "./sms.js"

export const ROLE_LABEL: Record<string, string> = { ouvrier: "Ouvrier", chef: "Chef d'équipe", admin: "Admin" }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Texte du SMS (court : 1 à 2 segments). */
export function inviteSmsText(p: { firstName: string; company: string; role: string; url: string }) {
  const who = (p.company || "Votre entreprise").trim().slice(0, 40)
  const role = ROLE_LABEL[p.role] || "Ouvrier"
  const link = p.url ? ` Ouvrez Akno : ${p.url}` : ""
  return `Bonjour ${p.firstName.trim().slice(0, 30)}, ${who} vous invite sur Akno pour suivre vos chantiers (accès ${role}).${link}`
}

type Deps = {
  send: (input: { artisanId: string; to: string; body: string; kind: "invite_equipe"; sender?: string | null }) => Promise<SmsResult>
  consume: (artisanId: string, metric: string, period: string, limit: number) => Promise<boolean>
  day: string; url: string
}

export async function handleEquipeInvite(sb: SupabaseClient, userId: string, input: Record<string, unknown>, deps: Deps): Promise<ApiResult> {
  const id = String(input.employe_id || "")
  if (!UUID.test(id)) return { status: 400, body: { error: "Membre introuvable." } }
  // RLS : la requête utilise la session de l'artisan, il ne peut lire que ses propres membres
  const { data: e, error } = await sb.from("employes").select("id, first_name, phone, access_role, invite_status, invite_count").eq("id", id).maybeSingle()
  if (error) return /access_role|invite_|column/i.test(error.message || "") ? { status: 409, body: { error: "Appliquez d'abord la migration update65 (accès à l'app)." } } : { status: 500, body: { error: "Membre indisponible." } }
  if (!e) return { status: 404, body: { error: "Membre introuvable." } }
  const m = e as { first_name: string; phone: string | null; access_role: string | null; invite_status: string | null; invite_count: number | null }
  if (!m.access_role) return { status: 400, body: { error: "Activez d'abord l'accès à l'app pour ce membre." } }
  if (m.invite_status === "accepted") return { status: 400, body: { error: "Ce membre a déjà accepté l'invitation." } }
  const to = toE164(m.phone)
  if (!to || !isMobileFr(to)) return { status: 400, body: { error: "Il faut un numéro de mobile (06 ou 07) pour envoyer l'invitation." } }
  if (!await deps.consume(userId, `invite:${id}`, deps.day, 3)) return { status: 429, body: { error: "Invitation déjà renvoyée 3 fois aujourd'hui. Réessayez demain." } }
  const { data: a } = await sb.from("artisans").select("entreprise_nom, nom_entreprise, sms_sender").eq("id", userId).maybeSingle()
  const art = (a || {}) as { entreprise_nom?: string | null; nom_entreprise?: string | null; sms_sender?: string | null }
  const company = (art.entreprise_nom || art.nom_entreprise || "").trim()
  const r = await deps.send({ artisanId: userId, to, body: inviteSmsText({ firstName: m.first_name, company, role: m.access_role, url: deps.url }), kind: "invite_equipe", sender: art.sms_sender || company })
  if (!r.ok) return { status: r.skipped ? 503 : 502, body: { error: r.error } }
  const at = new Date().toISOString()
  await sb.from("employes").update({ invite_status: "pending", invited_at: at, invite_count: (m.invite_count || 0) + 1 }).eq("id", id)
  return { status: 200, body: { ok: true, invited_at: at } }
}
