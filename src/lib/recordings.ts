import { supabase } from "./supabase"

export async function signedRecordingUrl(path?: string | null) {
  if (!path) return undefined
  if (/^https?:\/\//i.test(path)) return path
  const { data } = await supabase.storage.from("recordings").createSignedUrl(path, 60 * 60)
  return data?.signedUrl || undefined
}

export async function uploadCallRecording(callId: string | number, blob: Blob) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return undefined
  const ext = blob.type.includes("mp4") ? "mp4" : blob.type.includes("ogg") ? "ogg" : "webm"
  const path = `${user.id}/${callId}.${ext}`
  const { error } = await supabase.storage.from("recordings").upload(path, blob, {
    contentType: blob.type || "audio/webm",
    upsert: true,
  })
  if (error) return undefined
  await supabase.from("calls").update({ recording_url: path }).eq("id", Number(callId))
  return path
}
