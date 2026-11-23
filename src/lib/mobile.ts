/* update53 · Confort mobile (iOS Safari, PWA, Android).
   1. Zoom bloqué : iOS ignore user-scalable=no depuis iOS 10, on coupe donc le pincement
      (gesture* + touchmove à plusieurs doigts, passive:false) sans toucher au défilement à un doigt.
   2. Clavier virtuel : --kb = hauteur cachée par le clavier (visualViewport), utilisée par les feuilles
      pour remonter au-dessus du clavier ; le champ actif est recentré dans sa zone de défilement. */
import { initPress } from "./press"

export function initMobile() {
  initPress()
  if (typeof window === "undefined" || typeof document === "undefined") return
  const block = (e: Event) => { if (e.cancelable) e.preventDefault() }
  // Safari (iOS / iPadOS) : événements de geste propriétaires
  for (const t of ["gesturestart", "gesturechange", "gestureend"]) document.addEventListener(t, block, { passive: false })
  // Pincement à deux doigts (tous navigateurs tactiles)
  document.addEventListener("touchmove", e => { if (e.touches.length > 1 && e.cancelable) e.preventDefault() }, { passive: false })
  // Zoom résiduel au trackpad / Ctrl+molette sur les PWA de bureau : non concerné (on ne bloque que le tactile)

  const root = document.documentElement
  const FIELD = "input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=button]):not([type=submit]):not([type=file]),textarea,select,[contenteditable=true],[contenteditable='']"
  const DT = "input[type=date],input[type=time],input[type=datetime-local],input[type=month],input[type=week]"
  /* update80 · portrait uniquement : API Screen Orientation, plus une classe CSS de repli. */
  const lockPortrait = () => {
    try { void (screen.orientation as any)?.lock?.("portrait")?.catch?.(() => {}) } catch { /* non supporté */ }
    const coarse = window.matchMedia("(pointer: coarse)").matches
    const land = window.matchMedia("(orientation: landscape)").matches
    const short = Math.min(window.innerWidth, window.innerHeight) < 700
    root.classList.toggle("akno-portrait-only", !!(coarse && land && short))
  }
  lockPortrait()
  addEventListener("orientationchange", lockPortrait)
  window.matchMedia("(orientation: landscape)").addEventListener("change", lockPortrait)

  /* update80 · blur() du champ texte actif avant d'ouvrir un sélecteur date/heure. */
  document.addEventListener("pointerdown", e => {
    const el = e.target as HTMLElement | null
    if (!el || !el.closest || !el.closest(DT)) return
    const a = document.activeElement as HTMLElement | null
    if (a && a !== el && !a.matches(DT) && a.matches(FIELD)) a.blur()
  }, true)

  const vv = window.visualViewport
  if (!vv) return
  /* update69 · Le clavier ne peut être ouvert que si un champ de saisie a le focus. Sur iPhone (surtout en PWA),
     visualViewport reste parfois « rétréci » après la fermeture du clavier (événement manqué ou valeurs figées) :
     --kb gardait ~300 px sans clavier et les feuilles (ModalSheet) restaient remontées et raccourcies, coupées à
     mi-écran. --kb vaut donc 0 sans champ actif, et on re-mesure à chaque prise / perte de focus. */
  const typing = () => { const a = document.activeElement as HTMLElement | null; return !!a && a !== document.body && a.matches(FIELD) }
  let raf = 0, layoutH = 0
  const sync = () => {
    raf = 0
    const typingNow = typing()
    const vvH = Math.round(vv.height), vvTop = Math.round(vv.offsetTop), inner = Math.round(window.innerHeight)
    // update80 · --app-h reste la hauteur hors clavier. Si innerHeight rétrécit déjà, on ne retraduit pas deux fois la feuille.
    if (!typingNow || !layoutH) layoutH = Math.max(inner, vvH + vvTop, layoutH)
    const kbRaw = typingNow ? Math.max(0, layoutH - vvH - vvTop) : 0
    const kb = kbRaw > 80 ? kbRaw : 0
    // < 80 px : barres d'outils Safari qui bougent, pas un clavier
    // update84 · saut important (ouverture/fermeture) : la feuille suit en 280 ms (courbe iOS).
    // petits pas (visualViewport / rAF) : pas de transition, on colle au clavier.
    const prev = parseFloat(root.style.getPropertyValue("--kb") || "0") || 0
    root.classList.toggle("kb-ease", Math.abs(kb - prev) > 60)
    root.style.setProperty("--kb", `${kb}px`)
    root.classList.toggle("kb-open", kb > 0)
    root.style.setProperty("--vvh", `${vvH}px`)
    // update71 + update80 · hauteur de référence stable (conteneur fixed / feuilles)
    root.style.setProperty("--app-h", `${layoutH}px`)
  }
  const onVV = () => { if (!raf) raf = requestAnimationFrame(sync) }
  vv.addEventListener("resize", onVV); vv.addEventListener("scroll", onVV); sync()
  const later = () => { onVV(); setTimeout(onVV, 120); setTimeout(onVV, 400); setTimeout(onVV, 800) }
  document.addEventListener("focusin", later); document.addEventListener("focusout", later)
  addEventListener("resize", onVV); addEventListener("orientationchange", later); addEventListener("pageshow", later)
  document.addEventListener("visibilitychange", () => { if (!document.hidden) later() })

  const coarse = window.matchMedia("(pointer: coarse)")
  document.addEventListener("focusin", e => {
    const el = e.target as HTMLElement | null
    if (!coarse.matches || !el || !el.matches("input:not([type=checkbox]):not([type=radio]):not([type=range]),textarea,select,[contenteditable=true]")) return
    // Attendre l'ouverture du clavier, puis recentrer le champ dans son conteneur défilant (pas de saut si déjà visible)
    setTimeout(() => {
      if (document.activeElement !== el) return
      const r = el.getBoundingClientRect(), bottom = vv.height + vv.offsetTop
      if (r.top < 64 || r.bottom > bottom - 24) el.scrollIntoView({ block: "center", behavior: "smooth" })
    }, 300)
  })
}
