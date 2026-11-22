/* update76 · Achat et libération autonomes du numéro Twilio de l'artisan.
   Aucun achat réel dans les tests : le client Twilio est injecté (mocks). */
import type { SupabaseClient } from "@supabase/supabase-js"
import { appUrl, env, sendResend } from "./mail.js"
import { can, loadEntitlements } from "./plans.js"
import { reportError } from "./monitoring.js"

export const GRACE_DAYS = 7
export const LOCK_STALE_MS = 120_000
export const FALLBACK_MSG = "On n'a pas pu attribuer ton numéro tout de suite. On t'attribue ton numéro sous 24 h."

export type TwilioAvailable = { phoneNumber: string; sms?: boolean; voice?: boolean }
export type TwilioBought = { sid: string; phoneNumber: string }
export type TwilioNumbers = {
  listAvailable: (q: { type: "Local" | "National"; sms: boolean }) => Promise<TwilioAvailable[]>
  buy: (q: {
    phoneNumber: string
    voiceUrl: string
    statusCallback: string
    smsUrl: string
    smsStatusCallback: string
    addressSid?: string
    bundleSid?: string
    friendlyName: string
  }) => Promise<TwilioBought>
  release: (sid: string) => Promise<void>
}

export type NotifyFn = (input: { artisanId: string; subject: string; html: string }) => Promise<void>

export type ProvisionOk = { ok: true; phone: string; sid: string; existing?: boolean; pending?: boolean }
export type ProvisionFail = { ok: false; error: string; fallback: true; pending?: boolean; needs_bundle?: boolean }
export type ProvisionResult = ProvisionOk | ProvisionFail

type LiveRow = { phone_number: string; artisan_id: string; twilio_sid?: string | null; status?: string | null; release_after?: string | null; active?: boolean | null }

function liveStatuses() { return ["active", "grace"] }

export function bundlePerArtisan(raw = env("TWILIO_BUNDLE_PER_ARTISAN") || "") {
  return raw.trim() === "1"
}

export function supportEmail() {
  return (env("SUPPORT_EMAIL") || env("VITE_SUPPORT_EMAIL") || env("VITE_LEGAL_EMAIL") || "").trim()
}

export async function notifyKeryan(input: { artisanId: string; subject: string; html: string }, send: NotifyFn | undefined = undefined) {
  if (send) { await send(input); return }
  const to = supportEmail()
  const body = `${input.html}<p style="color:#666;font-size:12px">artisan_id : ${input.artisanId}</p>`
  if (!to) { console.error("[akno-provision]", input.subject, input.artisanId); return }
  const r = await sendResend({ to, subject: input.subject, html: body, company: "Akno" })
  if (!r.ok) console.error("[akno-provision] mail support", r.error)
}

function authHeader(sid: string, token: string) {
  const raw = `${sid}:${token}`
  const b64 = typeof Buffer !== "undefined" ? Buffer.from(raw).toString("base64") : btoa(raw)
  return `Basic ${b64}`
}

/** Client HTTP Twilio (jamais appelé dans les tests, qui injectent un mock). */
export function twilioNumbers(fetchFn: typeof fetch = fetch): TwilioNumbers | null {
  const sid = (env("TWILIO_ACCOUNT_SID") || "").trim()
  const token = (env("TWILIO_AUTH_TOKEN") || "").trim()
  if (!sid || !token) return null
  const base = `https://api.twilio.com/2010-04-01/Accounts/${sid}`
  const headers = { Authorization: authHeader(sid, token), "Content-Type": "application/x-www-form-urlencoded" }
  return {
    async listAvailable(q) {
      const u = new URL(`${base}/AvailablePhoneNumbers/FR/${q.type}.json`)
      u.searchParams.set("VoiceEnabled", "true")
      if (q.sms) u.searchParams.set("SmsEnabled", "true")
      u.searchParams.set("PageSize", "5")
      const r = await fetchFn(u.toString(), { headers: { Authorization: headers.Authorization } })
      const j = await r.json().catch(() => ({})) as { available_phone_numbers?: { phone_number?: string; capabilities?: { voice?: boolean; SMS?: boolean; sms?: boolean } }[]; message?: string }
      if (!r.ok) throw new Error(j.message || `Twilio AvailablePhoneNumbers ${r.status}`)
      return (j.available_phone_numbers || []).map(n => ({
        phoneNumber: String(n.phone_number || ""),
        voice: n.capabilities?.voice !== false,
        sms: !!(n.capabilities?.SMS || n.capabilities?.sms),
      })).filter(n => n.phoneNumber.startsWith("+"))
    },
    async buy(q) {
      const form = new URLSearchParams({
        PhoneNumber: q.phoneNumber,
        VoiceUrl: q.voiceUrl,
        VoiceMethod: "POST",
        StatusCallback: q.statusCallback,
        StatusCallbackMethod: "POST",
        SmsUrl: q.smsUrl,
        SmsMethod: "POST",
        SmsStatusCallback: q.smsStatusCallback,
        FriendlyName: q.friendlyName.slice(0, 64),
      })
      if (q.addressSid) form.set("AddressSid", q.addressSid)
      if (q.bundleSid) form.set("BundleSid", q.bundleSid)
      const r = await fetchFn(`${base}/IncomingPhoneNumbers.json`, { method: "POST", headers, body: form.toString() })
      const j = await r.json().catch(() => ({})) as { sid?: string; phone_number?: string; message?: string; code?: number }
      if (!r.ok || !j.sid) throw new Error(j.message || `Twilio IncomingPhoneNumbers ${r.status}`)
      return { sid: j.sid, phoneNumber: j.phone_number || q.phoneNumber }
    },
    async release(pnSid) {
      const r = await fetchFn(`${base}/IncomingPhoneNumbers/${encodeURIComponent(pnSid)}.json`, { method: "DELETE", headers: { Authorization: headers.Authorization } })
      if (!r.ok && r.status !== 404) {
        const j = await r.json().catch(() => ({})) as { message?: string }
        throw new Error(j.message || `Twilio release ${r.status}`)
      }
    },
  }
}

async function liveNumber(sb: SupabaseClient, artisanId: string): Promise<LiveRow | null> {
  const { data, error } = await sb.from("artisan_phone_numbers").select("phone_number, artisan_id, twilio_sid, status, release_after, active").eq("artisan_id", artisanId).in("status", liveStatuses()).limit(1).maybeSingle()
  if (error) {
    // Migration pas encore appliquée : repli sur active = true
    const r = await sb.from("artisan_phone_numbers").select("phone_number, artisan_id, twilio_sid, active").eq("artisan_id", artisanId).eq("active", true).limit(1).maybeSingle()
    return (r.data as LiveRow | null) || null
  }
  return (data as LiveRow | null) || null
}

async function acquireLock(sb: SupabaseClient, artisanId: string, now: Date): Promise<{ ok: true } | { ok: false; pending?: boolean; existingDone?: boolean; error?: string }> {
  const { data: cur } = await sb.from("phone_provision_locks").select("status, started_at").eq("artisan_id", artisanId).maybeSingle()
  const row = cur as { status?: string; started_at?: string } | null
  if (row?.status === "done") return { ok: false, existingDone: true }
  if (row?.status === "pending") {
    const started = Date.parse(row.started_at || "") || 0
    if (now.getTime() - started < LOCK_STALE_MS) return { ok: false, pending: true }
  }
  if (!row) {
    const { error } = await sb.from("phone_provision_locks").insert({ artisan_id: artisanId, status: "pending", started_at: now.toISOString(), updated_at: now.toISOString() })
    if (!error) return { ok: true }
    // Course : un autre appui vient d'insérer
    const again = await sb.from("phone_provision_locks").select("status, started_at").eq("artisan_id", artisanId).maybeSingle()
    const st = (again.data as { status?: string } | null)?.status
    if (st === "done") return { ok: false, existingDone: true }
    if (st === "pending") return { ok: false, pending: true }
    return { ok: false, error: error.message }
  }
  const { error } = await sb.from("phone_provision_locks").update({ status: "pending", started_at: now.toISOString(), updated_at: now.toISOString(), error: null }).eq("artisan_id", artisanId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

async function pickAndBuy(twilio: TwilioNumbers, hooks: { voiceUrl: string; statusCallback: string; smsUrl: string; smsStatusCallback: string; addressSid?: string; bundleSid?: string; friendlyName: string }): Promise<TwilioBought> {
  const tries: { type: "Local" | "National"; sms: boolean }[] = [
    { type: "Local", sms: true },
    { type: "National", sms: true },
    { type: "Local", sms: false },
    { type: "National", sms: false },
  ]
  let last = "Aucun numéro français disponible."
  for (const t of tries) {
    const found = await twilio.listAvailable(t).catch((e: unknown) => { last = e instanceof Error ? e.message : String(e); return [] as TwilioAvailable[] })
    for (const n of found) {
      try { return await twilio.buy({ phoneNumber: n.phoneNumber, ...hooks }) }
      catch (e) { last = e instanceof Error ? e.message : String(e) }
    }
  }
  throw new Error(last)
}

export async function provisionArtisanNumber(sb: SupabaseClient, artisanId: string, opts: {
  twilio?: TwilioNumbers | null
  notify?: NotifyFn
  now?: Date
  appUrl?: string
  artisanEmail?: string | null
  artisanName?: string | null
  bundleSid?: string
  addressSid?: string
  bundleStatus?: string | null
}): Promise<ProvisionResult> {
  const now = opts.now || new Date()
  const existing = await liveNumber(sb, artisanId)
  if (existing?.phone_number) return { ok: true, phone: existing.phone_number, sid: String(existing.twilio_sid || ""), existing: true }

  if (bundlePerArtisan() && opts.bundleStatus !== "twilio-approved") {
    const waiting = opts.bundleStatus === "pending" || opts.bundleStatus === "in-review"
    return { ok: false, fallback: true, needs_bundle: !waiting, error: waiting ? "Tes justificatifs sont en cours de vérification. On t'écrit dès que le numéro peut être attribué." : "Pour activer ta ligne, dépose d'abord tes justificatifs (KBIS, pièce d'identité, adresse)." }
  }

  const lock = await acquireLock(sb, artisanId, now)
  if (!lock.ok && lock.existingDone) {
    const again = await liveNumber(sb, artisanId)
    if (again?.phone_number) return { ok: true, phone: again.phone_number, sid: String(again.twilio_sid || ""), existing: true }
  }
  if (!lock.ok) {
    if (lock.pending) return { ok: false, fallback: true, pending: true, error: "Attribution de ton numéro en cours…" }
    if (!lock.existingDone) {
      await notifyKeryan({ artisanId, subject: "Akno : numéro Twilio non attribué", html: `<p>Verrou d'attribution indisponible (migration update76 manquante ?).</p><p>${lock.error || ""}</p><p>E-mail artisan : ${opts.artisanEmail || "—"}</p>` }, opts.notify)
    }
    return { ok: false, fallback: true, error: FALLBACK_MSG }
  }

  const twilio = opts.twilio === undefined ? twilioNumbers() : opts.twilio
  const base = (opts.appUrl || appUrl() || "").replace(/\/$/, "")
  const bundleSid = (opts.bundleSid || env("TWILIO_BUNDLE_SID") || "").trim()
  const addressSid = (opts.addressSid || env("TWILIO_ADDRESS_SID") || "").trim()
  if (!twilio || !base || !bundleSid || !addressSid) {
    const why = !twilio ? "Twilio n'est pas configuré (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN)." : !base ? "APP_URL manquante (webhooks)." : "TWILIO_BUNDLE_SID ou TWILIO_ADDRESS_SID manquant."
    await sb.from("phone_provision_locks").update({ status: "failed", updated_at: now.toISOString(), error: why }).eq("artisan_id", artisanId)
    await notifyKeryan({ artisanId, subject: "Akno : numéro Twilio non attribué", html: `<p>Achat automatique impossible.</p><p>${why}</p><p>E-mail artisan : ${opts.artisanEmail || "—"}</p>` }, opts.notify)
    return { ok: false, fallback: true, error: FALLBACK_MSG }
  }

  try {
    const bought = await pickAndBuy(twilio, {
      voiceUrl: `${base}/api/twilio-voice`,
      statusCallback: `${base}/api/twilio-voice?event=status`,
      smsUrl: `${base}/api/twilio?event=sms-in`,
      smsStatusCallback: `${base}/api/twilio?event=sms-status`,
      addressSid, bundleSid,
      friendlyName: `Akno ${opts.artisanName || artisanId.slice(0, 8)}`.slice(0, 64),
    })
    const row = { phone_number: bought.phoneNumber, artisan_id: artisanId, twilio_sid: bought.sid, label: "Ligne Akno", active: true, status: "active", last_error: null, release_after: null, released_at: null }
    const { error } = await sb.from("artisan_phone_numbers").insert(row)
    if (error) {
      try { await twilio.release(bought.sid) } catch { /* on signale quand même */ }
      throw new Error(error.message || "Enregistrement du numéro impossible.")
    }
    await sb.from("artisan_secrets").upsert({ artisan_id: artisanId, twilio_number: bought.phoneNumber }, { onConflict: "artisan_id" })
    await sb.from("phone_provision_locks").update({ status: "done", updated_at: now.toISOString(), error: null }).eq("artisan_id", artisanId)
    return { ok: true, phone: bought.phoneNumber, sid: bought.sid }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await sb.from("phone_provision_locks").update({ status: "failed", updated_at: now.toISOString(), error: msg.slice(0, 300) }).eq("artisan_id", artisanId)
    await notifyKeryan({ artisanId, subject: "Akno : numéro Twilio non attribué", html: `<p>L'achat automatique a échoué.</p><p>${msg}</p><p>E-mail artisan : ${opts.artisanEmail || "—"}</p><p>Attribuer un numéro manuellement sous 24 h.</p>` }, opts.notify)
    await reportError(e, { route: "provision_number", artisanId })
    return { ok: false, fallback: true, error: FALLBACK_MSG }
  }
}

function plusDays(d: Date, n: number) {
  return new Date(d.getTime() + n * 86400000)
}

export async function sweepPhoneNumbers(sb: SupabaseClient, now: Date, opts: {
  twilio?: TwilioNumbers | null
  eligible?: (artisanId: string) => Promise<boolean>
  notify?: NotifyFn
} = {}) {
  const twilio = opts.twilio === undefined ? twilioNumbers() : opts.twilio
  const eligible = opts.eligible || (async (id: string) => {
    try { return can(await loadEntitlements(sb, id), "reception") } catch { return true }
  })
  const { data, error } = await sb.from("artisan_phone_numbers").select("phone_number, artisan_id, twilio_sid, status, release_after, active").in("status", liveStatuses())
  const rows = (error ? (await sb.from("artisan_phone_numbers").select("phone_number, artisan_id, twilio_sid, active").eq("active", true)).data : data) as LiveRow[] | null
  const out = { grace: 0, restored: 0, released: 0, errors: 0 }
  for (const row of rows || []) {
    const id = row.artisan_id
    const keep = await eligible(id)
    const status = row.status || "active"
    if (keep) {
      if (status === "grace") {
        await sb.from("artisan_phone_numbers").update({ status: "active", release_after: null, last_error: null }).eq("phone_number", row.phone_number)
        out.restored++
      }
      continue
    }
    if (status === "active" || !row.release_after) {
      // Début de grâce : 7 jours à partir de maintenant (ou de la date déjà posée)
      const after = row.release_after ? new Date(row.release_after) : plusDays(now, GRACE_DAYS)
      if (after.getTime() > now.getTime()) {
        await sb.from("artisan_phone_numbers").update({ status: "grace", release_after: after.toISOString() }).eq("phone_number", row.phone_number)
        out.grace++
        continue
      }
    }
    const after = row.release_after ? Date.parse(row.release_after) : 0
    if (after && after > now.getTime()) continue
    try {
      if (row.twilio_sid) {
        if (!twilio) throw new Error("Twilio n'est pas configuré pour libérer le numéro.")
        await twilio.release(row.twilio_sid)
      }
      await sb.from("artisan_phone_numbers").update({ status: "released", active: false, released_at: now.toISOString(), last_error: null }).eq("phone_number", row.phone_number)
      const sec = await sb.from("artisan_secrets").select("twilio_number").eq("artisan_id", id).maybeSingle()
      if (String((sec.data as { twilio_number?: string } | null)?.twilio_number || "") === row.phone_number) {
        await sb.from("artisan_secrets").update({ twilio_number: null }).eq("artisan_id", id)
      }
      out.released++
    } catch (e) {
      out.errors++
      const msg = e instanceof Error ? e.message : String(e)
      await sb.from("artisan_phone_numbers").update({ last_error: msg.slice(0, 300) }).eq("phone_number", row.phone_number)
      await notifyKeryan({ artisanId: id, subject: "Akno : libération du numéro Twilio échouée", html: `<p>Numéro ${row.phone_number} (${row.twilio_sid || "sans SID"}).</p><p>${msg}</p>` }, opts.notify)
      await reportError(e, { route: "relances", step: "phones", artisanId: id })
    }
  }
  return out
}

/** Dépôt des justificatifs (derrière TWILIO_BUNDLE_PER_ARTISAN=1). Ne crée pas encore le bundle Twilio réel sans pièces jointes. */
export async function submitRegulatory(sb: SupabaseClient, artisanId: string, input: {
  company?: string; siret?: string; address?: string; city?: string; postal?: string; representative?: string; email?: string
}, notify?: NotifyFn) {
  const company = String(input.company || "").trim().slice(0, 200)
  const siret = String(input.siret || "").replace(/\s/g, "").slice(0, 14)
  const address = String(input.address || "").trim().slice(0, 200)
  const city = String(input.city || "").trim().slice(0, 80)
  const postal = String(input.postal || "").trim().slice(0, 10)
  const representative = String(input.representative || "").trim().slice(0, 120)
  if (!company || !address || !city || !postal || !representative) return { ok: false as const, error: "Renseigne la raison sociale, l'adresse complète et le nom du dirigeant." }
  const payload = { company, siret, address, city, postal, representative, email: String(input.email || "").trim(), submitted_at: new Date().toISOString() }
  const { error } = await sb.from("artisans").update({ twilio_bundle_status: "pending", twilio_regulatory: payload }).eq("id", artisanId)
  if (error) return { ok: false as const, error: "Enregistrement impossible." }
  await notifyKeryan({ artisanId, subject: "Akno : justificatifs ligne à vérifier", html: `<p>Un artisan a déposé ses justificatifs (bundle par artisan).</p><pre>${JSON.stringify(payload, null, 2)}</pre>` }, notify)
  return { ok: true as const, status: "pending" as const }
}
