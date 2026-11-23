/* update84 · Retour au toucher instantané (scale 0,97) sans highlight webkit. Pas de haptique : le plugin Capacitor n'est pas installé. */
const SEL = "button, [data-press], [data-hit], [data-qa], a[href], [role='button'], [role='tab'], [data-all-devis], [data-all-factures], [data-create-btn], [data-doc-list-back]"

let cur: HTMLElement | null = null

const clear = () => { if (cur) { cur.classList.remove("is-pressed"); cur = null } }

export function initPress() {
  if (typeof document === "undefined") return
  document.addEventListener("pointerdown", e => {
    if (e.button != null && e.button !== 0) return
    const t = e.target as HTMLElement | null
    if (!t) return
    if (t.closest("input, textarea, select, [contenteditable=true]")) return
    const el = t.closest(SEL) as HTMLElement | null
    if (!el || (el as HTMLButtonElement).disabled) return
    if (el.closest("[data-swipe-row]") && !el.closest("[data-swipe-action]")) return
    clear()
    cur = el
    el.classList.add("is-pressed")
  }, { passive: true, capture: true })
  document.addEventListener("pointerup", clear, { passive: true, capture: true })
  document.addEventListener("pointercancel", clear, { passive: true, capture: true })
  document.addEventListener("pointerleave", e => { if (e.target === cur) clear() }, { passive: true, capture: true })
}
