import { createClient, type SupabaseClient } from "@supabase/supabase-js"

type Json = Record<string, unknown>
type Line = { l: string; q: number; u: string; pu: number; tv: number }
type ApiResult = { status: number; body: Json }

const env = (name: string) => (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[name]
const CHAT_MODEL = () => env("XAI_CHAT_MODEL") || "grok-4-latest"
const RESEND_FROM = () => (env("RESEND_FROM") || "Akno <onboarding@resend.dev>").trim()

function round2(n: number) {
  return Math.round(n * 100) / 100
}

async function authed(authorization?: string): Promise<{ supabase: SupabaseClient; userId: string } | { status: number; body: Json }> {
  const access = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : ""
  if (!access) return { status: 401, body: { error: "Non authentifié." } }
  const supabaseUrl = env("VITE_SUPABASE_URL") || env("SUPABASE_URL")
  const supabaseKey = env("VITE_SUPABASE_ANON_KEY") || env("SUPABASE_ANON_KEY")
  if (!supabaseUrl || !supabaseKey) return { status: 503, body: { error: "Configuration Supabase manquante." } }
  const probe = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const { data: { user }, error } = await probe.auth.getUser(access)
  if (error || !user) return { status: 401, body: { error: "Session invalide." } }
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${access}` } },
  })
  return { supabase, userId: user.id }
}

function totals(lines: Line[]) {
  const ht = lines.reduce((a, x) => a + x.q * x.pu, 0)
  const tva = lines.reduce((a, x) => a + x.q * x.pu * x.tv / 100, 0)
  const rates = [...new Set(lines.map(x => x.tv))]
  return { ht: round2(ht), tva: round2(tva), ttc: round2(ht + tva), tva_taux: rates.length === 1 ? rates[0] : rates.includes(10) ? 10 : rates[0] || 20 }
}

function asLines(raw: unknown): Line[] {
  if (!Array.isArray(raw)) return []
  const out: Line[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const o = item as Record<string, unknown>
    const l = String(o.l ?? o.designation ?? o.libelle ?? "").trim()
    const q = Number(o.q ?? o.qty ?? o.quantite)
    const pu = Number(o.pu ?? o.prix ?? o.prix_ht)
    const u = String(o.u ?? o.unite ?? "u").trim() || "u"
    const tv = Number(o.tv ?? o.tva ?? o.tva_taux)
    if (!l || !Number.isFinite(q) || q <= 0 || !Number.isFinite(pu) || pu < 0) continue
    const rate = tv === 5.5 || tv === 10 || tv === 20 ? tv : 20
    out.push({ l: l.slice(0, 280), q: round2(q), u: u.slice(0, 12), pu: round2(pu), tv: rate })
  }
  return out.slice(0, 16)
}

function parseModelJson(text: string): { objet?: string; lines: Line[] } {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "")
  const parsed = JSON.parse(cleaned) as { objet?: string; object?: string; lines?: unknown; lignes?: unknown }
  return { objet: String(parsed.objet || parsed.object || "").trim(), lines: asLines(parsed.lines || parsed.lignes) }
}

async function nextNumero(supabase: SupabaseClient) {
  const { data } = await supabase.from("devis").select("numero").order("created_at", { ascending: false }).limit(40)
  let max = 9087
  for (const r of data || []) {
    const n = parseInt(String((r as { numero?: string }).numero || "").replace(/\D/g, ""), 10)
    if (Number.isFinite(n) && n > max) max = n
  }
  return String(max + 1)
}

const DRAFT_SYSTEM = `Tu es un métreur-devisieur BTP en France. À partir du compte rendu d'un appel, tu prépares un BROUILLON de devis (jamais un devis définitif).

Règles :
- Prix unitaires hors taxes, réalistes du marché français actuel pour un artisan TPE/PME.
- Sépare les postes pertinents : déplacement, fournitures, main-d'œuvre, protection / évacuation / petit matériel si utile.
- Quantités d'après les informations collectées. Si une dimension manque, fais une hypothèse raisonnable et indique-la dans la désignation entre parenthèses (ex. « surface estimée 8 m² »).
- Unités : u, h, m², ml, ens, forfait, kg, l selon le poste.
- TVA par ligne :
  · 10 : rénovation / amélioration d'un logement achevé depuis plus de 2 ans (fournitures posées + main-d'œuvre).
  · 5.5 : rénovation énergétique (isolation, pompe à chaleur, chauffe-eau thermodynamique, etc.).
  · 20 : construction neuve, dépannage hors rénovation, fournitures seules, client professionnel, ou doute fort.
  En cas de doute pour un particulier dans l'existant, applique 10, sinon 20.
- N'invente pas de prestations hors sujet. 3 à 8 lignes maximum.
- Réponds uniquement en JSON valide, sans markdown :
{"objet":"libellé court des travaux","lines":[{"l":"désignation","q":1,"u":"u","pu":120,"tv":10}]}`

async function draftFromXai(input: {
  company?: string
  tradeHint?: string
  client?: string
  resume?: string
  motif?: string
  besoin?: string
  notes?: string
  transcript?: string
  adresse?: string
}) {
  const apiKey = env("XAI_API_KEY")
  if (!apiKey) return { error: "La clé XAI_API_KEY n'est pas encore configurée sur Vercel.", status: 503 as const }
  const parts = [
    input.company ? `Entreprise : ${input.company}` : "",
    input.tradeHint ? `Activité : ${input.tradeHint}` : "",
    input.client ? `Client : ${input.client}` : "",
    input.adresse ? `Adresse du chantier : ${input.adresse}` : "",
    input.motif ? `Motif : ${input.motif}` : "",
    input.besoin ? `Détail du besoin : ${input.besoin}` : "",
    input.resume ? `Résumé de l'appel : ${input.resume}` : "",
    input.notes ? `Notes : ${input.notes}` : "",
    input.transcript ? `Transcription :\n${input.transcript.slice(0, 8000)}` : "",
  ].filter(Boolean)
  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: CHAT_MODEL(),
      temperature: 0.3,
      messages: [
        { role: "system", content: DRAFT_SYSTEM },
        { role: "user", content: parts.join("\n") || "Prépare un brouillon de devis à partir des informations disponibles." },
      ],
      response_format: { type: "json_object" },
    }),
  })
  if (!res.ok) {
    return { error: "Impossible de générer le brouillon de devis pour le moment.", status: 502 as const }
  }
  const data = await res.json() as { choices?: { message?: { content?: string } }[] }
  const content = data.choices?.[0]?.message?.content || ""
  try {
    const parsed = parseModelJson(content)
    if (!parsed.lines.length) return { error: "Le brouillon généré ne contient aucune ligne exploitable.", status: 502 as const }
    return { objet: parsed.objet, lines: parsed.lines }
  } catch {
    return { error: "Réponse du modèle illisible.", status: 502 as const }
  }
}

async function handleDraft(supabase: SupabaseClient, userId: string, body: Json): Promise<ApiResult> {
  const callId = Number(body.call_id)
  if (!Number.isFinite(callId) || callId <= 0) return { status: 400, body: { error: "call_id manquant." } }

  const { data: existing } = await supabase.from("devis").select("id, numero, objet, lignes, total_ht, total_ttc, statut").eq("call_id", callId).order("created_at", { ascending: false }).limit(1).maybeSingle()
  if (existing) {
    return { status: 200, body: { ok: true, reused: true, devis_id: existing.id, numero: existing.numero, objet: existing.objet, lines: existing.lignes, total_ht: existing.total_ht, total_ttc: existing.total_ttc, statut: existing.statut } }
  }

  const { data: call, error: cErr } = await supabase.from("calls").select("id, nom_client, telephone_client, email_client, adresse, ville, code_postal, motif, besoin_detail, resume, notes, transcript").eq("id", callId).maybeSingle()
  if (cErr || !call) return { status: 404, body: { error: "Appel introuvable." } }

  const { data: artisan } = await supabase.from("artisans").select("entreprise_nom, nom_entreprise, prenom").eq("id", userId).maybeSingle()
  const drafted = await draftFromXai({
    company: artisan?.entreprise_nom || artisan?.nom_entreprise || "",
    client: call.nom_client || "",
    resume: call.resume || "",
    motif: call.motif || "",
    besoin: call.besoin_detail || "",
    notes: call.notes || "",
    transcript: typeof call.transcript === "string" ? call.transcript : "",
    adresse: [call.adresse, call.code_postal, call.ville].filter(Boolean).join(", "),
  })
  if ("error" in drafted) return { status: drafted.status || 502, body: { error: drafted.error } }

  const tot = totals(drafted.lines)
  const objet = drafted.objet || call.motif || call.besoin_detail || "Demande de devis"
  const numero = await nextNumero(supabase)
  const row = {
    artisan_id: userId,
    numero,
    client_nom: call.nom_client || "Client",
    client_email: call.email_client || "",
    client_telephone: call.telephone_client || null,
    client_adresse: [call.adresse, call.code_postal, call.ville].filter(Boolean).join(", ") || null,
    objet,
    lignes: drafted.lines,
    total_ht: tot.ht,
    tva_taux: tot.tva_taux,
    total_ttc: tot.ttc,
    statut: "brouillon",
    call_id: callId,
  }
  const { data: inserted, error: iErr } = await supabase.from("devis").insert(row).select("id, numero").maybeSingle()
  if (iErr || !inserted) return { status: 500, body: { error: "Impossible d'enregistrer le brouillon de devis." } }
  return {
    status: 200,
    body: { ok: true, devis_id: inserted.id, numero: inserted.numero, objet, lines: drafted.lines, total_ht: tot.ht, total_ttc: tot.ttc, statut: "brouillon" },
  }
}

function looksLikeEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
}

async function handleSend(supabase: SupabaseClient, userId: string, body: Json): Promise<ApiResult> {
  const devisId = String(body.devis_id || "").trim()
  if (!devisId) return { status: 400, body: { error: "devis_id manquant." } }
  const { data: devis, error } = await supabase.from("devis").select("id, numero, client_nom, client_email, objet, statut").eq("id", devisId).maybeSingle()
  if (error || !devis) return { status: 404, body: { error: "Devis introuvable." } }
  if (devis.statut === "env" || devis.statut === "envoyé") {
    return { status: 409, body: { error: "Ce devis a déjà été envoyé." } }
  }

  const email = String(body.email || devis.client_email || "").trim()
  if (!looksLikeEmail(email)) {
    return { status: 400, body: { error: "Indiquez un e-mail client valide avant d'envoyer." } }
  }

  const key = env("RESEND_API_KEY")
  if (!key) {
    return {
      status: 503,
      body: {
        ok: false,
        download: true,
        error: "L'envoi d'e-mail n'est pas configuré (RESEND_API_KEY manquante). Téléchargez le PDF et envoyez-le vous-même.",
      },
    }
  }

  const pdf = String(body.pdf_base64 || "").replace(/^data:application\/pdf;base64,/i, "").trim()
  if (!pdf || pdf.length < 80) return { status: 400, body: { error: "PDF manquant." } }
  const filename = String(body.filename || `Devis-${devis.numero}.pdf`).replace(/[^\w.\-À-ÿ ]+/g, "") || `Devis-${devis.numero}.pdf`

  const { data: artisan } = await supabase.from("artisans").select("entreprise_nom, nom_entreprise, prenom, entreprise_email, email").eq("id", userId).maybeSingle()
  const company = artisan?.entreprise_nom || artisan?.nom_entreprise || "votre artisan"
  const reply = artisan?.entreprise_email || artisan?.email || undefined
  const subject = `Devis n° ${devis.numero} — ${company}`
  const html = `<p>Bonjour${devis.client_nom ? ` ${escapeHtml(devis.client_nom)}` : ""},</p>
<p>Veuillez trouver ci-joint le devis n° ${escapeHtml(String(devis.numero))}${devis.objet ? ` concernant « ${escapeHtml(devis.objet)} »` : ""}.</p>
<p>Vous pouvez nous répondre à cet e-mail pour toute question ou pour donner votre accord.</p>
<p>Cordialement,<br/>${escapeHtml(company)}</p>`

  const payload: Json = {
    from: RESEND_FROM(),
    to: [email],
    subject,
    html,
    attachments: [{ filename, content: pdf }],
  }
  if (reply && looksLikeEmail(reply)) payload.reply_to = reply

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    return { status: 502, body: { error: "L'e-mail n'a pas pu être envoyé. Téléchargez le PDF et envoyez-le vous-même.", download: true } }
  }

  const sentAt = new Date().toISOString()
  const { error: uErr } = await supabase.from("devis").update({
    statut: "env",
    envoye_le: sentAt,
    client_email: email,
  }).eq("id", devisId)
  if (uErr) return { status: 500, body: { error: "E-mail envoyé, mais le statut n'a pas pu être mis à jour." } }
  return { status: 200, body: { ok: true, sent_at: sentAt, email } }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch] || ch))
}

export async function handleDevis(authorization?: string, body?: unknown): Promise<ApiResult> {
  const session = await authed(authorization)
  if ("status" in session) return session
  const input = (body && typeof body === "object" ? body : {}) as Json
  try {
    if (input.action === "draft") return await handleDraft(session.supabase, session.userId, input)
    if (input.action === "send") return await handleSend(session.supabase, session.userId, input)
    return { status: 400, body: { error: "Action inconnue." } }
  } catch {
    return { status: 500, body: { error: "Erreur serveur." } }
  }
}

type Res = { status: (n: number) => Res; json: (b: unknown) => void; setHeader: (k: string, v: string) => void; end: () => void }

export default async function handler(req: { method?: string; headers: Record<string, string | string[] | undefined>; body?: unknown }, res: Res) {
  res.setHeader("Cache-Control", "no-store")
  if (req.method === "OPTIONS") { res.status(204).end(); return }
  if (req.method !== "POST") { res.status(405).json({ error: "Méthode non autorisée." }); return }
  const raw = req.headers.authorization ?? req.headers.Authorization
  const auth = Array.isArray(raw) ? raw[0] : raw
  let body = req.body
  if (typeof body === "string") { try { body = JSON.parse(body) } catch { body = {} } }
  const { status, body: payload } = await handleDevis(auth, body)
  res.status(status).json(payload)
}
