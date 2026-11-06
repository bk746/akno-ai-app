import type { SupabaseClient } from "@supabase/supabase-js"
import * as webPushNs from "web-push"
import { adminClient, env } from "./mail.js"

type WebPush = {
  setVapidDetails: (subject: string, publicKey: string, privateKey: string) => void
  sendNotification: (subscription: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: string) => Promise<unknown>
}

const webpush = ((webPushNs as { default?: WebPush }).default || webPushNs) as WebPush

export type PushPayload = {
  title: string
  body: string
  url: string
  tag?: string
  icon?: string
  badge?: number
}

function vapid() {
  const publicKey = (env("VITE_VAPID_PUBLIC_KEY") || env("VAPID_PUBLIC_KEY") || "").trim()
  const privateKey = (env("VAPID_PRIVATE_KEY") || "").trim()
  const subject = (env("VAPID_SUBJECT") || "mailto:aknoweb.contact@gmail.com").trim()
  if (!publicKey || !privateKey) return null
  return { publicKey, privateKey, subject }
}

export async function artisanBadgeCount(sb: SupabaseClient, artisanId: string) {
  const [aval, drafts, calls, replies] = await Promise.all([
    sb.from("devis").select("id", { count: "exact", head: true }).eq("artisan_id", artisanId).eq("statut", "aval"),
    sb.from("devis").select("id", { count: "exact", head: true }).eq("artisan_id", artisanId).eq("statut", "brouillon").not("call_id", "is", null),
    sb.from("calls").select("id", { count: "exact", head: true }).eq("artisan_id", artisanId).eq("statut", "a_rappeler"),
    sb.from("devis").select("id", { count: "exact", head: true }).eq("artisan_id", artisanId).not("reponse_client", "is", null).not("statut", "in", "(val,ref)"),
  ])
  return (aval.count || 0) + (drafts.count || 0) + (calls.count || 0) + (replies.count || 0)
}

export type PushSendResult = { ok: boolean; sent: number; skipped?: boolean; error?: string }

export async function sendPushToArtisan(artisanId: string, payload: PushPayload, extraBadge = 0): Promise<PushSendResult> {
  const keys = vapid()
  if (!keys) return { ok: false, sent: 0, skipped: true, error: "Clés VAPID manquantes sur le serveur (VITE_VAPID_PUBLIC_KEY et VAPID_PRIVATE_KEY)." }
  let sb: SupabaseClient
  try { sb = adminClient() }
  catch { return { ok: false, sent: 0, skipped: true, error: "Configuration Supabase service (SUPABASE_SERVICE_ROLE_KEY) manquante." } }

  const { data } = await sb.from("push_subscriptions").select("id, endpoint, p256dh, auth, keys").or(`artisan_id.eq.${artisanId},user_id.eq.${artisanId}`)
  const subs = data || []
  if (!subs.length) return { ok: false, sent: 0, error: "Aucun appareil inscrit aux notifications. Activez-les dans Réglages (sur iPhone : depuis l'app ajoutée à l'écran d'accueil)." }

  let badge = payload.badge
  if (badge == null) {
    try { badge = (await artisanBadgeCount(sb, artisanId)) + extraBadge } catch { badge = extraBadge || undefined }
  }

  webpush.setVapidDetails(keys.subject, keys.publicKey, keys.privateKey)
  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url,
    tag: payload.tag || "akno",
    icon: payload.icon || "/icons/icon-192.png",
    badge,
  })

  let sent = 0
  let lastError = ""
  for (const row of subs) {
    const rec = row as { id: string; endpoint?: string; p256dh?: string; auth?: string; keys?: { p256dh?: string; auth?: string } }
    const p256dh = rec.p256dh || rec.keys?.p256dh || ""
    const auth = rec.auth || rec.keys?.auth || ""
    if (!rec.endpoint || !p256dh || !auth) {
      lastError = "Abonnement incomplet (clés manquantes). Désactivez puis réactivez les notifications."
      continue
    }
    try {
      await webpush.sendNotification({ endpoint: rec.endpoint, keys: { p256dh, auth } }, body)
      sent++
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode
      if (status === 404 || status === 410) {
        await sb.from("push_subscriptions").delete().eq("endpoint", rec.endpoint)
        lastError = "Abonnement expiré. Réactivez les notifications dans Réglages."
      } else if (status === 401 || status === 403) {
        lastError = "Envoi refusé (clés VAPID ou abonnement invalide). Vérifiez que VITE_VAPID_PUBLIC_KEY et VAPID_PRIVATE_KEY forment bien la même paire."
      } else {
        lastError = `Échec d'envoi${status ? ` (${status})` : ""}.`
      }
    }
  }
  if (!sent) return { ok: false, sent: 0, error: lastError || "La notification n'a pas pu être envoyée." }
  return { ok: true, sent }
}

export function notifyArtisan(artisanId: string, payload: PushPayload, extraBadge = 0) {
  return sendPushToArtisan(artisanId, payload, extraBadge)
}
