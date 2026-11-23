/** Réservation idempotente : éviter « créneau pris » quand Cal.com a déjà accepté la même demande. */
export function isDuplicateCalBooking(status: number, msg: string) {
  return status === 409 || /already ha(s|ve) (a )?booking|duplicate booking|booking already exists/i.test(msg)
}

export function slotKey(date?: string, heure?: string) {
  const d = (date || "").trim()
  const h = (heure || "").trim().toLowerCase().replace("h", ":")
  return `${d}|${h}`
}