import { supabase } from "./supabase"

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string) || ""
const SUPABASE_ANON = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || ""

export async function signedRecordingUrl(path?: string | null) {
  if (!path) return undefined
  if (/^https?:\/\//i.test(path)) return path
  for (let i = 0; i < 2; i++) {
    const { data, error } = await supabase.storage.from("recordings").createSignedUrl(path, 60 * 60)
    if (data?.signedUrl) return data.signedUrl
    if (error) console.error("[akno-rec] signed url", path, error.message)
  }
  return undefined
}

async function writeRecordingUrl(id: number, path: string) {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  const delays = [0, 250, 800, 2000]
  for (const wait of delays) {
    if (wait) await new Promise(r => setTimeout(r, wait))
    try {
      if (token && SUPABASE_URL && SUPABASE_ANON) {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/calls?id=eq.${id}`, {
          method: "PATCH",
          headers: {
            apikey: SUPABASE_ANON,
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          },
          body: JSON.stringify({ recording_url: path }),
          keepalive: true,
        })
        if (res.ok || res.status === 204) return true
        console.error("[akno-rec] url patch", res.status, await res.text().catch(() => ""))
      }
      const { error } = await supabase.from("calls").update({ recording_url: path }).eq("id", id)
      if (!error) {
        const { data } = await supabase.from("calls").select("recording_url").eq("id", id).maybeSingle()
        if (data?.recording_url === path) return true
      } else {
        console.error("[akno-rec] url update", error.message)
      }
    } catch (err) {
      console.error("[akno-rec] url write", err)
    }
  }
  return false
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
  if (error) {
    console.error("[akno-rec] upload", error.message)
    return undefined
  }
  const wrote = await writeRecordingUrl(id, path)
  if (!wrote) console.error("[akno-rec] recording uploaded but recording_url was not saved", id, path)
  return path
}
