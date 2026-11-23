/* update53 · Confort mobile (iOS Safari, PWA, Android).
   1. Zoom bloqué : iOS ignore user-scalable=no depuis iOS 10, on coupe donc le pincement
      (gesture* + touchmove à plusieurs doigts, passive:false) sans toucher au défilement à un doigt.
   2. Clavier virtuel : --kb = hauteur cachée par le clavier (visualViewport), utilisée par les feuilles
      pour s'arrêter au ras du clavier ; le champ actif est amené au plus près dans sa zone de défilement. */
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
  const coarse = window.matchMedia("(pointer: coarse)")
  let raf = 0, layoutH = 0, nativeKb = 0, lastKb = 0, lostAt = 0, easeT = 0, graceT = 0, revealT = 0

  /* fix clavier · champ actif amené AU PLUS PRÈS dans la partie visible de SA zone défilante, et rien d'autre.
     Avant : scrollIntoView({ block: "center" }) faisait aussi défiler le panneau de la feuille (overflow caché) et la page :
     l'en-tête de la feuille sortait de l'écran. Sans zone défilante (page publique), repli sur scrollIntoView « nearest ». */
  const scrollerOf = (el: HTMLElement) => {
    for (let n = el.parentElement; n && n !== document.body && n !== root; n = n.parentElement) {
      const o = getComputedStyle(n).overflowY
      if ((o === "auto" || o === "scroll") && n.scrollHeight > n.clientHeight + 1) return n
    }
    return null
  }
  const visibleBottom = () => Math.min(vv.height + vv.offsetTop, (layoutH || window.innerHeight) - (parseFloat(root.style.getPropertyValue("--kb")) || 0))
  const reveal = () => {
    const el = document.activeElement as HTMLElement | null
    if (!coarse.matches || !el || el === document.body || !el.matches(FIELD) || el.matches(DT)) return
    const r = el.getBoundingClientRect(), vis = visibleBottom(), sc = scrollerOf(el)
    if (!sc) { if (r.top < 64 || r.bottom > vis - 24) el.scrollIntoView({ block: "nearest", behavior: "smooth" }); return }
    // pied fixe de la feuille (boutons) encore affiché : le champ doit rester au-dessus de lui
    const ft = el.closest("[data-sheet-root]")?.querySelector<HTMLElement>("[data-sheet-footer]")
    const ftTop = ft && getComputedStyle(ft).opacity !== "0" && !ft.contains(el) ? ft.getBoundingClientRect().top : Infinity
    const b = sc.getBoundingClientRect(), top = b.top + 12, bottom = Math.min(b.bottom, vis, ftTop) - 16
    const d = r.top < top || r.height > bottom - top ? r.top - top : r.bottom > bottom ? r.bottom - bottom : 0
    if (Math.abs(d) > 1) sc.scrollBy({ top: d, behavior: "smooth" })
  }
  // tout de suite, puis une fois la feuille calée sur le clavier (fin de la transition de 280 ms)
  const revealSoon = () => { clearTimeout(revealT); requestAnimationFrame(reveal); revealT = window.setTimeout(reveal, 330) }

  const sync = () => {
    raf = 0
    const typingNow = typing()
    const vvH = Math.round(vv.height), vvTop = Math.round(vv.offsetTop), inner = Math.round(window.innerHeight)
    // update80 · --app-h reste la hauteur hors clavier. Si innerHeight rétrécit déjà, on ne retraduit pas deux fois la feuille.
    if (!typingNow || !layoutH) layoutH = Math.max(inner, vvH + vvTop, layoutH)
    /* fix clavier · état « clavier ouvert » = hauteur du clavier (mesurée, ou annoncée par le plugin Capacitor Keyboard),
       et plus « bas d'écran recouvert » : quand iOS décalait la page (vvTop), ce recouvrement retombait vers 0, kb-open sautait
       et la barre du bas réapparaissait clavier ouvert. < 80 px : barres d'outils Safari qui bougent, pas un clavier. */
    let open = Math.max(layoutH - vvH, nativeKb) > 80
    if (typingNow) lostAt = 0
    else if (open) {
      // Plus de champ actif mais clavier encore mesuré : passage d'un champ à l'autre, ou mesure figée après fermeture (update69).
      // Court délai avant de conclure à la fermeture : la barre du bas ne clignote pas entre deux champs.
      const now = performance.now()
      if (!lostAt) lostAt = now
      if (now - lostAt < 80 && root.classList.contains("kb-open")) { clearTimeout(graceT); graceT = window.setTimeout(onVV, 90); return }
      open = false
    }
    // --kb = bas de l'écran réellement recouvert (ce que les feuilles compensent, une seule fois)
    const kb = open ? Math.max(0, layoutH - vvH - vvTop, nativeKb) : 0
    if (open) lastKb = Math.max(layoutH - vvH, nativeKb)
    const prev = parseFloat(root.style.getPropertyValue("--kb") || "0") || 0
    if (kb !== prev) {
      // update84 · saut important (ouverture / fermeture) : la feuille suit en 280 ms (courbe iOS) ; petits pas : on colle au clavier.
      // La classe reste posée le temps de la transition (la retirer à la mesure suivante la coupait net : la feuille sautait).
      if (Math.abs(kb - prev) > 60) { root.classList.add("kb-ease"); clearTimeout(easeT); easeT = window.setTimeout(() => root.classList.remove("kb-ease"), 360) }
      root.style.setProperty("--kb", `${kb}px`)
      if (typingNow) revealSoon()
    }
    root.classList.toggle("kb-open", open)
    root.style.setProperty("--vvh", `${vvH}px`)
    // update71 + update80 · hauteur de référence stable (conteneur fixed / feuilles)
    root.style.setProperty("--app-h", `${layoutH}px`)
    // iOS a quand même décalé la page (flèches du clavier, focus natif) alors qu'une feuille est ouverte : on la remet en place,
    // la feuille compense déjà le clavier. Sans effet si la page n'a pas bougé.
    if (open && typingNow && vvTop > 0 && root.classList.contains("sheet-open")) { try { window.scrollTo(0, 0) } catch { /* ignore */ } }
  }
  const onVV = () => { if (!raf) raf = requestAnimationFrame(sync) }
  vv.addEventListener("resize", onVV); vv.addEventListener("scroll", onVV); sync()
  const later = () => { onVV(); setTimeout(onVV, 120); setTimeout(onVV, 400); setTimeout(onVV, 800) }
  document.addEventListener("focusin", later); document.addEventListener("focusout", later)
  addEventListener("resize", onVV); addEventListener("orientationchange", later); addEventListener("pageshow", later)
  document.addEventListener("visibilitychange", () => { if (!document.hidden) later() })
  /* Plugin Capacitor Keyboard (facultatif, resize: "none") : il prévient avant l'animation et donne la hauteur exacte.
     S'il n'est pas installé, ces événements n'existent pas et la mesure visualViewport ci-dessus fait foi. */
  addEventListener("keyboardWillShow", e => { nativeKb = Math.max(0, Math.round(Number((e as Event & { keyboardHeight?: number }).keyboardHeight) || 0)); onVV() })
  for (const t of ["keyboardWillHide", "keyboardDidHide"]) addEventListener(t, () => { nativeKb = 0; onVV() })

  // champ qui prend le focus (tap, flèches du clavier, Entrée) : visible dans sa zone, sans attendre si le clavier est déjà ouvert
  document.addEventListener("focusin", e => { const el = e.target as HTMLElement | null; if (coarse.matches && el?.matches?.(FIELD)) revealSoon() })

  /* fix clavier · tap sur un champ d'une feuille que le clavier va recouvrir : focus SANS le défilement natif d'iOS
     (preventScroll), qui poussait toute la page en plus de la feuille. Le champ est ensuite amené dans la zone visible par
     reveal(). Les champs déjà au-dessus du clavier gardent le focus natif (placement du curseur au doigt). */
  const quietFocus = (f: HTMLElement | null, e: Event) => {
    if (!f || !coarse.matches || document.activeElement === f || !f.matches(FIELD) || f.matches("select," + DT) || f.isContentEditable) return
    if ((f as HTMLInputElement).disabled || (f as HTMLInputElement).readOnly || !f.closest("[data-sheet-root]")) return
    const kbTop = (layoutH || window.innerHeight) - (lastKb || Math.round((layoutH || window.innerHeight) * .45))
    if (f.getBoundingClientRect().bottom <= kbTop - 24) return
    e.preventDefault(); f.focus({ preventScroll: true })
  }
  document.addEventListener("mousedown", e => { if (e.button === 0) quietFocus(((e.target as HTMLElement | null)?.closest?.(FIELD) as HTMLElement | null) || null, e) }, true)
  document.addEventListener("click", e => {
    const t = e.target as HTMLElement | null
    if (!t?.closest || t.closest(FIELD + ",button,a,[role=button],[role=switch]")) return
    const lab = t.closest("label") as HTMLLabelElement | null
    if (lab) quietFocus((lab.control || lab.querySelector(FIELD)) as HTMLElement | null, e)
  }, true)
}
