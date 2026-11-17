/** Chiffres d'un numéro FR, en 0X… */
export function digitsFr(raw?: string | null) {
  let d = String(raw || "").replace(/\D/g, "")
  if (d.startsWith("33") && d.length >= 11) d = "0" + d.slice(2)
  return d
}

/** 0781990761 → « 07 81 99 07 61 » */
export function formatPhonePairs(raw?: string | null) {
  const d = digitsFr(raw)
  if (!d) return ""
  return (d.match(/.{1,2}/g) || [d]).join(" ")
}

export function hasEmergencyPhone(raw?: string | null) {
  return digitsFr(raw).length >= 10
}

/** update45 · formatage pendant la saisie : 0612345678 → « 06 12 34 56 78 », +33612345678 → « +33 6 12 34 56 78 » */
export function fmtTel(v: string) {
  const plus = v.trim().startsWith("+"), d = v.replace(/\D/g, "")
  if (plus) { if (!d.startsWith("33")) return "+" + d.slice(0, 15); const r = d.slice(2, 11); return ("+33 " + r.slice(0, 1) + " " + (r.slice(1).match(/.{1,2}/g) || []).join(" ")).trim() }
  return (d.slice(0, 10).match(/.{1,2}/g) || []).join(" ")
}
