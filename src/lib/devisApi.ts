import { supabase } from "./supabase"

type ApiBody = Record<string, unknown>

async function postDevis(body: ApiBody): Promise<{ ok: boolean; status: number; download?: boolean; error?: string } & ApiBody> {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) return { ok: false, status: 401, error: "Non authentifié." }
  const res = await fetch("/api/devis", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const payload = await res.json().catch(() => ({})) as ApiBody
  const error = typeof payload.error === "string" ? payload.error : undefined
  return { ...payload, ok: res.ok && payload.ok !== false, status: res.status, download: payload.download === true, error }
}

export function draftDevisFromCall(callId: string | number) {
  return postDevis({ action: "draft", call_id: Number(callId) })
}

export function sendDevisEmail(input: { devisId: string; pdfBase64: string; filename: string; email?: string }) {
  return postDevis({
    action: "send",
    devis_id: input.devisId,
    pdf_base64: input.pdfBase64,
    filename: input.filename,
    email: input.email,
  })
}
