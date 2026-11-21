/* update64 · Adresses (api-adresse.data.gouv.fr, gratuit, sans clé, appelé depuis l'appareil) + itinéraires. */
export type Place = { label: string; lat: number; lng: number; city?: string }
const BASE = "https://api-adresse.data.gouv.fr"
export async function searchAddress(q: string, signal?: AbortSignal, near?: { lat: number; lng: number }): Promise<Place[]> {
  const t = q.trim()
  if (t.length < 3) return []
  const u = `${BASE}/search/?q=${encodeURIComponent(t)}&limit=5&autocomplete=1${near ? `&lat=${near.lat}&lon=${near.lng}` : ""}`
  const r = await fetch(u, { signal })
  if (!r.ok) return []
  const j = await r.json()
  return (j.features || []).map((f: any) => ({ label: f.properties?.label || "", city: f.properties?.city, lng: f.geometry?.coordinates?.[0], lat: f.geometry?.coordinates?.[1] })).filter((p: Place) => p.label && Number.isFinite(p.lat) && Number.isFinite(p.lng))
}
export async function reverseAddress(lat: number, lng: number, signal?: AbortSignal): Promise<string> {
  try {
    const r = await fetch(`${BASE}/reverse/?lat=${lat}&lon=${lng}&limit=1`, { signal })
    if (!r.ok) return ""
    const j = await r.json()
    return j.features?.[0]?.properties?.label || ""
  } catch { return "" }
}
export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
/** Itinéraire : Plans (Apple) sur iPhone/iPad, Google Maps ailleurs. */
export function itineraryUrl(p: { lat?: number | null; lng?: number | null; address?: string | null }) {
  const dest = p.lat != null && p.lng != null ? `${p.lat},${p.lng}` : p.address || ""
  return isIOS() ? `https://maps.apple.com/?daddr=${encodeURIComponent(dest)}&dirflg=d` : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`
}
export const FRANCE = { lat: 46.6, lng: 2.45, zoom: 5 }
