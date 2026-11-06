import { adminClient, stopDevisReminders } from "./_lib/mail.js"
import { notifyArtisan } from "./_lib/push.js"

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
    statut: devis.statut,
    decided_at: devis.repondu_le,
    company,
  }
}

export async function handleDevisPublic(method?: string, url?: string, body?: unknown): Promise<ApiResult> {
  const token = tokenOf(url, body)
  if (!UUID.test(token)) return { status: 400, body: { error: "Lien invalide." } }
  let sb
  try { sb = adminClient() }
  catch { return { status: 503, body: { error: "Configuration serveur manquante." } } }

  const { data: devis, error } = await sb.from("devis").select("id, numero, client_nom, objet, lignes, total_ht, total_ttc, tva_taux, statut, artisan_id, repondu_le").eq("token", token).maybeSingle()
  if (error || !devis) return { status: 404, body: { error: "Ce devis est introuvable ou le lien a expiré." } }
  const { data: artisan } = await sb.from("artisans").select("entreprise_nom, nom_entreprise").eq("id", devis.artisan_id).maybeSingle()
  const company = artisan?.entreprise_nom || artisan?.nom_entreprise || "Votre artisan"
  const summary = publicBody(devis, company)

  const verb = (method || "GET").toUpperCase()
  if (verb === "GET") return { status: 200, body: summary }

  if (verb !== "POST") return { status: 405, body: { error: "Méthode non autorisée." } }
  const action = body && typeof body === "object" ? String((body as { action?: string }).action || "") : ""
  if (action !== "accept" && action !== "refuse") return { status: 400, body: { error: "Action invalide." } }
  if (devis.statut === "val" || devis.statut === "ref") {
    return { status: 409, body: { error: "Une réponse a déjà été enregistrée.", ...summary } }
  }

  const now = new Date().toISOString()
  const statut = action === "accept" ? "val" : "ref"
  const { error: uErr } = await sb.from("devis").update({ statut, repondu_le: now }).eq("id", devis.id)
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
  const { status, body: payload } = await handleDevisPublic(req.method, req.url, body)
  res.status(status).json(payload)
}
