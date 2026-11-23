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
