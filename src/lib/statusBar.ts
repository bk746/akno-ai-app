/* update76 · Barre d'état iOS/Android : le contenu peint sous l'heure (overlay),
   les boutons restent sous la safe area. Ton : "light" = icônes claires (fond sombre),
   "dark" = icônes sombres (fond clair). */
import { Capacitor } from "@capacitor/core"

export type StatusBarTone = "light" | "dark"

const BG: Record<StatusBarTone, string> = { light: "#000000", dark: "#F6F6F8" }

export function applyThemeColor(tone: StatusBarTone) {
  if (typeof document === "undefined") return
  const color = BG[tone]
  let m = document.querySelector('meta[name="theme-color"]')
  if (!m) { m = document.createElement("meta"); m.setAttribute("name", "theme-color"); document.head.appendChild(m) }
  m.setAttribute("content", color)
  document.documentElement.style.backgroundColor = color
  document.documentElement.dataset.statusTone = tone
}

export async function applyStatusBar(tone: StatusBarTone = "light") {
  applyThemeColor(tone)
  if (!Capacitor.isNativePlatform()) return
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar")
    await StatusBar.setOverlaysWebView({ overlay: true })
    await StatusBar.setStyle({ style: tone === "light" ? Style.Light : Style.Dark })
    try { await StatusBar.setBackgroundColor({ color: "#00000000" }) } catch { /* iOS ignore */ }
  } catch { /* plugin absent */ }
}
