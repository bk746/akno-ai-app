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
