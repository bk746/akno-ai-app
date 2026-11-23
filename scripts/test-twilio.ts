/* update56 · Tests de la ligne téléphonique IA : npm run test:twilio (aucun appel réseau, aucune écriture en base) */
import { createHmac } from "node:crypto"
import { verifyTwilioSignature } from "../api/_lib/sms"
import { bridgeArtisan, bridgeStreamUrl, connectStreamTwiml, dialNumberTwiml, sayHangup, signBridgeToken, verifyBridgeToken } from "../api/_lib/twilioVoice"
import { signToken as bridgeSign, verifyToken as bridgeVerify } from "../voice-bridge/src/token"
import { POST } from "../api/twilio-voice"

// Valeurs de test uniquement (on écrase les vraies variables éventuelles de la machine).
process.env.TWILIO_AUTH_TOKEN = "test-auth-token"
process.env.BRIDGE_SECRET = "test-bridge-secret"
process.env.APP_URL = "https://akno-ai-app-v2.vercel.app"
delete process.env.SUPABASE_SERVICE_ROLE_KEY
delete process.env.SUPABASE_URL
delete process.env.VITE_SUPABASE_URL

let ok = 0, ko = 0
const T = (name: string, pass: boolean) => { pass ? ok++ : ko++; console.log(`${pass ? "✔" : "✘"} ${name}`) }
const twilioSig = (url: string, p: Record<string, string>) => createHmac("sha1", "test-auth-token").update(url + Object.keys(p).sort().map(k => k + p[k]).join("")).digest("base64")

const url = "https://akno-ai-app-v2.vercel.app/api/twilio-voice"
const params = { CallSid: "CA0123456789abcdef", From: "+33612345678", To: "+33973057824", CallStatus: "ringing", AccountSid: "ACtest" }

;(async () => {
  // 1) Signature Twilio
  const sig = twilioSig(url, params)
  T("signature Twilio valide acceptée", await verifyTwilioSignature(url, params, sig))
  T("paramètre modifié refusé", !await verifyTwilioSignature(url, { ...params, From: "+33600000000" }, sig))
  T("URL différente refusée", !await verifyTwilioSignature(url + "?event=status", params, sig))
  T("signature vide refusée", !await verifyTwilioSignature(url, params, ""))

  // 2) TwiML
  const tw = connectStreamTwiml("wss://bridge.example/twilio", { artisan_id: "a-1", call_sid: "CA1", from: "+33612345678", exp: "99", token: "t&<\"" })
  T("TwiML Connect/Stream vers le relais", /^<\?xml[^>]+\?><Response><Connect><Stream url="wss:\/\/bridge\.example\/twilio">/.test(tw) && tw.endsWith("</Stream></Connect></Response>"))
  T("paramètres artisan_id / call_sid / from transmis", /<Parameter name="artisan_id" value="a-1"\/>/.test(tw) && /name="call_sid" value="CA1"/.test(tw) && /name="from" value="\+33612345678"/.test(tw))
  T("valeurs échappées (XML sûr)", tw.includes('value="t&amp;&lt;&quot;"'))
  const h = sayHangup("Bonjour, l'assistante n'est pas disponible.")
  T("hors forfait : message vocal fr-FR puis raccroche", /<Say language="fr-FR" voice="Google\.fr-FR-Chirp3-HD-Aoede"[^>]*>Bonjour, l&#39;assistante n&#39;est pas disponible\.<\/Say><Hangup\/><\/Response>$/.test(h))
  T("VOICE_BRIDGE_URL https → wss…/twilio", bridgeStreamUrl("https://akno-voice-bridge.fly.dev/") === "wss://akno-voice-bridge.fly.dev/twilio")
  T("VOICE_BRIDGE_URL déjà wss…/twilio inchangée", bridgeStreamUrl("wss://x.fly.dev/twilio") === "wss://x.fly.dev/twilio")
  T("VOICE_BRIDGE_URL vide → désactivé", bridgeStreamUrl("") === "")
  const dial = dialNumberTwiml("+33600000000", { callerId: "+33973057824", action: "https://akno.example/api/twilio-voice?event=dial-off", timeout: 25 })
  T("Dial vers le portable (IA coupée), sans relais IA", /<Dial timeout="25" answerOnBridge="true" callerId="\+33973057824" action="https:\/\/akno\.example\/api\/twilio-voice\?event=dial-off"><Number>\+33600000000<\/Number><\/Dial>/.test(dial) && !dial.includes("Stream") && !dial.includes("Connect"))

  // 3) Jeton webhook → relais (même algorithme des deux côtés)
  const exp = Math.floor(Date.now() / 1000) + 120
  const tok = await signBridgeToken("s3cret", "11111111-2222-3333-4444-555555555555", "CA1", exp)
  T("jeton identique côté Vercel et côté relais", tok === bridgeSign("s3cret", "11111111-2222-3333-4444-555555555555", "CA1", exp))
  T("jeton valide accepté (Vercel)", await verifyBridgeToken("s3cret", "11111111-2222-3333-4444-555555555555", "CA1", exp, tok))
  T("jeton valide accepté (relais)", bridgeVerify("s3cret", { artisan_id: "11111111-2222-3333-4444-555555555555", call_sid: "CA1", exp: String(exp), token: tok }))
  T("jeton pour un autre appel refusé", !bridgeVerify("s3cret", { artisan_id: "11111111-2222-3333-4444-555555555555", call_sid: "CA2", exp: String(exp), token: tok }))
  T("jeton expiré refusé", !await verifyBridgeToken("s3cret", "x", "CA1", 1000, await signBridgeToken("s3cret", "x", "CA1", 1000)))

  // 4) Auth serveur relais → /api/booking et /api/notify
  const A = "11111111-2222-3333-4444-555555555555"
  T("x-akno-bridge correct → artisan", bridgeArtisan({ "x-akno-bridge": "test-bridge-secret", "x-akno-artisan": A }) === A)
  T("x-akno-bridge faux → refusé", bridgeArtisan({ "x-akno-bridge": "nope", "x-akno-artisan": A }) === null)
  T("sans en-tête → refusé (auth utilisateur normale)", bridgeArtisan({ authorization: "Bearer x" }) === null)

  // 5) Webhook /api/twilio-voice (sans base : aucune écriture)
  const req = (s: string, p = params, q = "") => new Request(url + q, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "x-twilio-signature": s }, body: new URLSearchParams(p).toString() })
  const r403 = await POST(req("faux"))
  T("webhook : signature invalide → 403", r403.status === 403)
  const rErr = await POST(req(sig))
  const body = await rErr.text()
  T("webhook : erreur serveur → TwiML poli + raccroche", rErr.status === 200 && /<Say[^>]*>Une erreur est survenue/.test(body) && body.includes("<Hangup/>"))
  const stParams = { ...params, CallStatus: "completed", CallDuration: "42" }
  const rSt = await POST(req(twilioSig(url + "?event=status", stParams), stParams, "?event=status"))
  T("statut : signature sur l'URL ?event=status vérifiée", rSt.status !== 403)

  console.log(`\n${ok} OK, ${ko} KO`)
  if (ko) process.exit(1)
})()
