import { normStatut, withStatut } from "./_lib/devisStatut.js"
import { adminClient, stopDevisReminders } from "./_lib/mail.js"
import { notifyArtisan } from "./_lib/push.js"
import { clientIp, header, sha256Hex, type Headers } from "./_lib/http.js"
import { publicRate } from "./_lib/limits.js"

type Json = Record<string, unknown>
type ApiResult = { status: number; body: Json }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function tokenOf(url?: string, body?: unknown) {
  try {
    const q = new URL(url || "", "http://local.invalid").searchParams.get("token")
    if (q) return q.trim()
  } catch { /* ignore */ }
  if (body && typeof body === "object" && body && "token" in body) return String((body as { token?: string }).token || "").trim()
  return ""
}

function publicBody(devis: Record<string, unknown>, company: string) {
  return {
    ok: true,
    numero: devis.numero,
    objet: devis.objet,
    client_nom: devis.client_nom,
    lignes: devis.lignes,
    total_ht: devis.total_ht,
    total_ttc: devis.total_ttc,
    tva_taux: devis.tva_taux,
    statut: normStatut(devis.statut),
    decided_at: devis.repondu_le,
    company,
  }
}

function param(url: string | undefined, name: string) {
  try { return new URL(url || "", "http://local.invalid").searchParams.get(name) || "" } catch { return "" }
}

const DOC_LABEL: Record<string, string> = { urssaf: "Attestation de vigilance Urssaf", kbis: "Extrait Kbis", decennale: "Attestation d'assurance décennale", rc_pro: "Attestation RC Pro", rge: "Certificat RGE", qualibat: "Qualification Qualibat", fiscale: "Attestation de régularité fiscale", autre: "Document" }

/** update46 : dossier de conformité partagé par lien (lecture seule, liens signés 1 h). */
async function handleDossier(token: string): Promise<ApiResult> {
  if (!UUID.test(token)) return { status: 400, body: { error: "Lien invalide." } }
  let sb
  try { sb = adminClient() } catch { return { status: 503, body: { error: "Configuration serveur manquante." } } }
  const { data: artisan } = await sb.from("artisans").select("id, entreprise_nom, nom_entreprise, entreprise_siret, entreprise_adresse, entreprise_cp_ville").eq("dossier_token", token).maybeSingle()
  if (!artisan) return { status: 404, body: { error: "Ce dossier n'est plus partagé." } }
  const { data: docs } = await sb.from("documents_conformite").select("id, type, libelle, file_path, date_emission, date_expiration").eq("artisan_id", artisan.id).order("type")
  const today = new Date().toISOString().slice(0, 10)
  const out = []
  for (const d of docs || []) {
    let url = ""
    if (d.file_path) {
      const { data } = await sb.storage.from("conformite").createSignedUrl(String(d.file_path), 3600)
      url = data?.signedUrl || ""
    }
    out.push({ type: d.type, libelle: d.libelle || DOC_LABEL[d.type] || "Document", date_emission: d.date_emission, date_expiration: d.date_expiration, valide: !d.date_expiration || d.date_expiration >= today, url })
  }
  return { status: 200, body: { ok: true, company: artisan.entreprise_nom || artisan.nom_entreprise || "", siret: artisan.entreprise_siret || "", adresse: [artisan.entreprise_adresse, artisan.entreprise_cp_ville].filter(Boolean).join(", "), documents: out } }
}

export async function handleDevisPublic(method?: string, url?: string, body?: unknown, headers?: Headers): Promise<ApiResult> {
  const dossier = param(url, "dossier")
  if (dossier) {
    if (!await publicRate(`dossier:${await sha256Hex(clientIp(headers))}`, 60)) return { status: 429, body: { error: "Trop de requêtes." } }
    return handleDossier(dossier.trim())
  }
  const token = tokenOf(url, body)
  if (!UUID.test(token)) return { status: 400, body: { error: "Lien invalide." } }
  let sb
  try { sb = adminClient() }
  catch { return { status: 503, body: { error: "Configuration serveur manquante." } } }

  const { data: devis, error } = await sb.from("devis").select("id, numero, client_nom, objet, lignes, total_ht, total_ttc, tva_taux, statut, artisan_id, repondu_le, token_expire_le").eq("token", token).maybeSingle()
  if (error || !devis) return { status: 404, body: { error: "Ce devis est introuvable ou le lien a expiré." } }
  devis.statut = normStatut(devis.statut)
  if (devis.token_expire_le && new Date(devis.token_expire_le).getTime() < Date.now() && devis.statut !== "val" && devis.statut !== "ref") {
    return { status: 410, body: { error: "Ce lien a expiré. Contactez votre artisan pour recevoir un devis à jour." } }
  }
  const { data: artisan } = await sb.from("artisans").select("entreprise_nom, nom_entreprise").eq("id", devis.artisan_id).maybeSingle()
  const company = artisan?.entreprise_nom || artisan?.nom_entreprise || "Votre artisan"
  const summary = publicBody(devis, company)

  const verb = (method || "GET").toUpperCase()
  if (verb === "GET") return { status: 200, body: summary }

  if (verb !== "POST") return { status: 405, body: { error: "Méthode non autorisée." } }
  const ip = clientIp(headers)
  if (!await publicRate(`devis:${await sha256Hex(ip)}`, 30)) return { status: 429, body: { error: "Trop de tentatives. Réessayez plus tard." } }
  const action = body && typeof body === "object" ? String((body as { action?: string }).action || "") : ""
  if (action !== "accept" && action !== "refuse") return { status: 400, body: { error: "Action invalide." } }
  if (devis.statut === "val" || devis.statut === "ref") {
    return { status: 409, body: { error: "Une réponse a déjà été enregistrée.", ...summary } }
  }

  const now = new Date().toISOString()
  const statut = action === "accept" ? "val" : "ref"
  // Preuve de l'acceptation (update44) : nom saisi « Bon pour accord », adresse IP et navigateur
  const nom = body && typeof body === "object" ? String((body as { nom?: string }).nom || "").trim().slice(0, 120) : ""
  if (action === "accept" && nom.length < 2) return { status: 400, body: { error: "Indiquez vos nom et prénom pour valider le « Bon pour accord »." } }
  const proof = action === "accept" ? { accepte_nom: nom, accepte_ip: ip.slice(0, 64) || null, accepte_ua: header(headers, "user-agent").slice(0, 300) || null } : {}
  const { error: uErr } = await withStatut(statut, st => sb.from("devis").update({ statut: st, repondu_le: now, ...proof }).eq("id", devis.id).not("statut", "in", "(val,ref,accepte,refuse)"))
  if (uErr) return { status: 500, body: { error: "Impossible d'enregistrer votre réponse." } }
  await stopDevisReminders(sb, devis.id, { markResponded: true })
  await notifyArtisan(devis.artisan_id, {
    title: action === "accept" ? "Devis accepté" : "Devis refusé",
    body: `${devis.numero} · ${devis.client_nom || "Client"}`,
    url: "/devis",
    tag: `devis-${devis.id}`,
  }, 1)
  return { status: 200, body: { ...summary, statut, decided_at: now } }
}

type Res = { status: (n: number) => Res; json: (b: unknown) => void; setHeader: (k: string, v: string) => void; end: () => void }

export default async function handler(req: { method?: string; url?: string; headers: Record<string, string | string[] | undefined>; body?: unknown }, res: Res) {
  res.setHeader("Cache-Control", "no-store")
  res.setHeader("Access-Control-Allow-Origin", "*")
  if (req.method === "OPTIONS") { res.status(204).end(); return }
  let body = req.body
  if (typeof body === "string") { try { body = JSON.parse(body) } catch { body = {} } }
  const { status, body: payload } = await handleDevisPublic(req.method, req.url, body, req.headers)
  res.status(status).json(payload)
}
