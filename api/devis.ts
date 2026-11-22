import type { SupabaseClient } from "@supabase/supabase-js"
import { adminClient, devisAcceptUrl, devisEmailHtml, env, factureEmailHtml, looksLikeEmail, reminderDelays, replyToFor, scheduleDevisReminders, sendResend, textToHtml } from "./_lib/mail.js"
import { notifyArtisan } from "./_lib/push.js"
import { authed as authSession, isResult, nativeCors } from "./_lib/http.js"
import { can, loadEntitlements, upgradeError, type Entitlements } from "./_lib/plans.js"
import { consume, monthKey, rateLimit } from "./_lib/limits.js"
import { reportError } from "./_lib/monitoring.js"
import { normStatut, withStatut } from "./_lib/devisStatut.js"
import { devisHash, logEvent } from "./_lib/signature.js"
import { acompteLines, cleanLines, computeFacture, r2, situationLines, soldeLines, type FLine } from "./_lib/factureCalc.js"

type Json = Record<string, unknown>
type Line = { l: string; q: number; u: string; pu: number; tv: number }
type ApiResult = { status: number; body: Json }

const CHAT_MODEL = () => env("XAI_CHAT_MODEL") || "grok-4-latest"

function round2(n: number) {
  return Math.round(n * 100) / 100
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

/** update52 : lignes d'un devis pour la facture — garde les remises (prix négatif), ignore titres de section et réglages, ajoute la description. */
function devisLines(raw: unknown): Line[] {
  if (!Array.isArray(raw)) return []
  const out: Line[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const o = item as Record<string, unknown>
    if (o.k === "sec" || o.k === "meta") continue
    const base = String(o.l ?? o.designation ?? o.libelle ?? "").trim()
    const d = typeof o.d === "string" ? o.d.trim() : ""
    const q = Number(o.q ?? o.qty ?? o.quantite), pu = Number(o.pu ?? o.prix ?? o.prix_ht), tv = Number(o.tv ?? o.tva ?? o.tva_taux)
    if (!base || !Number.isFinite(q) || q <= 0 || !Number.isFinite(pu) || (pu < 0 && o.k !== "rem")) continue
    out.push({ l: (d ? `${base}\n${d}` : base).slice(0, 1200), q: round2(q), u: String(o.u ?? o.unite ?? "u").trim().slice(0, 12) || "u", pu: round2(pu), tv: tv === 5.5 || tv === 10 || tv === 20 || tv === 0 ? tv : 20 })
  }
  return out.slice(0, 200)
}

function parseModelJson(text: string): { objet?: string; lines: Line[] } {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "")
  const parsed = JSON.parse(cleaned) as { objet?: string; object?: string; lines?: unknown; lignes?: unknown }
  return { objet: String(parsed.objet || parsed.object || "").trim(), lines: asLines(parsed.lines || parsed.lignes) }
}

async function nextNumero(supabase: SupabaseClient) {
  // update44 : compteur atomique en base (plus de doublon si deux devis partent en même temps)
  const { data, error } = await supabase.rpc("next_numero", { p_kind: "devis" })
  if (!error && data) return String(data)
  const { data: rows } = await supabase.from("devis").select("numero").order("created_at", { ascending: false }).limit(40)
  let max = 9087
  for (const r of rows || []) {
    const n = parseInt(String((r as { numero?: string }).numero || "").replace(/\D/g, ""), 10)
    if (Number.isFinite(n) && n > max && n < 1e9) max = n
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
- Si des tarifs artisan sont fournis, utilise-les pour les postes concernés (déplacement, diagnostic, taux horaire, forfait entretien chaudière). N'invente pas un forfait d'entretien s'il n'est pas listé.
- Réponds uniquement en JSON valide, sans markdown :
{"objet":"libellé court des travaux","lines":[{"l":"désignation","q":1,"u":"u","pu":120,"tv":10}]}`

function formatArtisanTarifs(raw: unknown): string {
  if (!raw || typeof raw !== "object") return ""
  const t = raw as Record<string, unknown>
  const euro = (v: unknown) => typeof v === "number" && Number.isFinite(v) ? `${String(v).replace(".", ",")} € HT` : null
  const lines: string[] = []
  const dep = euro(t.deplacement); if (dep) lines.push(`- Frais de déplacement : ${dep}`)
  const diag = euro(t.diagnostic); if (diag) lines.push(`- Frais de diagnostic : ${diag}`)
  const th = euro(t.tauxHoraire); if (th) lines.push(`- Taux horaire : ${th}`)
  const ent = euro(t.entretienChaudiere); if (ent) lines.push(`- Forfait entretien chaudière : ${ent}`)
  if (t.devisGratuit === true) lines.push("- Devis : gratuit")
  if (t.devisGratuit === false) lines.push("- Devis : payant")
  if (typeof t.majorationUrgence === "number" && Number.isFinite(t.majorationUrgence)) lines.push(`- Majoration urgence : +${t.majorationUrgence} %`)
  if (!lines.length) return ""
  return `Tarifs de l'artisan (à utiliser pour les postes correspondants, sans inventer d'autres prix forfaitaires) :\n${lines.join("\n")}`
}

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
  tarifs?: string
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
    input.tarifs ? input.tarifs : "",
    input.transcript ? `Transcription :\n${input.transcript.slice(0, 8000)}` : "",
  ].filter(Boolean)
  const models = [CHAT_MODEL(), "grok-4-fast-non-reasoning", "grok-4-latest", "grok-4"].filter((m, i, a) => m && a.indexOf(m) === i)
  let lastError = "Impossible de générer le brouillon de devis pour le moment."
  for (const model of models) {
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        messages: [
          { role: "system", content: DRAFT_SYSTEM },
          { role: "user", content: parts.join("\n") || "Prépare un brouillon de devis à partir des informations disponibles." },
        ],
        response_format: { type: "json_object" },
      }),
    })
    if (!res.ok) {
      lastError = res.status === 404
        ? "Le modèle IA configuré est indisponible pour générer le devis."
        : "Impossible de générer le brouillon de devis pour le moment."
      continue
    }
    const data = await res.json() as { choices?: { message?: { content?: string } }[] }
    const content = data.choices?.[0]?.message?.content || ""
    try {
      const parsed = parseModelJson(content)
      if (!parsed.lines.length) {
        lastError = "Le brouillon généré ne contient aucune ligne exploitable."
        continue
      }
      return { objet: parsed.objet, lines: parsed.lines }
    } catch {
      lastError = "Réponse du modèle illisible."
    }
  }
  return { error: lastError, status: 502 as const }
}

async function handleDraft(supabase: SupabaseClient, userId: string, body: Json, ent: Entitlements): Promise<ApiResult> {
  const callId = Number(body.call_id)
  if (!Number.isFinite(callId) || callId <= 0) return { status: 400, body: { error: "call_id manquant." } }
  if (!can(ent, "devis")) return { status: 402, body: { error: upgradeError("devis", ent), code: "upgrade" } }

  const { data: existing } = await supabase.from("devis").select("id, numero, objet, lignes, total_ht, total_ttc, statut").eq("call_id", callId).order("created_at", { ascending: false }).limit(1).maybeSingle()
  if (existing) {
    return { status: 200, body: { ok: true, reused: true, devis_id: existing.id, numero: existing.numero, objet: existing.objet, lines: existing.lignes, total_ht: existing.total_ht, total_ttc: existing.total_ttc, statut: existing.statut } }
  }

  const { data: call, error: cErr } = await supabase.from("calls").select("id, nom_client, telephone_client, email_client, adresse, ville, code_postal, motif, besoin_detail, resume, notes, transcript").eq("id", callId).maybeSingle()
  if (cErr || !call) return { status: 404, body: { error: "Appel introuvable." } }

  if (!await rateLimit(userId, "devis-draft", 6)) return { status: 429, body: { error: "Trop de brouillons d'affilée. Patientez une minute." } }
  if (!await consume(userId, "devis_drafts", monthKey(), ent.quotas.devis_drafts)) {
    return { status: 429, body: { error: `Quota de ${ent.quotas.devis_drafts} brouillons IA atteint ce mois-ci.`, code: "quota" } }
  }
  const { data: artisan } = await supabase.from("artisans").select("entreprise_nom, nom_entreprise, prenom, tarifs").eq("id", userId).maybeSingle()
  const drafted = await draftFromXai({
    company: artisan?.entreprise_nom || artisan?.nom_entreprise || "",
    client: call.nom_client || "",
    resume: call.resume || "",
    motif: call.motif || "",
    besoin: call.besoin_detail || "",
    notes: call.notes || "",
    transcript: typeof call.transcript === "string" ? call.transcript : "",
    adresse: [call.adresse, call.code_postal, call.ville].filter(Boolean).join(", "),
    tarifs: formatArtisanTarifs(artisan?.tarifs),
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
  await notifyArtisan(userId, {
    title: "Devis à valider",
    body: `${inserted.numero} · ${call.nom_client || "Client"}`,
    url: "/devis",
    tag: `devis-${inserted.id}`,
  })
  return {
    status: 200,
    body: { ok: true, devis_id: inserted.id, numero: inserted.numero, objet, lines: drafted.lines, total_ht: tot.ht, total_ttc: tot.ttc, statut: "brouillon" },
  }
}

async function handleSend(supabase: SupabaseClient, userId: string, body: Json): Promise<ApiResult> {
  const devisId = String(body.devis_id || "").trim()
  if (!devisId) return { status: 400, body: { error: "devis_id manquant." } }
  const { data: devis, error } = await supabase.from("devis").select("id, numero, client_nom, client_email, objet, statut, token").eq("id", devisId).maybeSingle()
  if (error || !devis) return { status: 404, body: { error: "Devis introuvable." } }
  if (normStatut(devis.statut) === "env") {
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

  const { data: artisan } = await supabase.from("artisans").select("entreprise_nom, nom_entreprise, prenom, entreprise_email, email, relance_delais").eq("id", userId).maybeSingle()
  const company = artisan?.entreprise_nom || artisan?.nom_entreprise || "votre artisan"
  const token = String(devis.token || "")
  const acceptUrl = token ? devisAcceptUrl(token) : ""
  const mailed = await sendResend({
    to: email,
    subject: `Devis n° ${devis.numero} — ${company}`,
    html: devisEmailHtml({ client: devis.client_nom, numero: String(devis.numero), objet: devis.objet || undefined, company, acceptUrl }),
    replyTo: replyToFor(token, artisan?.entreprise_email || artisan?.email || undefined),
    company,
    attachments: [{ filename, content: pdf }],
  })
  if (!mailed.ok) {
    return { status: mailed.missingKey ? 503 : 502, body: { error: mailed.missingKey ? "L'envoi d'e-mail n'est pas configuré (RESEND_API_KEY manquante). Téléchargez le PDF et envoyez-le vous-même." : "L'e-mail n'a pas pu être envoyé. Téléchargez le PDF et envoyez-le vous-même.", download: true } }
  }

  const sentAt = new Date().toISOString()
  const { error: uErr } = await withStatut("env", statut => supabase.from("devis").update({
    statut,
    envoye_le: sentAt,
    client_email: email,
  }).eq("id", devisId))
  if (uErr) return { status: 500, body: { error: "E-mail envoyé, mais le statut n'a pas pu être mis à jour." } }
  try { await scheduleDevisReminders(supabase, { artisanId: userId, devisId, client: devis.client_nom, envoyeLe: sentAt, delays: reminderDelays(artisan?.relance_delais) }) } catch { /* le devis est déjà parti */ }
  // update61 : journal de preuve de la signature électronique (envoi du devis)
  try { const { data: full } = await supabase.from("devis").select("*").eq("id", devisId).maybeSingle(); if (full) await logEvent(adminClient(), { artisan_id: userId, devis_id: devisId, event: "envoi", signataire: email, document_hash: await devisHash(full), at: sentAt }) } catch { /* journal facultatif */ }
  return { status: 200, body: { ok: true, sent_at: sentAt, email } }
}

export async function handleDevis(authorization?: string, body?: unknown): Promise<ApiResult> {
  const session = await authSession(authorization)
  if (isResult(session)) return session
  const input = (body && typeof body === "object" ? body : {}) as Json
  const { supabase, userId } = session
  try {
    const ent = await loadEntitlements(supabase, userId)
    const action = String(input.action || "")
    if (action === "draft") return await handleDraft(supabase, userId, input, ent)
    if (!ent.access) return { status: 402, body: { error: upgradeError("devis", ent), code: "upgrade" } }
    if (action === "send") return await handleSend(supabase, userId, input)
    if (action.startsWith("facture_") || action === "avoir") {
      if (!can(ent, "factures")) return { status: 402, body: { error: upgradeError("factures", ent), code: "upgrade" } }
      if (action === "facture_from_devis") return await factureFromDevis(supabase, userId, input)
      if (action === "facture_emit") return await factureEmit(supabase, input)
      if (action === "facture_send") return await factureSend(supabase, userId, input)
      if (action === "facture_paid") return await facturePaid(supabase, input)
      if (action === "facture_relance_send") return await factureRelanceSend(supabase, userId, input)
      if (action === "avoir") return await factureAvoir(supabase, userId, input)
    }
    return { status: 400, body: { error: "Action inconnue." } }
  } catch (e) {
    await reportError(e, { route: "devis", action: String(input.action || "") })
    return { status: 500, body: { error: "Erreur serveur." } }
  }
}

/* ===================== update46 · Factures ===================== */

// TVA à zéro : franchise (art. 293 B) ou autoliquidation (sous-traitance BTP)
// update61 : arrondis EN 16931 (TVA par taux), partagés avec le PDF et le XML Factur-X
function factureTotals(lines: FLine[], zeroTva = false) {
  const t = computeFacture(lines, { zeroTva })
  return { total_ht: t.ht, total_tva: t.tva, total_ttc: t.ttc }
}
const MIGRATION_61 = "Fonction indisponible : appliquez la migration 20261121_10 (voir UPDATE61-LISEZMOI)."

/** update61 · Facture depuis un devis accepté : facture complète, acompte (une ligne par taux),
    situation d'avancement (pourcentage cumulé), solde (reste exact, acomptes déduits). */
async function factureFromDevis(supabase: SupabaseClient, userId: string, body: Json): Promise<ApiResult> {
  const devisId = String(body.devis_id || "").trim()
  if (!devisId) return { status: 400, body: { error: "devis_id manquant." } }
  const { data: devis } = await supabase.from("devis").select("id, numero, client_nom, client_email, client_telephone, client_adresse, objet, lignes, statut").eq("id", devisId).maybeSingle()
  if (!devis) return { status: 404, body: { error: "Devis introuvable." } }
  if (normStatut(devis.statut) !== "val") return { status: 409, body: { error: "Seul un devis accepté peut être facturé." } }
  let type: "facture" | "acompte" | "situation" | "solde" = (["acompte", "situation", "solde"] as const).find(t => t === body.type) || "facture"
  const lines = devisLines(devis.lignes)
  if (!lines.length) return { status: 400, body: { error: "Le devis ne contient aucune ligne." } }

  const { data: previous } = await supabase.from("factures").select("*").eq("devis_id", devisId)
  const prevRows = (previous || []) as Json[]
  const live = prevRows.filter(f => f.numero && f.statut !== "annulee")
  const acomptes = live.filter(f => f.type === "acompte")
  const situations = live.filter(f => f.type === "situation")
  // Après des acomptes ou des situations, la facture finale est une facture de solde
  if (type === "facture" && (acomptes.length || situations.length)) type = "solde"
  const existingDraft = prevRows.find(f => !f.numero && f.type === type)
  if (existingDraft) return { status: 200, body: { ok: true, reused: true, facture_id: existingDraft.id } }
  const closed = live.some(f => f.type === "facture" || f.type === "solde" || (f.type === "situation" && Number(f.avancement_pct) >= 100))
  if (type !== "acompte" && closed) return { status: 409, body: { error: "Ce devis est déjà entièrement facturé. Pour corriger, faites un avoir." } }

  const prevCum = situations.map(f => Number(f.avancement_pct) || 0)
  let lignes: FLine[] = lines, avancement: number | null = null
  try {
    if (type === "acompte") lignes = acompteLines(lines, Number(body.pourcentage) || 30, String(devis.numero || ""), devis.objet || undefined)
    else if (type === "situation") {
      avancement = Math.round(Number(body.avancement) * 100) / 100
      if (!Number.isFinite(avancement)) return { status: 400, body: { error: "Indiquez l'avancement cumulé (en %)." } }
      lignes = situationLines(lines, prevCum, avancement, situations.length + 1)
    } else if (type === "solde") lignes = soldeLines(lines, prevCum)
  } catch (e) { return { status: 400, body: { error: e instanceof Error ? e.message : "Avancement invalide." } } }
  if (!lignes.length) return { status: 400, body: { error: "Rien à facturer." } }

  const final = type === "facture" || type === "solde" || (type === "situation" && avancement === 100)
  const acompteDeduit = final ? r2(acomptes.reduce((a, f) => a + Number(f.total_ttc || 0), 0)) : 0
  const { data: artisanRow } = await supabase.from("artisans").select("*").eq("id", userId).maybeSingle()
  const artisan = (artisanRow || {}) as Json
  const franchise = !!artisan.tva_non_applicable
  const retenue = Math.min(5, Math.max(0, Number(body.retenue_pct) || 0))
  const row: Json = {
    artisan_id: userId,
    devis_id: devisId,
    type,
    statut: "brouillon",
    client_nom: devis.client_nom || "Client",
    client_email: devis.client_email || null,
    client_telephone: devis.client_telephone || null,
    client_adresse: devis.client_adresse || null,
    adresse_chantier: devis.client_adresse || null,
    objet: devis.objet || null,
    lignes,
    ...factureTotals(lignes, franchise),
    acompte_deduit: acompteDeduit,
    delai_paiement_jours: Number(artisan.delai_paiement_jours) || 30,
    ...(artisan.tva_sur_debits ? { tva_sur_debits: true } : {}),
    ...(avancement !== null ? { avancement_pct: avancement } : {}),
    ...(retenue > 0 ? { retenue_garantie_pct: retenue } : {}),
  }
  const { data: inserted, error } = await supabase.from("factures").insert(row).select("id").maybeSingle()
  if (error || !inserted) return { status: 500, body: { error: type === "situation" || (type === "solde" && !acomptes.length) || retenue > 0 ? MIGRATION_61 : "Impossible de créer la facture." } }
  return { status: 200, body: { ok: true, facture_id: inserted.id } }
}

async function factureEmit(supabase: SupabaseClient, body: Json): Promise<ApiResult> {
  const id = String(body.facture_id || "").trim()
  if (!id) return { status: 400, body: { error: "facture_id manquant." } }
  const { data: f } = await supabase.from("factures").select("id, artisan_id, lignes, numero, type, facture_origine_id, total_ttc, autoliquidation").eq("id", id).maybeSingle()
  if (!f) return { status: 404, body: { error: "Facture introuvable." } }
  if (!f.numero) {
    const lines = cleanLines(f.lignes)
    if (!lines.length) return { status: 400, body: { error: "La facture ne contient aucune ligne." } }
    const { data: a } = await supabase.from("artisans").select("tva_non_applicable").eq("id", f.artisan_id).maybeSingle()
    const totals = factureTotals(lines, !!f.autoliquidation || !!(a as { tva_non_applicable?: boolean } | null)?.tva_non_applicable)
    await supabase.from("factures").update({ lignes: lines, ...totals }).eq("id", id)
    f.total_ttc = totals.total_ttc
  }
  const { data: numero, error } = await supabase.rpc("emettre_facture", { p_id: id })
  if (error || !numero) return { status: 400, body: { error: error?.message || "Émission impossible." } }
  if (f.type === "avoir" && f.facture_origine_id) {
    const { data: orig } = await supabase.from("factures").select("total_ttc, statut").eq("id", f.facture_origine_id).maybeSingle()
    if (orig && orig.statut !== "payee" && Math.abs(Number(orig.total_ttc) - Number(f.total_ttc)) < 0.01) {
      await supabase.from("factures").update({ statut: "annulee" }).eq("id", f.facture_origine_id)
      await supabase.from("facture_relances").update({ statut: "ignoree" }).eq("facture_id", f.facture_origine_id).eq("statut", "a_valider")
    }
  }
  const { data: row } = await supabase.from("factures").select("*").eq("id", id).maybeSingle()
  return { status: 200, body: { ok: true, numero: String(numero), facture: row as Json } }
}

function cleanPdf(raw: unknown) {
  return String(raw || "").replace(/^data:application\/pdf;base64,/i, "").trim()
}

async function factureSend(supabase: SupabaseClient, userId: string, body: Json): Promise<ApiResult> {
  const id = String(body.facture_id || "").trim()
  const { data: f } = await supabase.from("factures").select("*").eq("id", id).maybeSingle()
  if (!f) return { status: 404, body: { error: "Facture introuvable." } }
  if (!f.numero) return { status: 409, body: { error: "Émettez la facture avant de l'envoyer." } }
  const email = String(body.email || f.client_email || "").trim()
  if (!looksLikeEmail(email)) return { status: 400, body: { error: "Indiquez un e-mail client valide." } }
  const pdf = cleanPdf(body.pdf_base64)
  if (!pdf || pdf.length < 80) return { status: 400, body: { error: "PDF manquant." } }
  if (!env("RESEND_API_KEY")) {
    return { status: 503, body: { ok: false, download: true, error: "L'envoi d'e-mail n'est pas configuré (RESEND_API_KEY manquante). Téléchargez le PDF et envoyez-le vous-même." } }
  }
  const { data: artisan } = await supabase.from("artisans").select("entreprise_nom, nom_entreprise, entreprise_email, email, iban").eq("id", userId).maybeSingle()
  const company = artisan?.entreprise_nom || artisan?.nom_entreprise || "votre artisan"
  const avoir = f.type === "avoir"
  const mailed = await sendResend({
    to: email,
    subject: `${avoir ? "Avoir" : "Facture"} n° ${f.numero} — ${company}`,
    html: factureEmailHtml({ client: f.client_nom || undefined, numero: String(f.numero), objet: f.objet || undefined, company, ttc: r2(Number(f.total_ttc) - Number(f.acompte_deduit || 0) - r2(Number(f.total_ttc) * (Number(f.retenue_garantie_pct) || 0) / 100)), echeance: f.date_echeance, iban: artisan?.iban || null, avoir }),
    replyTo: artisan?.entreprise_email || artisan?.email || undefined,
    company,
    attachments: [{ filename: `${avoir ? "Avoir" : "Facture"}-${f.numero}.pdf`, content: pdf }],
  })
  if (!mailed.ok) return { status: mailed.missingKey ? 503 : 502, body: { error: "L'e-mail n'a pas pu être envoyé. Téléchargez le PDF et envoyez-le vous-même.", download: true } }
  const now = new Date().toISOString()
  await supabase.from("factures").update({ envoyee_le: now, client_email: email, ...(f.statut === "emise" ? { statut: "envoyee" } : {}) }).eq("id", id)
  return { status: 200, body: { ok: true, sent_at: now, email } }
}

async function facturePaid(supabase: SupabaseClient, body: Json): Promise<ApiResult> {
  const id = String(body.facture_id || "").trim()
  const { data: f } = await supabase.from("factures").select("id, numero, statut").eq("id", id).maybeSingle()
  if (!f) return { status: 404, body: { error: "Facture introuvable." } }
  if (!f.numero) return { status: 409, body: { error: "Émettez la facture avant de la marquer payée." } }
  const paid = body.paid !== false
  const { error } = await supabase.from("factures").update(paid
    ? { statut: "payee", payee_le: new Date().toISOString(), mode_paiement: String(body.mode || "").slice(0, 40) || null }
    : { statut: "envoyee", payee_le: null }).eq("id", id)
  if (error) return { status: 500, body: { error: "Mise à jour impossible." } }
  if (paid) await supabase.from("facture_relances").update({ statut: "ignoree" }).eq("facture_id", id).eq("statut", "a_valider")
  return { status: 200, body: { ok: true } }
}

async function factureRelanceSend(supabase: SupabaseClient, userId: string, body: Json): Promise<ApiResult> {
  const id = String(body.relance_id || "").trim()
  const { data: rel } = await supabase.from("facture_relances").select("id, facture_id, niveau, statut, sujet, corps").eq("id", id).maybeSingle()
  if (!rel) return { status: 404, body: { error: "Relance introuvable." } }
  if (rel.statut === "envoyee") return { status: 409, body: { error: "Cette relance a déjà été envoyée." } }
  const { data: f } = await supabase.from("factures").select("id, numero, statut, client_email, client_nom").eq("id", rel.facture_id).maybeSingle()
  if (!f) return { status: 404, body: { error: "Facture introuvable." } }
  if (f.statut === "payee" || f.statut === "annulee") return { status: 409, body: { error: "Cette facture est réglée ou annulée." } }
  const email = String(body.email || f.client_email || "").trim()
  if (!looksLikeEmail(email)) return { status: 400, body: { error: "Indiquez l'e-mail du client sur la facture." } }
  const sujet = String(body.sujet || rel.sujet || `Facture n° ${f.numero}`).slice(0, 200)
  const corps = String(body.corps || rel.corps || "").slice(0, 6000)
  if (!corps.trim()) return { status: 400, body: { error: "Le message est vide." } }
  const { data: artisan } = await supabase.from("artisans").select("entreprise_nom, nom_entreprise, entreprise_email, email").eq("id", userId).maybeSingle()
  const company = artisan?.entreprise_nom || artisan?.nom_entreprise || "votre artisan"
  const pdf = cleanPdf(body.pdf_base64)
  const mailed = await sendResend({
    to: email,
    subject: sujet,
    html: textToHtml(corps),
    replyTo: artisan?.entreprise_email || artisan?.email || undefined,
    company,
    ...(pdf.length > 80 ? { attachments: [{ filename: `Facture-${f.numero}.pdf`, content: pdf }] } : {}),
  })
  if (!mailed.ok) {
    return { status: mailed.missingKey ? 503 : 502, body: { error: mailed.missingKey ? "L'envoi d'e-mail n'est pas configuré (RESEND_API_KEY manquante). Copiez le texte et envoyez-le vous-même." : "L'e-mail n'a pas pu être envoyé.", copy: true } }
  }
  const now = new Date().toISOString()
  await supabase.from("facture_relances").update({ statut: "envoyee", sent_at: now, sujet, corps }).eq("id", id)
  return { status: 200, body: { ok: true, sent_at: now } }
}

async function factureAvoir(supabase: SupabaseClient, userId: string, body: Json): Promise<ApiResult> {
  const id = String(body.facture_id || "").trim()
  const { data: f } = await supabase.from("factures").select("*").eq("id", id).maybeSingle()
  if (!f) return { status: 404, body: { error: "Facture introuvable." } }
  if (!f.numero || f.type === "avoir") return { status: 409, body: { error: "Un avoir se fait sur une facture émise." } }
  const { data: existing } = await supabase.from("factures").select("id").eq("facture_origine_id", id).is("numero", null).maybeSingle()
  if (existing) return { status: 200, body: { ok: true, reused: true, facture_id: existing.id } }
  const lines = cleanLines(f.lignes)
  const row = {
    artisan_id: userId,
    devis_id: f.devis_id,
    type: "avoir",
    statut: "brouillon",
    facture_origine_id: id,
    client_nom: f.client_nom, client_email: f.client_email, client_telephone: f.client_telephone, client_adresse: f.client_adresse,
    client_pro: f.client_pro, client_siren: f.client_siren, client_tva: f.client_tva, adresse_chantier: f.adresse_chantier,
    objet: `Avoir sur facture n° ${f.numero}${f.objet ? ` — ${f.objet}` : ""}`,
    nature: f.nature,
    lignes: lines,
    ...factureTotals(lines, !!f.autoliquidation || Number(f.total_tva) === 0),
    autoliquidation: f.autoliquidation,
    ...(f.tva_sur_debits ? { tva_sur_debits: true } : {}),
    delai_paiement_jours: 0,
  }
  const { data: inserted, error } = await supabase.from("factures").insert(row).select("id").maybeSingle()
  if (error || !inserted) return { status: 500, body: { error: "Impossible de créer l'avoir." } }
  return { status: 200, body: { ok: true, facture_id: inserted.id } }
}

type Res = { status: (n: number) => Res; json: (b: unknown) => void; setHeader: (k: string, v: string) => void; end: () => void }

export default async function handler(req: { method?: string; headers: Record<string, string | string[] | undefined>; body?: unknown }, res: Res) {
  res.setHeader("Cache-Control", "no-store")
  nativeCors(req.headers, res) // update70 · app native (Capacitor)
  if (req.method === "OPTIONS") { res.status(204).end(); return }
  if (req.method !== "POST") { res.status(405).json({ error: "Méthode non autorisée." }); return }
  const raw = req.headers.authorization ?? req.headers.Authorization
  const auth = Array.isArray(raw) ? raw[0] : raw
  let body = req.body
  if (typeof body === "string") { try { body = JSON.parse(body) } catch { body = {} } }
  const { status, body: payload } = await handleDevis(auth, body)
  res.status(status).json(payload)
}
