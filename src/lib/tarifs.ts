export type Tarifs = {
  deplacement: number | null
  diagnostic: number | null
  tauxHoraire: number | null
  devisGratuit: boolean | null
  majorationUrgence: number | null
  majorationWeekend: number | null
  zoneKm: number | null
  entretienChaudiere: number | null
}

/** Valeurs de secours, présentées comme indicatives tant que l'artisan n'a rien enregistré. */
export const DEFAULT_TARIFS: Tarifs = {
  deplacement: 49,
  diagnostic: null,
  tauxHoraire: null,
  devisGratuit: true,
  majorationUrgence: 50,
  majorationWeekend: null,
  zoneKm: 30,
  entretienChaudiere: null,
}

const KEYS = Object.keys(DEFAULT_TARIFS) as (keyof Tarifs)[]

function asNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."))
  return Number.isFinite(n) ? n : null
}

function asBool(v: unknown): boolean | null {
  if (v === null || v === undefined || v === "") return null
  if (typeof v === "boolean") return v
  if (v === "true" || v === 1 || v === "1") return true
  if (v === "false" || v === 0 || v === "0") return false
  return null
}

export function mergeTarifs(raw?: Partial<Tarifs> | null): Tarifs {
  const src = raw && typeof raw === "object" ? raw : {}
  return {
    deplacement: asNumber(src.deplacement),
    diagnostic: asNumber(src.diagnostic),
    tauxHoraire: asNumber(src.tauxHoraire),
    devisGratuit: asBool(src.devisGratuit),
    majorationUrgence: asNumber(src.majorationUrgence),
    majorationWeekend: asNumber(src.majorationWeekend),
    zoneKm: asNumber(src.zoneKm),
    entretienChaudiere: asNumber(src.entretienChaudiere),
  }
}

export function tarifsEqual(a?: Partial<Tarifs> | null, b?: Partial<Tarifs> | null) {
  const x = mergeTarifs(a), y = mergeTarifs(b)
  return KEYS.every(k => x[k] === y[k])
}

function euro(n: number) {
  return `${String(n).replace(".", ",")} €`
}

function pct(n: number) {
  return `+${String(n).replace(".", ",")} %`
}

/** Bloc injecté dans les instructions vocales. Ne contient aucun prix de travaux. */
export function formatTarifsForPrompt(raw?: Partial<Tarifs> | null): string {
  const t = mergeTarifs(raw)
  const hint = (set: boolean) => set ? "tarif de l'artisan" : "indicatif, à confirmer par l'artisan"
  const lines: string[] = [
    "TARIFS QUE TU PEUX CITER (frais fixes uniquement — jamais le prix des travaux)",
    `- Frais de déplacement : ${euro(t.deplacement ?? DEFAULT_TARIFS.deplacement!)} (${hint(t.deplacement != null)}).`,
    t.diagnostic != null
      ? `- Frais de diagnostic : ${euro(t.diagnostic)} (tarif de l'artisan).`
      : "- Frais de diagnostic : non communiqué — ne l'invente pas, dis que le diagnostic est établi sur place puis chiffré dans le devis.",
    t.tauxHoraire != null
      ? `- Taux horaire : ${euro(t.tauxHoraire)} de l'heure (tarif de l'artisan, hors pièces et hors travaux).`
      : "- Taux horaire : non communiqué — ne l'invente pas.",
    `- Devis : ${(t.devisGratuit ?? DEFAULT_TARIFS.devisGratuit) ? "gratuit" : "payant"} (${hint(t.devisGratuit != null)}).`,
    `- Majoration urgence : ${pct(t.majorationUrgence ?? DEFAULT_TARIFS.majorationUrgence!)} (${hint(t.majorationUrgence != null)}).`,
    t.majorationWeekend != null
      ? `- Majoration week-end : ${pct(t.majorationWeekend)} (tarif de l'artisan).`
      : "- Majoration week-end : non communiquée — ne l'invente pas.",
    `- Zone d'intervention : ${t.zoneKm ?? DEFAULT_TARIFS.zoneKm} km (${hint(t.zoneKm != null)}).`,
    t.entretienChaudiere != null
      ? `- Entretien chaudière (forfait) : ${euro(t.entretienChaudiere)} (tarif de l'artisan).`
      : "- Entretien chaudière : pas de forfait communiqué — ne l'invente pas ; pour un entretien ou un contrat (catégorie B), propose un devis à valider par l'artisan, sans visite de diagnostic.",
    "Tu peux citer ces frais fixes si on te les demande. Tu ne chiffres jamais les travaux, pièces, main-d'œuvre hors taux horaire indiqué, ni un total d'intervention.",
  ]
  return lines.join("\n")
}

export function tarifsSummary(raw?: Partial<Tarifs> | null): string {
  const t = mergeTarifs(raw)
  const dep = t.deplacement ?? DEFAULT_TARIFS.deplacement!
  const devis = (t.devisGratuit ?? DEFAULT_TARIFS.devisGratuit) ? "devis gratuit" : "devis payant"
  return `${euro(dep)} de déplacement · ${devis}`
}
