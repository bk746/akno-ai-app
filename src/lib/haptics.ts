/* Retour haptique (app native uniquement, plugin Capacitor Haptics). Sur le web et en PWA : aucun effet.
   Le plugin est chargé à la demande ; s'il manque dans un ancien build natif, l'appel est simplement ignoré. */
import { isRealNative } from "./native"

/** Confirmation légère (devis / facture créés) : notification « success ». */
export async function hapticSuccess() {
  if (!isRealNative) return
  try {
    const { Haptics, NotificationType } = await import("@capacitor/haptics")
    await Haptics.notification({ type: NotificationType.Success })
  } catch { /* plugin absent ou retour haptique coupé */ }
}

/** Refonte iOS · retour léger au toucher (onglet, segment, bouton capsule). Natif : Haptics ; web : navigator.vibrate en repli
 *  (ignoré sur iOS Safari). Respecte « réduire les animations » côté web (pas de vibration). */
export async function hapticTap(kind: "light" | "select" = "light") {
  if (isRealNative) {
    try {
      const { Haptics, ImpactStyle } = await import("@capacitor/haptics")
      if (kind === "select") await Haptics.selectionChanged(); else await Haptics.impact({ style: ImpactStyle.Light })
    } catch { /* plugin absent */ }
    return
  }
  try { if (!matchMedia("(prefers-reduced-motion: reduce)").matches) navigator.vibrate?.(kind === "select" ? 6 : 10) } catch { /* */ }
}
