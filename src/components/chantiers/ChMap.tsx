/* update64 · Carte des chantiers (Leaflet, chargée à la demande avec la page Chantiers).
   Satellite Esri World Imagery ou plan sombre Esri Dark Gray, repères (gros repère casque + nom pour le chantier choisi),
   position de l'utilisateur, appui long → nouveau chantier, vols animés (flyTo) avec décalage pour la carte du bas. */
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react"
import L from "leaflet"
import "leaflet/dist/leaflet.css"

export type MapItem = { id: string; lat: number; lng: number; color: string; label: string }
export type MapLayer = "sat" | "plan"
export type MapApi = {
  flyTo: (lat: number, lng: number, opts?: { zoom?: number; offsetY?: number; instant?: boolean }) => void
  fit: (pts: { lat: number; lng: number }[], pad?: { top: number; bottom: number }) => void
  view: (lat: number, lng: number, zoom: number) => void
  zoom: () => number
}
// Fonds sans clé : Esri World Imagery (satellite) et Esri Dark Gray Canvas (plan sombre + noms des rues).
// (Les fonds CARTO exigent désormais une clé API : non utilisés.)
export const TILES: Record<MapLayer, { url: string; attr: string; max: number; sub?: string; ref?: string }> = {
  sat: { url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", attr: "Esri, Maxar, Earthstar Geographics", max: 19 },
  plan: { url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}", ref: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}", attr: "Esri, HERE, Garmin, © OpenStreetMap", max: 16 },
}
const tileLayer = (t: (typeof TILES)[MapLayer]) => {
  const o = { maxZoom: 20, maxNativeZoom: t.max, subdomains: t.sub || "abc", keepBuffer: 3, updateWhenIdle: false, crossOrigin: true } as L.TileLayerOptions
  const base = L.tileLayer(t.url, o)
  return { base, group: t.ref ? L.layerGroup([base, L.tileLayer(t.ref, { ...o, pane: "overlayPane" })]) : base }
}
const HELMET = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5" /><path d="M14 6a6 6 0 0 1 6 6v3" /><path d="M4 15v-3a6 6 0 0 1 6-6" /><rect x="2" y="15" width="20" height="4" rx="1" fill="#fff" /></svg>`
const esc = (t: string) => t.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!))
const dotIcon = (c: string) => L.divIcon({ className: "ch-pin", iconSize: [22, 22], iconAnchor: [11, 11], html: `<span class="ch-dot" style="background:${c}"></span>` })
const bigIcon = (c: string, label: string) => L.divIcon({ className: "ch-pin", iconSize: [48, 56], iconAnchor: [24, 54], html: `<span class="ch-big" style="--c:${c}"><span class="ch-big-in">${HELMET}</span></span><span class="ch-label">${esc(label)}</span>` })
const pinIcon = (c: string, label: string, on: boolean) => L.divIcon({ className: "ch-pin", iconSize: [40, 52], iconAnchor: [20, 17], html: `<span class="ch-p${on ? " on" : ""}">${HELMET.replace('width="20" height="20"', 'width="17" height="17"').replace(/#fff/g, on ? "#fff" : "#000")}<i style="background:${c}"></i></span><span class="ch-p-l">${esc(label)}</span>` })
const meIcon = () => L.divIcon({ className: "ch-pin", iconSize: [22, 22], iconAnchor: [11, 11], html: `<span class="ch-me"><span class="ch-me-halo"></span></span>` })
const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches

type Props = {
  items: MapItem[]; selected: string | null; layer: MapLayer; me: { lat: number; lng: number; acc?: number } | null
  initial: { lat: number; lng: number; zoom: number }
  onSelect: (id: string) => void; onLongPress?: (lat: number, lng: number) => void; onMoveStart?: () => void
  draft?: { lat: number; lng: number } | null; className?: string
}
const ChMap = forwardRef<MapApi, Props>(function ChMap({ items, selected, layer, me, initial, onSelect, onLongPress, onMoveStart, draft, className = "" }, ref) {
  const el = useRef<HTMLDivElement>(null), map = useRef<L.Map | null>(null), tiles = useRef<L.Layer | null>(null)
  const marks = useRef(new Map<string, { m: L.Marker; key: string }>()), meM = useRef<L.Marker | null>(null), draftM = useRef<L.Marker | null>(null)
  const cb = useRef({ onSelect, onLongPress, onMoveStart }); cb.current = { onSelect, onLongPress, onMoveStart }

  useImperativeHandle(ref, () => ({
    flyTo: (lat, lng, o = {}) => {
      const m = map.current; if (!m) return
      const z = Math.round(o.zoom ?? Math.max(m.getZoom(), 15)) // zooms entiers : tuiles nettes, sans liseré
      const p = m.project([lat, lng], z).add([0, o.offsetY || 0]), c = m.unproject(p, z)
      if (o.instant || reduced()) m.setView(c, z, { animate: false })
      else m.flyTo(c, z, { duration: .85, easeLinearity: .2 })
    },
    fit: (pts, pad = { top: 140, bottom: 260 }) => {
      const m = map.current; if (!m || !pts.length) return
      if (pts.length === 1) { m.setView([pts[0].lat, pts[0].lng], 15, { animate: false }); return }
      m.fitBounds(L.latLngBounds(pts.map(p => [p.lat, p.lng] as [number, number])), { paddingTopLeft: [40, pad.top], paddingBottomRight: [40, pad.bottom], maxZoom: 16, animate: !reduced() })
    },
    view: (lat, lng, zoom) => map.current?.setView([lat, lng], zoom, { animate: false }),
    zoom: () => map.current?.getZoom() ?? 0,
  }), [])

  // création de la carte
  useEffect(() => {
    const m = L.map(el.current!, { zoomControl: false, attributionControl: false, zoomSnap: 1, zoomDelta: 1, wheelPxPerZoomLevel: 90, inertia: true, inertiaDeceleration: 2600, worldCopyJump: true, maxZoom: 20, minZoom: 3, tapHold: false } as L.MapOptions)
    m.setView([initial.lat, initial.lng], initial.zoom)
    map.current = m
    m.on("movestart", () => cb.current.onMoveStart?.())
    // appui long (doigt) / clic droit (souris) → nouveau chantier à cet endroit
    let timer = 0, start: { x: number; y: number } | null = null, fired = 0
    const pointers = new Set<number>()
    const cancel = () => { clearTimeout(timer); start = null }
    const down = (e: PointerEvent) => {
      pointers.add(e.pointerId)
      if (pointers.size > 1 || (e.pointerType === "mouse" && e.button !== 0)) { cancel(); return }
      const t = e.target as HTMLElement
      if (t.closest(".ch-pin")) return
      start = { x: e.clientX, y: e.clientY }
      const ev = { clientX: e.clientX, clientY: e.clientY }
      clearTimeout(timer)
      timer = window.setTimeout(() => { if (!start) return; const ll = m.mouseEventToLatLng(ev as MouseEvent); fired = Date.now(); start = null; navigator.vibrate?.(12); cb.current.onLongPress?.(ll.lat, ll.lng) }, 520)
    }
    const move = (e: PointerEvent) => { if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) cancel() }
    const up = (e: PointerEvent) => { pointers.delete(e.pointerId); cancel() }
    const ctx = (e: MouseEvent) => { e.preventDefault(); if (Date.now() - fired < 900) return; const ll = m.mouseEventToLatLng(e); cb.current.onLongPress?.(ll.lat, ll.lng) }
    const c = el.current!
    c.addEventListener("pointerdown", down); c.addEventListener("pointermove", move); c.addEventListener("pointerup", up); c.addEventListener("pointercancel", up); c.addEventListener("contextmenu", ctx)
    m.on("zoomstart", cancel)
    const ro = new ResizeObserver(() => m.invalidateSize({ animate: false })); ro.observe(c)
    return () => { ro.disconnect(); clearTimeout(timer); c.removeEventListener("pointerdown", down); c.removeEventListener("pointermove", move); c.removeEventListener("pointerup", up); c.removeEventListener("pointercancel", up); c.removeEventListener("contextmenu", ctx); m.remove(); map.current = null; marks.current.clear(); meM.current = null; draftM.current = null; tiles.current = null }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // fond de carte
  useEffect(() => {
    const m = map.current; if (!m) return
    const t = TILES[layer]
    const { base, group: next } = tileLayer(t); next.addTo(m)
    const prev = tiles.current; tiles.current = next
    // update69 : premier affichage — la carte apparaît en fondu une fois ses premières tuiles reçues (plus d'apparition sèche)
    if (!prev) {
      const c = el.current!; c.style.opacity = "0"
      let done = false
      const show = () => { if (done) return; done = true; requestAnimationFrame(() => { c.style.transition = "opacity .45s cubic-bezier(.22,1,.36,1)"; c.style.opacity = "1" }) }
      base.once("load", show); setTimeout(show, 1200)
    }
    if (prev) base.once("load", () => { m.removeLayer(prev) })
    const safety = setTimeout(() => { if (prev && m.hasLayer(prev)) m.removeLayer(prev) }, 1500)
    el.current!.dataset.layer = layer
    return () => clearTimeout(safety)
  }, [layer])

  // repères
  useEffect(() => {
    const m = map.current; if (!m) return
    const seen = new Set<string>()
    for (const it of items) {
      seen.add(it.id)
      const sel = it.id === selected, key = `${sel}|${it.color}|${it.label}`
      const cur = marks.current.get(it.id)
      if (cur) {
        cur.m.setLatLng([it.lat, it.lng])
        if (cur.key !== key) { cur.m.setIcon(pinIcon(it.color, it.label, sel)); cur.m.setZIndexOffset(sel ? 1000 : 0); cur.key = key }
      } else {
        const mk = L.marker([it.lat, it.lng], { icon: pinIcon(it.color, it.label, sel), keyboard: true, title: it.label, zIndexOffset: sel ? 1000 : 0, riseOnHover: false })
        mk.on("click", () => cb.current.onSelect(it.id))
        mk.addTo(m); marks.current.set(it.id, { m: mk, key })
      }
    }
    for (const [id, v] of marks.current) if (!seen.has(id)) { m.removeLayer(v.m); marks.current.delete(id) }
  }, [items, selected])

  // ma position
  useEffect(() => {
    const m = map.current; if (!m) return
    if (!me) { if (meM.current) { m.removeLayer(meM.current); meM.current = null } return }
    if (!meM.current) meM.current = L.marker([me.lat, me.lng], { icon: meIcon(), interactive: false, keyboard: false, zIndexOffset: -100 }).addTo(m)
    else meM.current.setLatLng([me.lat, me.lng])
  }, [me])

  // repère provisoire (appui long)
  useEffect(() => {
    const m = map.current; if (!m) return
    if (!draft) { if (draftM.current) { m.removeLayer(draftM.current); draftM.current = null } return }
    const ic = L.divIcon({ className: "ch-pin", iconSize: [48, 56], iconAnchor: [24, 54], html: `<span class="ch-big ch-drop" style="--c:#fff"><span class="ch-big-in" style="background:#fff">${HELMET.replace(/#fff/g, "#111")}</span></span><span class="ch-label">Nouveau chantier</span>` })
    if (!draftM.current) draftM.current = L.marker([draft.lat, draft.lng], { icon: ic, interactive: false, zIndexOffset: 2000 }).addTo(m)
    else draftM.current.setLatLng([draft.lat, draft.lng])
  }, [draft])

  return <div ref={el} className={`ch-map ${className}`} role="application" aria-label="Carte des chantiers" />
})
export default ChMap

/** Petite carte avec repère déplaçable (formulaire chantier). */
export function PinMap({ lat, lng, onMove, layer = "sat" }: { lat: number; lng: number; onMove: (lat: number, lng: number) => void; layer?: MapLayer }) {
  const el = useRef<HTMLDivElement>(null), map = useRef<L.Map | null>(null), mk = useRef<L.Marker | null>(null), cb = useRef(onMove); cb.current = onMove
  useEffect(() => {
    const t = TILES[layer]
    const m = L.map(el.current!, { zoomControl: false, attributionControl: false, dragging: true, scrollWheelZoom: "center", touchZoom: "center", doubleClickZoom: "center", zoomSnap: 1 } as L.MapOptions).setView([lat, lng], 17)
    tileLayer(t).group.addTo(m)
    const ic = L.divIcon({ className: "ch-pin", iconSize: [48, 56], iconAnchor: [24, 54], html: `<span class="ch-big" style="--c:#FF9F0A"><span class="ch-big-in">${HELMET}</span></span>` })
    mk.current = L.marker([lat, lng], { icon: ic, draggable: true, autoPan: true }).addTo(m)
    mk.current.on("dragend", () => { const p = mk.current!.getLatLng(); cb.current(p.lat, p.lng) })
    m.on("click", e => { mk.current!.setLatLng(e.latlng); cb.current(e.latlng.lat, e.latlng.lng) })
    map.current = m
    const ro = new ResizeObserver(() => m.invalidateSize({ animate: false })); ro.observe(el.current!)
    return () => { ro.disconnect(); m.remove() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const m = map.current, k = mk.current; if (!m || !k) return; const p = k.getLatLng(); if (Math.abs(p.lat - lat) > 1e-7 || Math.abs(p.lng - lng) > 1e-7) { k.setLatLng([lat, lng]); m.setView([lat, lng], Math.max(m.getZoom(), 16), { animate: !reduced() }) } }, [lat, lng])
  return <div ref={el} className="ch-map h-full w-full" aria-label="Position du chantier (déplacez le repère)" />
}
