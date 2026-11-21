/* update67 · Jetons de mouvement uniques de l'app (ressorts façon iOS, sans dépassement sauf mention).
   Tous les écrans importent ces valeurs : mêmes courbes partout (pages, push, feuilles, sélecteurs). */
import { createElement, lazy, type ComponentType } from "react"

/** Push iOS (fiche, Réglages) : amorti critique, ~0,45 s. */
export const PUSH = { type: "spring" as const, stiffness: 420, damping: 42, mass: .9 }
/** Changement d'onglet : glissement court + fondu. */
export const TAB = { type: "spring" as const, stiffness: 520, damping: 48, mass: .8 }
/** Montée d'une feuille modale : très léger rebond. */
export const SHEET = { type: "spring" as const, stiffness: 400, damping: 36, mass: .9 }
/** Petits éléments (pilules, sélecteurs, tuiles). */
export const SNAP = { type: "spring" as const, stiffness: 560, damping: 42, mass: .7 }
export const EASE_OUT = [.22, 1, .36, 1] as const
export const EASE_IN = [.4, 0, 1, 1] as const
export const FADE = { duration: .2, ease: EASE_OUT }

/** Page chargée à part, préchargeable : une fois le morceau reçu, le rendu est synchrone (aucun écran de chargement). */
export function lazyPage<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  let C: T | null = null, p: Promise<void> | null = null
  const preload = () => p ??= load().then(m => { C = m.default }, e => { p = null; throw e })
  const L = lazy(() => preload().then(() => ({ default: C as T })))
  const Comp = (props: any) => createElement((C || L) as any, props)
  return Object.assign(Comp, { preload, ready: () => !!C })
}

/** Exécute f quand le navigateur est au repos (repli : 600 ms). */
export const idle = (f: () => void, timeout = 2500) => {
  const w = window as any
  if (typeof w.requestIdleCallback === "function") w.requestIdleCallback(f, { timeout }); else setTimeout(f, 600)
}
