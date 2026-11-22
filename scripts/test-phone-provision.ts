/* update76 · Achat / libération du numéro Twilio : npm run test:phone-provision
   Mocks uniquement — aucun appel réseau, aucune écriture en base, aucun achat réel. */
import { FALLBACK_MSG, GRACE_DAYS, provisionArtisanNumber, sweepPhoneNumbers, type TwilioNumbers } from "../api/_lib/phoneProvision"

let ok = 0, ko = 0
const T = (name: string, pass: boolean, extra = "") => { pass ? ok++ : ko++; console.log(`${pass ? "✔" : "✘"} ${name}${extra ? " " + extra : ""}`) }

type Row = Record<string, unknown>
function memSb(init: Record<string, Row[]> = {}) {
  const data: Record<string, Row[]> = { artisan_phone_numbers: [], phone_provision_locks: [], artisan_secrets: [], artisans: [], subscriptions: [], ...init }
  const match = (row: Row, k: string, v: unknown) => row[k] === v
  const inMatch = (row: Row, k: string, vals: unknown[]) => vals.includes(row[k])
  function builder(table: string, filters: { eq: [string, unknown][]; in: [string, unknown[]][] } = { eq: [], in: [] }) {
    const rows = () => {
      let list = data[table] || (data[table] = [])
      for (const [k, v] of filters.eq) list = list.filter(r => match(r, k, v))
      for (const [k, v] of filters.in) list = list.filter(r => inMatch(r, k, v))
      return list
    }
    const all = () => data[table] || (data[table] = [])
    const result = () => ({ data: rows(), error: null as { message: string; code?: string } | null })
    const self: any = {
      select() { return self },
      eq(k: string, v: unknown) { return builder(table, { eq: [...filters.eq, [k, v]], in: filters.in }) },
      in(k: string, v: unknown[]) { return builder(table, { eq: filters.eq, in: [...filters.in, [k, v]] }) },
      limit() { return self },
      maybeSingle() { const r = rows(); return Promise.resolve({ data: r[0] || null, error: null }) },
      insert(row: Row | Row[]) {
        const list = Array.isArray(row) ? row : [row]
        for (const r of list) {
          if (table === "phone_provision_locks" && all().some(x => x.artisan_id === r.artisan_id)) {
            return Promise.resolve({ data: null, error: { message: "duplicate", code: "23505" } })
          }
          if (table === "artisan_phone_numbers" && all().some(x => x.artisan_id === r.artisan_id && (x.status === "active" || x.status === "grace"))) {
            return Promise.resolve({ data: null, error: { message: "one live number", code: "23505" } })
          }
          all().push({ ...r })
        }
        return Promise.resolve({ data: list[0], error: null })
      },
      update(patch: Row) {
        return {
          eq(k: string, v: unknown) {
            for (const r of all()) if (match(r, k, v)) Object.assign(r, patch)
            return Promise.resolve({ data: null, error: null })
          },
        }
      },
      upsert(row: Row) {
        const list = all()
        const i = list.findIndex(x => x.artisan_id === row.artisan_id)
        if (i >= 0) Object.assign(list[i], row)
        else list.push({ ...row })
        return Promise.resolve({ data: row, error: null })
      },
      then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) { return Promise.resolve(result()).then(res, rej) },
    }
    return self
  }
  return { from: (t: string) => builder(t), _data: data }
}

function mockTwilio(opts?: { failBuy?: boolean; failList?: boolean; failRelease?: boolean }): TwilioNumbers & { buys: number; releases: string[]; lastBuy?: Record<string, unknown> } {
  const self = {
    buys: 0,
    releases: [] as string[],
    lastBuy: undefined as Record<string, unknown> | undefined,
    async listAvailable(q: { type: "Local" | "National"; sms: boolean }) {
      if (opts?.failList) throw new Error("AvailablePhoneNumbers down")
      if (q.type === "Local" && q.sms) return [] // souvent pas de SMS sur les locaux FR
      if (q.type === "National" && q.sms) return []
      return [{ phoneNumber: q.type === "Local" ? "+33123456789" : "+33973057824", voice: true, sms: false }]
    },
    async buy(q: Record<string, unknown>) {
      self.buys++
      self.lastBuy = q
      if (opts?.failBuy) throw new Error("21649 Regulatory bundle required")
      return { sid: "PNbought1", phoneNumber: String(q.phoneNumber) }
    },
    async release(sid: string) {
      if (opts?.failRelease) throw new Error("release failed")
      self.releases.push(sid)
    },
  }
  return self as TwilioNumbers & { buys: number; releases: string[]; lastBuy?: Record<string, unknown> }
}

const AID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
const base = {
  appUrl: "https://akno-ai-app-v2.vercel.app",
  bundleSid: "BUxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  addressSid: "ADxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  artisanEmail: "artisan@example.com",
  artisanName: "Plomberie Martin",
}

;(async () => {
  // 1) Achat : Voice+SMS d'abord, puis Voice seul, webhooks, enregistrement
  {
    const sb = memSb()
    const tw = mockTwilio()
    const notes: string[] = []
    const r = await provisionArtisanNumber(sb as any, AID, { ...base, twilio: tw, notify: async n => { notes.push(n.subject) } })
    T("achat : succès (local Voice, SMS indisponible)", r.ok && r.phone === "+33123456789" && r.sid === "PNbought1")
    T("achat : un seul achat Twilio", tw.buys === 1)
    T("achat : webhooks voix / SMS vers les routes existantes", !!tw.lastBuy && tw.lastBuy.voiceUrl === "https://akno-ai-app-v2.vercel.app/api/twilio-voice" && tw.lastBuy.statusCallback === "https://akno-ai-app-v2.vercel.app/api/twilio-voice?event=status" && tw.lastBuy.smsUrl === "https://akno-ai-app-v2.vercel.app/api/twilio?event=sms-in" && tw.lastBuy.smsStatusCallback === "https://akno-ai-app-v2.vercel.app/api/twilio?event=sms-status")
    T("achat : bundle et adresse transmis", !!tw.lastBuy && tw.lastBuy.bundleSid === base.bundleSid && tw.lastBuy.addressSid === base.addressSid)
    T("achat : numéro enregistré sur l'artisan", (sb as any)._data.artisan_phone_numbers[0]?.phone_number === "+33123456789" && (sb as any)._data.artisan_secrets[0]?.twilio_number === "+33123456789")
    T("achat : pas de mail de secours", notes.length === 0)
  }

  // 2) Idempotence : second appel, pas de second achat
  {
    const sb = memSb()
    const tw = mockTwilio()
    const a = await provisionArtisanNumber(sb as any, AID, { ...base, twilio: tw })
    const b = await provisionArtisanNumber(sb as any, AID, { ...base, twilio: tw })
    T("idempotent : même numéro rendu", a.ok && b.ok && a.phone === b.phone)
    T("idempotent : existing=true au 2e appel", !!(b.ok && b.existing))
    T("idempotent : un seul achat Twilio", tw.buys === 1)
    T("idempotent : une seule ligne en base", (sb as any)._data.artisan_phone_numbers.length === 1)
  }

  // 3) Double-appui : le 2e part pendant que le 1er tient le verrou
  {
    const sb = memSb()
    let releaseBuy: () => void = () => {}
    const gate = new Promise<void>(r => { releaseBuy = r })
    let buys = 0
    const tw: TwilioNumbers = {
      listAvailable: async () => [{ phoneNumber: "+33911111111", voice: true }],
      buy: async q => { buys++; await gate; return { sid: "PN2", phoneNumber: String(q.phoneNumber) } },
      release: async () => {},
    }
    const p1 = provisionArtisanNumber(sb as any, AID, { ...base, twilio: tw })
    // laisser le 1er prendre le verrou avant le 2e
    await new Promise(r => setTimeout(r, 20))
    const p2 = provisionArtisanNumber(sb as any, AID, { ...base, twilio: tw })
    await new Promise(r => setTimeout(r, 20))
    releaseBuy()
    const [r1, r2] = await Promise.all([p1, p2])
    T("double-appui : un seul achat", buys === 1)
    T("double-appui : le premier réussit", r1.ok && r1.phone === "+33911111111")
    T("double-appui : le second est en cours ou reprend le même numéro", (!r2.ok && r2.pending) || (r2.ok && (r2.phone === "+33911111111" || r2.existing)))
  }

  // 4) Échec Twilio : message de repli, notification, pas de numéro
  {
    const sb = memSb()
    const tw = mockTwilio({ failBuy: true, failList: false })
    // list returns national without sms then buy fails
    const notes: { subject: string; html: string }[] = []
    const r = await provisionArtisanNumber(sb as any, AID, { ...base, twilio: tw, notify: async n => { notes.push(n) } })
    T("échec : ok=false et fallback", !r.ok && r.fallback && r.error === FALLBACK_MSG)
    T("échec : aucun numéro enregistré", (sb as any)._data.artisan_phone_numbers.length === 0)
    T("échec : Keryan est prévenu", notes.length === 1 && notes[0].subject.includes("non attribué") && notes[0].html.includes("21649"))
    T("échec : verrou en failed", (sb as any)._data.phone_provision_locks[0]?.status === "failed")
  }

  // 5) Config manquante (pas de client Twilio)
  {
    const sb = memSb()
    const notes: string[] = []
    const r = await provisionArtisanNumber(sb as any, AID, { ...base, twilio: null, notify: async n => { notes.push(n.subject) } })
    T("sans Twilio : message de repli 24 h", !r.ok && r.error === FALLBACK_MSG)
    T("sans Twilio : notification", notes[0] === "Akno : numéro Twilio non attribué")
  }

  // 6) Libération après 7 jours sans droit
  {
    const sb = memSb()
    const tw = mockTwilio()
    const bought = await provisionArtisanNumber(sb as any, AID, { ...base, twilio: tw })
    T("préalable libération : numéro acheté", !!bought.ok)
    const t0 = new Date("2026-11-22T10:00:00.000Z")
    const first = await sweepPhoneNumbers(sb as any, t0, { twilio: tw, eligible: async () => false })
    T("grâce : posée pour 7 jours, pas encore libéré", first.grace === 1 && first.released === 0 && tw.releases.length === 0)
    T("grâce : statut grace", (sb as any)._data.artisan_phone_numbers[0]?.status === "grace")
    const mid = new Date(t0.getTime() + (GRACE_DAYS - 1) * 86400000)
    const second = await sweepPhoneNumbers(sb as any, mid, { twilio: tw, eligible: async () => false })
    T("grâce : J+6 encore en grâce", second.released === 0 && tw.releases.length === 0)
    const end = new Date(t0.getTime() + GRACE_DAYS * 86400000)
    const third = await sweepPhoneNumbers(sb as any, end, { twilio: tw, eligible: async () => false })
    T("libération : après 7 jours le numéro est rendu", third.released === 1 && tw.releases[0] === "PNbought1")
    T("libération : ligne inactive et secret effacé", (sb as any)._data.artisan_phone_numbers[0]?.active === false && (sb as any)._data.artisan_phone_numbers[0]?.status === "released" && (sb as any)._data.artisan_secrets[0]?.twilio_number == null)
  }

  // 7) Pas de libération si l'essai / l'abo est encore valable
  {
    const sb = memSb()
    const tw = mockTwilio()
    await provisionArtisanNumber(sb as any, AID, { ...base, twilio: tw })
    const r = await sweepPhoneNumbers(sb as any, new Date(), { twilio: tw, eligible: async () => true })
    T("toujours éligible : aucune grâce ni libération", r.grace === 0 && r.released === 0 && tw.releases.length === 0)
    T("toujours éligible : numéro encore actif", (sb as any)._data.artisan_phone_numbers[0]?.status === "active")
  }

  // 8) Re-souscription pendant la grâce : le numéro est conservé
  {
    const sb = memSb()
    const tw = mockTwilio()
    await provisionArtisanNumber(sb as any, AID, { ...base, twilio: tw })
    const t0 = new Date("2026-11-22T10:00:00.000Z")
    await sweepPhoneNumbers(sb as any, t0, { twilio: tw, eligible: async () => false })
    const back = await sweepPhoneNumbers(sb as any, new Date(t0.getTime() + 2 * 86400000), { twilio: tw, eligible: async () => true })
    T("re-souscription : numéro rétabli", back.restored === 1 && tw.releases.length === 0 && (sb as any)._data.artisan_phone_numbers[0]?.status === "active")
  }

  console.log(`\n${ok} ok, ${ko} ko`)
  if (ko) process.exit(1)
})().catch(e => { console.error(e); process.exit(1) })
