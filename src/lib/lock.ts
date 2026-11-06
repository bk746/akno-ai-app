/* Verrouillage local de l'app (code à 6 chiffres + Face ID via WebAuthn plateforme).
   Porte locale, pas une authentification serveur : seul un hash PBKDF2 salé est stocké. */
type Rec = { salt: string; hash: string; cred?: string; fails?: number }
const K = (uid: string) => `akno-lock:${uid}`
const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b as ArrayBuffer)))
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0))
export const getLock = (uid: string): Rec | null => { try { return JSON.parse(localStorage.getItem(K(uid)) || "null") } catch { return null } }
const save = (uid: string, r: Rec) => localStorage.setItem(K(uid), JSON.stringify(r))
export const hasLock = (uid: string) => !!getLock(uid)?.hash
export const clearLock = (uid: string) => localStorage.removeItem(K(uid))
async function derive(code: string, salt: Uint8Array) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(code), "PBKDF2", false, ["deriveBits"])
  return b64(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: 100_000 }, key, 256))
}
export async function setCode(uid: string, code: string) { const salt = crypto.getRandomValues(new Uint8Array(16)), prev = getLock(uid); save(uid, { salt: b64(salt), hash: await derive(code, salt), cred: prev?.cred, fails: 0 }) }
/** Renvoie "ok", "bad" ou "locked" (5 échecs). */
export async function checkCode(uid: string, code: string): Promise<"ok" | "bad" | "locked"> {
  const r = getLock(uid); if (!r) return "ok"
  if (await derive(code, unb64(r.salt)) === r.hash) { save(uid, { ...r, fails: 0 }); return "ok" }
  const fails = (r.fails || 0) + 1; save(uid, { ...r, fails }); return fails >= 5 ? "locked" : "bad"
}
export const bioAvailable = async () => { try { return !!window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable() } catch { return false } }

/** rpId = hostname actuel (obligatoire). Le bandeau iOS affiche le domaine, pas rp.name. */
const rpId = () => location.hostname

export async function enableBio(uid: string, email: string) {
  const c = await navigator.credentials.create({ publicKey: { challenge: crypto.getRandomValues(new Uint8Array(32)), rp: { name: "Akno", id: rpId() }, user: { id: new TextEncoder().encode(uid), name: email || "akno", displayName: email || "Akno" }, pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }], authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "preferred" }, timeout: 60000, attestation: "none" } }) as PublicKeyCredential | null
  if (!c) throw new Error("annulé"); const r = getLock(uid); if (r) save(uid, { ...r, cred: b64(c.rawId) })
}
export const disableBio = (uid: string) => { const r = getLock(uid); if (r) save(uid, { ...r, cred: undefined }) }

/** Une seule requête WebAuthn à la fois : évite deux feuilles Face ID / clés d'accès. */
let unlockJob: Promise<boolean> | null = null

export async function unlockBio(uid: string) {
  if (unlockJob) return unlockJob
  unlockJob = doUnlock(uid).finally(() => { unlockJob = null })
  return unlockJob
}

async function doUnlock(uid: string) {
  const r = getLock(uid); if (!r?.cred) return false
  // allowCredentials + transports internal + UV required : Face ID appareil, sans sélecteur de comptes.
  // Pas de mediation: "conditional" (autofill clavier, pas de scan immédiat).
  const a = await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rpId: rpId(),
      allowCredentials: [{ type: "public-key", id: unb64(r.cred) as BufferSource, transports: ["internal"] }],
      userVerification: "required",
      timeout: 60000,
    },
  }) as PublicKeyCredential | null
  const ok = !!a && b64(a.rawId) === r.cred; if (ok) save(uid, { ...r, fails: 0 }); return ok
}

/** NotAllowedError immédiat sans geste → iOS exige un toucher. Un refus après la feuille n'en est pas un. */
export function isMissingGestureError(err: unknown, startedAt: number, fromGesture: boolean) {
  if (fromGesture) return false
  if (!(err instanceof DOMException) || err.name !== "NotAllowedError") return false
  return performance.now() - startedAt < 800
}
