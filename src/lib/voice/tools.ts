import { supabase } from "../supabase"
import { draftDevisFromCall } from "../devisApi"
import type { VoiceProfile } from "./script"

export type BookArgs = {
  prenom?: string
  nom?: string
  client?: string
  telephone?: string
  email?: string
  date?: string
  heure?: string
  duree_minutes?: number
  objet?: string
  adresse?: string
  ville?: string
  notes?: string
}

export type SlotsArgs = {
  date_from?: string
  date_to?: string
  preferred_day?: string
  duree_minutes?: number
}

export type SaveArgs = {
  nom_client?: string
  telephone_client?: string
  adresse?: string
  ville?: string
  code_postal?: string
  motif?: string
  besoin_detail?: string
  resume?: string
  type_demande?: string
  urgence?: string
  a_rappeler?: boolean
  rappel_souhaite?: boolean
  rappel_creneau?: string
  devis_demande?: boolean
  email_client?: string
  rdv_pris?: boolean
  notes?: string
}

const pad = (n: number) => String(n).padStart(2, "0")

function parseSlot(date?: string, heure?: string) {
  const d = (date || "").trim()
  const h = (heure || "").trim().replace("h", ":")
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return { error: "La date doit être au format AAAA-MM-JJ." }
  const hm = h.match(/^(\d{1,2}):(\d{2})$/)
  if (!hm) return { error: "L'heure doit être au format HH:MM." }
  const hours = Number(hm[1]), mins = Number(hm[2])
  if (hours < 0 || hours > 23 || mins < 0 || mins > 59) return { error: "Heure invalide." }
  const start = new Date(`${d}T${pad(hours)}:${pad(mins)}:00`)
  if (Number.isNaN(start.getTime())) return { error: "Date ou heure invalide." }
  const dow = start.getDay()
  if (dow === 0 || dow === 6) return { error: "Les rendez-vous sont du lundi au vendredi, de 8 h à 18 h." }
  if (hours < 8 || hours > 17 || (hours === 17 && mins > 0)) {
    return { error: "Les rendez-vous sont possibles de 8 h à 18 h. Propose un créneau qui se termine au plus tard à 18 h." }
  }
  return { start }
}

async function me() {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error("Session expirée")
  return user
}

function notifySelf(payload: Record<string, unknown>) {
  void (async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return
      await fetch("/api/notify", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
    } catch { /* ignore */ }
  })()
}

async function bookingApi(action: "slots" | "book", payload: object) {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) return { ok: false, error: "Session expirée." }
    const r = await fetch("/api/booking", {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
    })
    const body = await r.json().catch(() => ({})) as Record<string, unknown>
    if (typeof body.ok !== "boolean" && !r.ok) {
      return { ok: false, error: String(body.error || "Impossible de joindre l'agenda.") }
    }
    return body
  } catch {
    return { ok: false, error: "Impossible de joindre l'agenda." }
  }
}

export async function getAvailableSlots(args: SlotsArgs) {
  const body = await bookingApi("slots", args)
  if (body.ok === true) return body
  return { ok: false, error: body.error || "Impossible de lire les créneaux.", slots: body.slots || [] }
}

function bookingClientName(args: BookArgs) {
  const prenom = args.prenom?.trim() || ""
  const nom = args.nom?.trim() || ""
  const composed = [prenom, nom].filter(Boolean).join(" ")
  return composed || args.client?.trim() || "Client"
}

export async function bookAppointment(args: BookArgs) {
  const client = bookingClientName(args)
  const booked = await bookingApi("book", { ...args, client }) as {
    ok?: boolean; error?: string; alternatives?: unknown; confirmation?: string
    start?: string; end?: string; cal_uid?: string; label?: string
  }
  if (!booked.ok) {
    return { ok: false, error: booked.error || "Créneau indisponible.", alternatives: booked.alternatives || [] }
  }
  const user = await me()
  const parsed = parseSlot(args.date, args.heure)
  const start = booked.start || ("start" in parsed && parsed.start ? parsed.start.toISOString() : new Date().toISOString())
  const minutes = Math.max(30, Number(args.duree_minutes) || 60)
  const end = booked.end || new Date(new Date(start).getTime() + minutes * 60_000).toISOString()
  const row = {
    artisan_id: user.id,
    title: args.objet?.trim() || "Rendez-vous",
    client,
    telephone_client: args.telephone?.trim() || null,
    email_client: args.email?.trim() || null,
    start,
    end,
    adresse: args.adresse?.trim() || null,
    ville: args.ville?.trim() || null,
    notes: [args.notes?.trim(), booked.cal_uid ? `cal:${booked.cal_uid}` : ""].filter(Boolean).join(" ") || null,
  }
  const { data, error } = await supabase.from("appointments").insert(row).select("id").maybeSingle()
  const when = [args.date, args.heure].filter(Boolean).join(" à ") || booked.label || "Nouveau rendez-vous"
  notifySelf({ type: "appointment", client: row.client, when, appointment_id: data?.id })
  if (error) {
    return { ok: true, appointment_id: null, confirmation: booked.confirmation || "Rendez-vous confirmé dans l'agenda.", warning: "Enregistré dans Cal.com, mais pas encore visible dans l'Agenda." }
  }
  return { ok: true, appointment_id: data?.id, confirmation: booked.confirmation || `Rendez-vous confirmé pour ${row.client}.` }
}

function formatTranscript(lines: { role: "user" | "assistant"; text: string }[]) {
  return lines
    .map(l => `${l.role === "assistant" ? "Akno" : "Client"}: ${l.text.trim()}`)
    .filter(l => !l.endsWith(":"))
    .join("\n")
}

function isForfaitService(blob: string) {
  return /(contrat d['’]entretien|contrat d['’]abonnement|contrat de suivi|abonnement( de suivi)?|suivi de chaudi[eè]re|entretien annuel|entretien( annuel)?( de)? (la |l['’])?(chaudi[eè]re|pac|pompe à chaleur|clim)|\bramonage\b|contrat (pac|clim|pompe à chaleur|climatisation)|visite de conformit[eé])/i.test(blob)
}

const LIKE_FOR_LIKE_ITEM = /(toilettes?|\bwc\b|w\.?-?c|cuvette|robinets?|mitigeurs?|chasse d['’]eau|lavabos?|vasques?|éviers?|eviers?|prises?( électriques?)?|interrupteurs?|luminaires?|appliques?|\bspots?\b)/i
const LIKE_FOR_LIKE_BALLON = /(ballon|cumulus|chauffe-eau).{0,28}(identique|pareil|m[eê]me (modèle|modele|taille|type|emplacement))|(identique|pareil|m[eê]me (modèle|modele|taille|type|emplacement)).{0,28}(ballon|cumulus|chauffe-eau)|ballon identique|cumulus identique/i
const LIKE_FOR_LIKE_SWAP = /(remplacement|remplacer|changer\b|changement|à l['’]identique|a l['’]identique|identique|pareil|nouveau|nouvelle|\bdevis\b)/i

function isLikeForLikeReplacement(blob: string) {
  if (/(chaudi[eè]re|pompe à chaleur|\bpac\b|tableau [eé]lectrique|r[eé]novation)/i.test(blob)) return false
  if (LIKE_FOR_LIKE_BALLON.test(blob)) return true
  return LIKE_FOR_LIKE_ITEM.test(blob) && LIKE_FOR_LIKE_SWAP.test(blob)
}

function isDiagnosticJob(blob: string) {
  return /(remplacement|installation|r[eé]novation|d[eé]pannage|\ben panne\b|\bpanne\b|changer\b|changement|remplacer|installer|\bfuite\b|plus d['’]eau chaude|diagnostic sur place|visite de diagnostic|venir sur place|vienne sur place|sur place faire)/i.test(blob)
}

export function inferDevisRequest(args: Partial<SaveArgs>, transcript: { role: string; text: string }[] = []) {
  const blob = [args.resume, args.motif, args.besoin_detail, args.notes, args.type_demande, ...transcript.map(l => l.text)].filter(Boolean).join("\n").toLowerCase()
  const forfait = isForfaitService(blob)
  const likeForLike = isLikeForLikeReplacement(blob)
  const diagnostic = isDiagnosticJob(blob)
  // Catégorie B : forfait, ou remplacement simple à l'identique (WC, robinet, ballon identique…).
  if (likeForLike) return true
  // Catégorie A : travaux / panne / rénovation / diagnostic — pas de brouillon maintenant.
  if (diagnostic) return false
  // Catégorie B forfait, même si « chaudière » apparaît.
  if (forfait) return true
  if (args.devis_demande === false) return false
  if (args.devis_demande || args.type_demande === "devis") return true
  if (/devis demandé/.test(blob)) return true
  if (/\bdevis\b/.test(blob) && /(oui|d['’]accord|\bok\b|envoyer|envoi|par (e-?mail|mail)|je (veux|voudrais|souhait)|faire un devis|un devis s['’]il|besoin d['’]un devis)/.test(blob)) return true
  return false
}

export async function saveCall(
  args: SaveArgs,
  extra: { transcript: { role: "user" | "assistant"; text: string }[]; durationSec: number; profile?: VoiceProfile },
) {
  const user = await me()
  const urgent = args.urgence === "urgent" || args.type_demande === "urgence"
  const rappelSouhaite = args.rappel_souhaite === true || (args.rappel_souhaite == null && args.a_rappeler === true)
  const rappelCreneau = rappelSouhaite ? (args.rappel_creneau?.trim() || null) : null
  const statut = rappelSouhaite ? "a_rappeler" : args.rdv_pris ? "rdv_pris" : "renseigne"
  const resume = (args.resume || "").trim() || "Appel test de la réceptionniste."
  const row = {
    artisan_id: user.id,
    nom_client: args.nom_client?.trim() || "Appel test",
    telephone_client: args.telephone_client?.trim() || null,
    motif: args.motif?.trim() || args.type_demande || "Appel",
    besoin_detail: args.besoin_detail?.trim() || null,
    resume,
    code_postal: args.code_postal?.trim() || null,
    ville: args.ville?.trim() || null,
    adresse: args.adresse?.trim() || null,
    type_demande: args.type_demande?.trim() || "autre",
    urgence: urgent ? "urgent" : "normal",
    transcript: formatTranscript(extra.transcript) || null,
    duration: Math.max(0, Math.round(extra.durationSec)),
    email_client: args.email_client?.trim() || null,
    statut,
    notes: args.notes?.trim() || null,
    rappel_souhaite: rappelSouhaite,
    rappel_creneau: rappelCreneau,
  }
  const wantDevis = inferDevisRequest(args, extra.transcript)
  if (wantDevis && row.type_demande === "autre") row.type_demande = "devis"
  const { data, error } = await supabase.from("calls").insert(row).select("id").maybeSingle()
  if (error) return { ok: false, error: "Impossible d'enregistrer l'appel." }
  notifySelf({ type: "call", client: row.nom_client, motif: row.motif, call_id: data?.id, rappel_souhaite: rappelSouhaite, rappel_creneau: rappelCreneau })
  try { dispatchEvent(new Event("akno-refresh")) } catch { /* */ }

  let devis_id: string | undefined
  let draftError: string | undefined
  if (data?.id && wantDevis) {
    const draft = await draftDevisFromCall(data.id)
    if (draft.ok && draft.devis_id) devis_id = String(draft.devis_id)
    else draftError = draft.error || "Le brouillon de devis n'a pas pu être généré."
    try { dispatchEvent(new Event("akno-refresh")) } catch { /* */ }
  }

  return {
    ok: true,
    call_id: data?.id,
    devis_id,
    message: devis_id
      ? "Appel enregistré et brouillon de devis créé — à valider avant envoi."
      : wantDevis
        ? `Appel enregistré. ${draftError || "Le brouillon de devis n'a pas pu être généré automatiquement."}`
        : "Appel enregistré dans Réception.",
  }
}
