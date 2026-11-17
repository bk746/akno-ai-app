import { adminClient, env, looksLikeEmail } from "./_lib/mail.js"
import { clientIp, header, jsonResponse, sha256Hex, type ApiResult, type Headers, type Json } from "./_lib/http.js"
import { publicRate } from "./_lib/limits.js"
import { notifyArtisan } from "./_lib/push.js"
import { loadEntitlements, can } from "./_lib/plans.js"
import { sendSmsMetered } from "./_lib/sms.js"
import { reportError } from "./_lib/monitoring.js"

/* update47 · Formulaire de contact du site de l'artisan → demande dans Akno.
   POST https://VOTRE-DOMAINE/api/lead  (JSON ou formulaire HTML classique)
   Champs : key (clé du formulaire, Réglages → Demandes du site), nom, telephone, email, message,
   adresse, code_postal, ville, source, utm_*, page_url, redirect (formulaire HTML), website (anti-robot, doit rester vide),
   cf-turnstile-response (si TURNSTILE_SECRET_KEY est définie). */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" }
const str = (v: unknown, max = 300) => String(v ?? "").trim().slice(0, max)

async function verifyTurnstile(token: string, ip: string) {
  const secret = (env("TURNSTILE_SECRET_KEY") || "").trim()
  if (!secret) return true
  if (!token) return false
  const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret, response: token, ...(ip ? { remoteip: ip } : {}) }).toString(),
  }).catch(() => null)
  const data = r ? await r.json().catch(() => ({})) as { success?: boolean } : {}
  return !!data.success
}

export async function handleLead(input: Json, headers: Headers): Promise<ApiResult> {
  // Anti-robot : champ caché rempli => on répond OK sans rien enregistrer
  if (str(input.website || input._gotcha)) return { status: 200, body: { ok: true } }
  const key = str(input.key || input.lead_key, 64)
  if (!UUID.test(key)) return { status: 400, body: { error: "Clé de formulaire invalide." } }
  const ip = clientIp(headers)
  const ipHash = await sha256Hex(ip || "none")
  if (!await publicRate(`lead-ip:${ipHash}`, 8)) return { status: 429, body: { error: "Trop de demandes envoyées. Réessayez plus tard." } }
  if (!await publicRate(`lead-key:${key}`, 120)) return { status: 429, body: { error: "Trop de demandes envoyées. Réessayez plus tard." } }
  if (!await verifyTurnstile(str(input["cf-turnstile-response"], 4000), ip)) return { status: 400, body: { error: "Vérification anti-robot échouée." } }

  const nom = str(input.nom || input.name, 120)
  const telephone = str(input.telephone || input.phone || input.tel, 40)
  const email = str(input.email, 160)
  const message = str(input.message, 3000)
  if (!telephone && !looksLikeEmail(email)) return { status: 400, body: { error: "Indiquez un téléphone ou un e-mail valide." } }
  if (!nom && !message) return { status: 400, body: { error: "Indiquez votre nom et votre demande." } }

  let sb
  try { sb = adminClient() } catch { return { status: 503, body: { error: "Service momentanément indisponible." } } }
  const { data: artisan } = await sb.from("artisans").select("id, telephone, sms_enabled, sms_sender, entreprise_nom, nom_entreprise").eq("lead_key", key).maybeSingle()
  if (!artisan) return { status: 404, body: { error: "Formulaire inconnu." } }
  const ent = await loadEntitlements(sb, artisan.id)
  if (!can(ent, "leads")) return { status: 402, body: { error: "Ce formulaire n'est plus actif." } }

  const utm: Record<string, string> = {}
  for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid"]) {
    const v = str(input[k], 200)
    if (v) utm[k] = v
  }
  const source = str(input.source, 40) || (utm.gclid ? "google" : utm.fbclid ? "facebook" : utm.utm_source || "site")
  const { data: lead, error } = await sb.from("leads").insert({
    artisan_id: artisan.id,
    nom: nom || null,
    telephone: telephone || null,
    email: looksLikeEmail(email) ? email : null,
    adresse: str(input.adresse, 200) || null,
    code_postal: str(input.code_postal || input.cp, 10) || null,
    ville: str(input.ville, 80) || null,
    message: message || null,
    source,
    utm: Object.keys(utm).length ? utm : null,
    page_url: str(input.page_url || header(headers, "referer"), 500) || null,
  }).select("id").maybeSingle()
  if (error || !lead) return { status: 500, body: { error: "Votre demande n'a pas pu être enregistrée." } }

  await notifyArtisan(artisan.id, { title: "Nouvelle demande du site", body: `${nom || telephone || email}${message ? ` · ${message.slice(0, 80)}` : ""}`, url: "/demandes", tag: `lead-${lead.id}` }, 1)
  if (artisan.sms_enabled && artisan.telephone) {
    await sendSmsMetered({ artisanId: artisan.id, to: artisan.telephone, body: `Akno : nouvelle demande du site — ${nom || "client"} ${telephone || email}. ${message.slice(0, 120)}`, kind: "lead", sender: "Akno" }, ent.quotas.sms).catch(() => null)
  }
  return { status: 200, body: { ok: true } }
}

async function parse(request: Request): Promise<Json> {
  const type = request.headers.get("content-type") || ""
  const raw = await request.text()
  if (type.includes("application/json")) { try { return JSON.parse(raw) as Json } catch { return {} } }
  return Object.fromEntries(new URLSearchParams(raw))
}

export async function POST(request: Request) {
  const headers: Headers = {}
  request.headers.forEach((v, k) => { headers[k] = v })
  let input: Json = {}
  try { input = await parse(request) } catch { /* corps illisible */ }
  let result: ApiResult
  try { result = await handleLead(input, headers) } catch (e) {
    await reportError(e, { route: "lead" })
    result = { status: 500, body: { error: "Erreur serveur." } }
  }
  // Formulaire HTML classique : redirection vers la page de remerciement du site
  const redirect = str(input.redirect, 500)
  if (/^https:\/\//i.test(redirect) && !(request.headers.get("content-type") || "").includes("json")) {
    const to = new URL(redirect)
    if (result.status !== 200) to.searchParams.set("erreur", "1")
    return new Response(null, { status: 303, headers: { ...CORS, Location: to.toString() } })
  }
  const res = jsonResponse(result.status, result.body)
  for (const [k, v] of Object.entries(CORS)) res.headers.set(k, v)
  return res
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}
