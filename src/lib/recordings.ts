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
  if (!blob || blob.size < 64) return undefined
  const id = Number(callId)
  if (!Number.isFinite(id) || id <= 0) return undefined
  const ext = blob.type.includes("mp4") || blob.type.includes("aac") ? "mp4" : blob.type.includes("ogg") ? "ogg" : "webm"
  const path = `${user.id}/${id}.${ext}`
  const { error } = await supabase.storage.from("recordings").upload(path, blob, {
    contentType: blob.type || (ext === "mp4" ? "audio/mp4" : "audio/webm"),
    upsert: true,
  })
  if (error) return undefined
  const writeUrl = async () => supabase.from("calls").update({ recording_url: path }).eq("id", id).select("id").maybeSingle()
  let { data, error: uErr } = await writeUrl()
  if (uErr || !data) ({ data, error: uErr } = await writeUrl())
  if (uErr || !data) return path
  return path
}
