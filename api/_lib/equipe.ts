/* update65 · Invitation SMS d'un membre de l'équipe (action « equipe_invite » de /api/account, pas de nouvelle fonction Vercel).
   Le SMS part par l'infra existante (Twilio, quota SMS de l'offre, journal sms_log). */
import type { SupabaseClient } from "@supabase/supabase-js"
import type { ApiResult } from "./http.js"
import { isMobileFr, toE164, type SmsResult } from "./sms.js"
import { randomBytes } from "node:crypto"
import { sendResend } from "./mail.js"

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
  day: string; url: string; appUrl?: string
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

/* update78 · Invitation par e-mail (Resend) + acceptation du compte employé. */

export function inviteEmailHtml(p: { firstName: string; company: string; url: string }) {
  const who = (p.company || "Votre entreprise").trim()
  return `<p>Bonjour ${p.firstName},</p><p><strong>${who}</strong> vous invite à rejoindre l'équipe sur Akno, pour voir votre planning, pointer vos interventions et suivre vos chantiers.</p><p><a href="${p.url}" style="display:inline-block;background:#2F6BFF;color:#fff;border-radius:999px;padding:12px 22px;text-decoration:none;font-weight:600">Activer mon accès</a></p><p style="color:#666;font-size:13px">Ce lien expire dans 14 jours. Si vous n'attendiez pas ce message, ignorez-le.</p>`
}

export function newInviteToken() {
  return randomBytes(24).toString("hex")
}

/** Invitation e-mail (préférée). Le SMS reste envoyé en plus si un mobile est renseigné et que SMS est configuré. */
export async function handleEquipeInvite78(sb: SupabaseClient, userId: string, input: Record<string, unknown>, deps: Deps & { appUrl: string }): Promise<ApiResult> {
  const id = String(input.employe_id || "")
  if (!UUID.test(id)) return { status: 400, body: { error: "Membre introuvable." } }
  const { data: e, error } = await sb.from("employes").select("id, first_name, last_name, phone, email, access_role, invite_status, invite_count").eq("id", id).maybeSingle()
  if (error) return /access_role|invite_|user_id|column/i.test(error.message || "") ? { status: 409, body: { error: "Appliquez d'abord la migration update78 (comptes employés)." } } : { status: 500, body: { error: "Membre indisponible." } }
  if (!e) return { status: 404, body: { error: "Membre introuvable." } }
  const m = e as { first_name: string; email: string | null; phone: string | null; access_role: string | null; invite_status: string | null; invite_count: number | null }
  if (!m.access_role) return { status: 400, body: { error: "Activez d'abord l'accès à l'app pour ce membre." } }
  if (m.invite_status === "accepted") return { status: 400, body: { error: "Ce membre a déjà accepté l'invitation." } }
  const email = (m.email || "").trim().toLowerCase()
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { status: 400, body: { error: "Il faut un e-mail valide pour envoyer l'invitation." } }
  if (!await deps.consume(userId, `invite:${id}`, deps.day, 3)) return { status: 429, body: { error: "Invitation déjà renvoyée 3 fois aujourd'hui. Réessayez demain." } }
  const { data: a } = await sb.from("artisans").select("entreprise_nom, nom_entreprise, sms_sender").eq("id", userId).maybeSingle()
  const art = (a || {}) as { entreprise_nom?: string | null; nom_entreprise?: string | null; sms_sender?: string | null }
  const company = (art.entreprise_nom || art.nom_entreprise || "").trim()
  const token = newInviteToken()
  const expires = new Date(Date.now() + 14 * 864e5).toISOString()
  const url = `${(deps.appUrl || deps.url || "").replace(/\/$/, "")}/rejoindre/${token}`
  const mailed = await sendResend({ to: email, subject: `${company || "Akno"} : invitation à rejoindre l'équipe`, html: inviteEmailHtml({ firstName: m.first_name, company, url }), company })
  if (!mailed.ok) return { status: mailed.error?.includes("RESEND") || mailed.error?.includes("configur") ? 503 : 502, body: { error: mailed.error || "E-mail d'invitation indisponible pour le moment." } }
  // SMS en plus, facultatif — un échec SMS n'annule pas l'e-mail
  const to = toE164(m.phone)
  if (to && isMobileFr(to)) {
    await deps.send({ artisanId: userId, to, body: inviteSmsText({ firstName: m.first_name, company, role: m.access_role, url }), kind: "invite_equipe", sender: art.sms_sender || company }).catch(() => ({ ok: false }))
  }
  const at = new Date().toISOString()
  const { error: up } = await sb.from("employes").update({ invite_status: "pending", invited_at: at, invite_count: (m.invite_count || 0) + 1, invite_token: token, invite_expires_at: expires }).eq("id", id)
  if (up && /invite_token|column/i.test(up.message || "")) return { status: 409, body: { error: "Appliquez d'abord la migration update78 (comptes employés)." } }
  return { status: 200, body: { ok: true, invited_at: at, channel: "email" } }
}

export async function previewEquipeInvite(admin: SupabaseClient, token: string) {
  if (!token || token.length < 16) return { status: 400, body: { error: "Lien invalide." } }
  const { data, error } = await admin.from("employes").select("id, first_name, email, invite_status, invite_expires_at, artisan_id, access_role").eq("invite_token", token).maybeSingle()
  if (error && /invite_token|column/i.test(error.message || "")) return { status: 409, body: { error: "Invitation indisponible : migration update78 non appliquée." } }
  if (!data) return { status: 404, body: { error: "Lien d'invitation introuvable ou déjà utilisé." } }
  if (data.invite_status === "accepted") return { status: 409, body: { error: "Cette invitation a déjà été acceptée. Connectez-vous." } }
  if (data.invite_expires_at && new Date(data.invite_expires_at).getTime() < Date.now()) return { status: 410, body: { error: "Ce lien a expiré. Demandez une nouvelle invitation." } }
  const { data: a } = await admin.from("artisans").select("entreprise_nom, nom_entreprise").eq("id", data.artisan_id).maybeSingle()
  const company = ((a as { entreprise_nom?: string; nom_entreprise?: string } | null)?.entreprise_nom || (a as { nom_entreprise?: string } | null)?.nom_entreprise || "l'équipe").trim()
  return { status: 200, body: { ok: true, first_name: data.first_name, email: data.email, company, role: data.access_role } }
}

export async function acceptEquipeInvite(admin: any, input: Record<string, unknown>): Promise<ApiResult> {
  const token = String(input.token || "")
  const password = String(input.password || "")
  const preview = await previewEquipeInvite(admin, token)
  if (preview.status !== 200) return preview
  if (password.length < 8) return { status: 400, body: { error: "Choisissez un mot de passe d'au moins 8 caractères." } }
  const { data: row } = await admin.from("employes").select("id, email, artisan_id, first_name, last_name").eq("invite_token", token).maybeSingle()
  if (!row) return { status: 404, body: { error: "Lien d'invitation introuvable." } }
  const email = String(row.email || "").trim()
  if (!email) return { status: 400, body: { error: "E-mail manquant sur la fiche." } }
  // Ne jamais créer une fiche artisan : le compte reste un employé.
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { role: "employe", employe_id: row.id, first_name: row.first_name } })
  if (error || !created.user) {
    // déjà un compte ? on tente de lier si l'e-mail correspond
    const msg = String(error?.message || "")
    if (/already|registered|exists/i.test(msg)) return { status: 409, body: { error: "Un compte existe déjà avec cet e-mail. Connectez-vous, puis rouvrez le lien si besoin." } }
    return { status: 500, body: { error: "Impossible de créer le compte pour le moment." } }
  }
  const { error: up } = await admin.from("employes").update({ user_id: created.user.id, invite_status: "accepted", invite_token: null, invite_expires_at: null }).eq("id", row.id)
  if (up) {
    try { await admin.auth.admin.deleteUser(created.user.id) } catch { /* rollback best-effort */ }
    return { status: 500, body: { error: "Compte créé mais liaison impossible. Réessayez." } }
  }
  return { status: 200, body: { ok: true, email } }
}
