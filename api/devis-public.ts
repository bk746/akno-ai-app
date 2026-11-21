import { normStatut, withStatut } from "./_lib/devisStatut.js"
import { adminClient, stopDevisReminders } from "./_lib/mail.js"
import { notifyArtisan } from "./_lib/push.js"
import { clientIp, header, sha256Hex, type Headers } from "./_lib/http.js"
import { publicRate } from "./_lib/limits.js"
import { devisHash, logEvent } from "./_lib/signature.js"

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

/** update61 : mentions de l'entreprise nécessaires à l'affichage complet du devis (pas d'IBAN). */
const ARTISAN_PUBLIC = ["entreprise_nom", "nom_entreprise", "prenom", "entreprise_forme", "entreprise_capital", "entreprise_adresse", "entreprise_cp_ville", "entreprise_telephone", "entreprise_email", "entreprise_siret", "entreprise_tva", "entreprise_rcs_rm", "entreprise_ape", "entreprise_mediateur", "entreprise_ei", "tva_non_applicable", "tarifs", "devis_validite_jours", "devis_conditions", "assurance_nom", "assurance_numero", "assurance_zone", "assurance_adresse", "devis_couleur", "devis_pied", "logo_path"]
function publicArtisan(a: Record<string, unknown> | null) {
  const out: Record<string, unknown> = {}
  for (const k of ARTISAN_PUBLIC) if (a && a[k] !== undefined && k !== "logo_path") out[k] = k === "tarifs" ? { devisGratuit: (a.tarifs as { devisGratuit?: boolean } | null)?.devisGratuit } : a[k]
  return out
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
    // update61 : affichage complet + preuve de signature
    client_adresse: devis.client_adresse ?? null,
    created_at: devis.created_at ?? null,
    envoye_le: devis.envoye_le ?? null,
    signed: devis.signe_le ? { nom: devis.accepte_nom, at: devis.signe_le, png: devis.signature_png ?? null, hash: devis.document_hash ?? null, certif_tva: devis.certifie_tva_reduite ?? null } : null,
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

  // update61 : select("*") pour rester compatible avant/après la migration 20261121_10 (colonnes de signature)
  const { data: devis, error } = await sb.from("devis").select("*").eq("token", token).maybeSingle()
  if (error || !devis) return { status: 404, body: { error: "Ce devis est introuvable ou le lien a expiré." } }
  devis.statut = normStatut(devis.statut)
  if (devis.token_expire_le && new Date(devis.token_expire_le).getTime() < Date.now() && devis.statut !== "val" && devis.statut !== "ref") {
    return { status: 410, body: { error: "Ce lien a expiré. Contactez votre artisan pour recevoir un devis à jour." } }
  }
  const { data: artisan } = await sb.from("artisans").select("*").eq("id", devis.artisan_id).maybeSingle()
  const company = artisan?.entreprise_nom || artisan?.nom_entreprise || "Votre artisan"
  const summary = publicBody(devis, company)
  const docHash = await devisHash(devis)
  const ip = clientIp(headers), ua = header(headers, "user-agent")

  const verb = (method || "GET").toUpperCase()
  if (verb === "GET") {
    // Journal : ouverture du devis (au plus une entrée par heure et par adresse IP)
    try {
      const since = new Date(Date.now() - 3600e3).toISOString()
      const { data: recent } = await sb.from("signature_events").select("id").eq("devis_id", devis.id).eq("event", "ouverture").eq("ip", ip.slice(0, 64) || "").gte("at", since).limit(1)
      if (!recent?.length) await logEvent(sb, { artisan_id: devis.artisan_id, devis_id: devis.id, event: "ouverture", ip, ua, document_hash: docHash })
    } catch { /* journal facultatif avant migration */ }
    let logo_url = ""
    if (artisan?.logo_path) { try { const { data } = await sb.storage.from("logos").createSignedUrl(String(artisan.logo_path), 3600); logo_url = data?.signedUrl || "" } catch { /* logo facultatif */ } }
    let events: unknown[] = []
    if (devis.signe_le) { const { data } = await sb.from("signature_events").select("event, at, ip, ua, event_hash, prev_hash, document_hash").eq("devis_id", devis.id).order("id"); events = data || [] }
    return { status: 200, body: { ...summary, document_hash: docHash, artisan: publicArtisan(artisan), logo_url, events } }
  }

  if (verb !== "POST") return { status: 405, body: { error: "Méthode non autorisée." } }
  if (!await publicRate(`devis:${await sha256Hex(ip)}`, 30)) return { status: 429, body: { error: "Trop de tentatives. Réessayez plus tard." } }
  const action = body && typeof body === "object" ? String((body as { action?: string }).action || "") : ""
  if (action === "sign") return handleSign(sb, devis, body as Record<string, unknown>, { ip, ua, docHash, summary })
  if (action !== "accept" && action !== "refuse") return { status: 400, body: { error: "Action invalide." } }
  if (devis.statut === "val" || devis.statut === "ref") {
    return { status: 409, body: { error: "Une réponse a déjà été enregistrée.", ...summary } }
  }

  const now = new Date().toISOString()
  const statut = action === "accept" ? "val" : "ref"
  // Preuve de l'acceptation (update44) : nom saisi « Bon pour accord », adresse IP et navigateur
  const nom = body && typeof body === "object" ? String((body as { nom?: string }).nom || "").trim().slice(0, 120) : ""
  if (action === "accept" && nom.length < 2) return { status: 400, body: { error: "Indiquez vos nom et prénom pour valider le « Bon pour accord »." } }
  const proof = action === "accept" ? { accepte_nom: nom, accepte_ip: ip.slice(0, 64) || null, accepte_ua: ua.slice(0, 300) || null } : {}
  const { error: uErr } = await withStatut(statut, st => sb.from("devis").update({ statut: st, repondu_le: now, ...proof }).eq("id", devis.id).not("statut", "in", "(val,ref,accepte,refuse)"))
  if (uErr) return { status: 500, body: { error: "Impossible d'enregistrer votre réponse." } }
  await logEvent(sb, { artisan_id: devis.artisan_id, devis_id: devis.id, event: action === "accept" ? "consentement" : "refus", ip, ua, signataire: nom || undefined, document_hash: docHash, at: now })
  await stopDevisReminders(sb, devis.id, { markResponded: true })
  await notifyArtisan(devis.artisan_id, {
    title: action === "accept" ? "Devis accepté" : "Devis refusé",
    body: `${devis.numero} · ${devis.client_nom || "Client"}`,
    url: "/devis",
    tag: `devis-${devis.id}`,
  }, 1)
  return { status: 200, body: { ...summary, statut, decided_at: now } }
}

/** update61 · Signature électronique : nom + case « Bon pour accord » + signature tracée.
    Le contenu vu par le client (empreinte) doit être identique au devis en base, sinon refus (409). */
async function handleSign(sb: ReturnType<typeof adminClient>, devis: Record<string, any>, body: Record<string, unknown>, c: { ip: string; ua: string; docHash: string; summary: Record<string, unknown> }): Promise<ApiResult> {
  if (devis.statut === "val" || devis.statut === "ref" || devis.signe_le) return { status: 409, body: { error: "Une réponse a déjà été enregistrée.", ...c.summary } }
  const nom = String(body.nom || "").trim().replace(/\s+/g, " ").slice(0, 120)
  if (nom.length < 3 || !/\p{L}{2,}/u.test(nom)) return { status: 400, body: { error: "Indiquez vos nom et prénom." } }
  if (body.consent !== true) return { status: 400, body: { error: "Cochez « Bon pour accord » pour signer." } }
  const png = String(body.signature || "")
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(png) || png.length < 600 || png.length > 200_000) return { status: 400, body: { error: "Tracez votre signature dans le cadre." } }
  if (String(body.doc_hash || "") !== c.docHash) return { status: 409, body: { error: "Le devis a été modifié depuis son ouverture. Rechargez la page pour signer la dernière version." } }
  const reduced = Array.isArray(devis.lignes) && devis.lignes.some((x: { k?: string; tv?: number }) => x && x.k !== "sec" && (Number(x.tv) === 10 || Number(x.tv) === 5.5))
  if (reduced && body.certif_tva !== true) return { status: 400, body: { error: "Cochez la certification relative au taux réduit de TVA." } }
  const now = new Date().toISOString()
  await logEvent(sb, { artisan_id: devis.artisan_id, devis_id: devis.id, event: "consentement", ip: c.ip, ua: c.ua, signataire: nom, document_hash: c.docHash, at: now, data: { texte: "Devis reçu avant l'exécution des travaux, bon pour accord", certif_tva: reduced ? true : null } })
  const proof = { accepte_nom: nom, accepte_ip: c.ip.slice(0, 64) || null, accepte_ua: c.ua.slice(0, 300) || null }
  const sig = { signature_png: png, signe_le: now, document_hash: c.docHash, certifie_tva_reduite: reduced ? true : null }
  let { error } = await withStatut("val", st => sb.from("devis").update({ statut: st, repondu_le: now, ...proof, ...sig }).eq("id", devis.id).not("statut", "in", "(val,ref,accepte,refuse)"))
  let full = !error
  if (error) { // avant migration 20261121_10 : acceptation simple (nom, IP, navigateur)
    ({ error } = await withStatut("val", st => sb.from("devis").update({ statut: st, repondu_le: now, ...proof }).eq("id", devis.id).not("statut", "in", "(val,ref,accepte,refuse)")))
    full = false
  }
  if (error) return { status: 500, body: { error: "Impossible d'enregistrer votre signature." } }
  await logEvent(sb, { artisan_id: devis.artisan_id, devis_id: devis.id, event: "signature", ip: c.ip, ua: c.ua, signataire: nom, document_hash: c.docHash, at: now, data: { signature_sha256: await sha256Hex(png) } })
  await stopDevisReminders(sb, devis.id, { markResponded: true })
  await notifyArtisan(devis.artisan_id, { title: "Devis signé", body: `${devis.numero} · ${nom}`, url: "/devis", tag: `devis-${devis.id}` }, 1)
  const { data: events } = await sb.from("signature_events").select("event, at, ip, ua, event_hash, prev_hash, document_hash").eq("devis_id", devis.id).order("id")
  return { status: 200, body: { ...c.summary, statut: "val", decided_at: now, document_hash: c.docHash, signed: { nom, at: now, png, hash: c.docHash, certif_tva: reduced || null }, proof: full ? "signature" : "simple", events: events || [] } }
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
