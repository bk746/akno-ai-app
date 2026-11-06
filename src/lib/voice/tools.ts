import { supabase } from "../supabase"
import type { VoiceProfile } from "./script"

export type BookArgs = {
  client?: string
  telephone?: string
  date?: string
  heure?: string
  duree_minutes?: number
  objet?: string
  adresse?: string
  ville?: string
  notes?: string
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
  devis_demande?: boolean
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

export async function bookAppointment(args: BookArgs) {
  const user = await me()
  const slot = parseSlot(args.date, args.heure)
  if ("error" in slot) return { ok: false, error: slot.error }
  const minutes = Math.max(30, Number(args.duree_minutes) || 60)
  const end = new Date(slot.start.getTime() + minutes * 60_000)
  const row = {
    artisan_id: user.id,
    title: args.objet?.trim() || "Rendez-vous",
    client: args.client?.trim() || "Client",
    telephone_client: args.telephone?.trim() || null,
    start: slot.start.toISOString(),
    end: end.toISOString(),
    adresse: args.adresse?.trim() || null,
    ville: args.ville?.trim() || null,
    notes: args.notes?.trim() || null,
  }
  const { data, error } = await supabase.from("appointments").insert(row).select("id").maybeSingle()
  if (error) return { ok: false, error: "Impossible d'enregistrer le rendez-vous." }
  const when = slot.start.toLocaleString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })
  return { ok: true, appointment_id: data?.id, confirmation: `Rendez-vous confirmé le ${when} pour ${row.client}.` }
}

function formatTranscript(lines: { role: "user" | "assistant"; text: string }[]) {
  return lines
    .map(l => `${l.role === "assistant" ? "Akno" : "Client"}: ${l.text.trim()}`)
    .filter(l => !l.endsWith(":"))
    .join("\n")
}

async function nextDevisNumero() {
  const { data } = await supabase.from("devis").select("numero").order("created_at", { ascending: false }).limit(1)
  const last = parseInt(String(data?.[0]?.numero || "9080").replace(/\D/g, ""), 10)
  return String((Number.isFinite(last) ? last : 9080) + 1)
}

export async function saveCall(
  args: SaveArgs,
  extra: { transcript: { role: "user" | "assistant"; text: string }[]; durationSec: number; profile?: VoiceProfile },
) {
  const user = await me()
  const urgent = args.urgence === "urgent" || args.type_demande === "urgence"
  const statut = args.rdv_pris ? "rdv_pris" : args.a_rappeler === false ? "renseigne" : "a_rappeler"
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
    statut,
    notes: args.notes?.trim() || null,
  }
  const { data, error } = await supabase.from("calls").insert(row).select("id").maybeSingle()
  if (error) return { ok: false, error: "Impossible d'enregistrer l'appel." }

  let devis_id: string | undefined
  if (args.devis_demande || args.type_demande === "devis") {
    const numero = await nextDevisNumero()
    const objet = args.motif?.trim() || args.besoin_detail?.trim() || "Demande de devis"
    const adresse = [args.adresse, args.code_postal, args.ville].filter(Boolean).join(", ")
    const { data: devis, error: dErr } = await supabase.from("devis").insert({
      artisan_id: user.id,
      numero,
      client_nom: row.nom_client,
      client_email: "",
      client_telephone: row.telephone_client,
      client_adresse: adresse || null,
      objet,
      lignes: [],
      total_ht: 0,
      tva_taux: 20,
      total_ttc: 0,
      statut: "brouillon",
    }).select("id, numero").maybeSingle()
    if (!dErr && devis) devis_id = devis.id
  }

  return {
    ok: true,
    call_id: data?.id,
    devis_id,
    message: devis_id
      ? "Appel enregistré et brouillon de devis créé."
      : "Appel enregistré dans Réception.",
  }
}
