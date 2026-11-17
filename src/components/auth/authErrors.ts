/* update45 · Messages d'erreur Supabase Auth traduits en français clair.
   L'erreur brute part toujours dans la console pour le diagnostic. */
export type AuthCtx = "login" | "signup" | "forgot" | "reset" | "resend"

type AnyErr = { code?: string; message?: string; status?: number; name?: string } | null | undefined

export function authErrorFr(err: unknown, ctx: AuthCtx): string {
  console.error(`[Akno auth · ${ctx}]`, err)
  const e = (err || {}) as NonNullable<AnyErr>
  const code = String(e.code || ""), msg = String(e.message || ""), st = Number(e.status || 0)
  const is = (...c: string[]) => c.includes(code)

  // Réseau : fetch impossible, hors ligne, CORS, délai dépassé
  if (e.name === "AuthRetryableFetchError" || e.name === "TypeError" || (st === 0 && /fetch|network|load failed|timeout/i.test(msg)) || (typeof navigator !== "undefined" && navigator.onLine === false))
    return "Connexion au serveur impossible. Vérifiez votre réseau, puis réessayez."
  if (is("signup_disabled", "email_provider_disabled") || /signups? not allowed/i.test(msg))
    return "Les inscriptions sont momentanément fermées. Réessayez plus tard ou contactez-nous."
  if (is("user_already_exists", "email_exists", "identity_already_exists") || /already (been )?registered|already exists/i.test(msg))
    return "Un compte existe déjà avec cet e-mail. Connectez-vous ou réinitialisez votre mot de passe."
  if (is("weak_password") || /password should|weak password/i.test(msg))
    return "Mot de passe trop faible. Utilisez au moins 8 caractères, avec des lettres et des chiffres."
  if (is("same_password")) return "Choisissez un mot de passe différent de l'ancien."
  if (is("email_address_invalid") || /invalid.*email|email.*invalid|unable to validate email/i.test(msg))
    return "Cette adresse e-mail n'est pas valide. Vérifiez-la, puis réessayez."
  if (is("email_address_not_authorized"))
    return "Nous ne pouvons pas envoyer d'e-mail à cette adresse pour l'instant. Contactez-nous pour activer votre compte."
  if (is("over_email_send_rate_limit") || /email rate limit/i.test(msg))
    return "Trop d'e-mails envoyés en peu de temps. Patientez quelques minutes avant de réessayer."
  if (is("over_request_rate_limit") || st === 429)
    return "Trop de tentatives. Patientez une minute, puis réessayez."
  if (is("invalid_credentials") || /invalid login credentials/i.test(msg))
    return "E-mail ou mot de passe incorrect."
  if (is("email_not_confirmed") || /email not confirmed/i.test(msg))
    return "Votre e-mail n'est pas encore confirmé. Ouvrez le lien reçu par e-mail pour activer votre espace."
  if (is("user_banned")) return "Ce compte est suspendu. Contactez-nous."
  if (is("captcha_failed")) return "Vérification anti-robot échouée. Rechargez la page et réessayez."
  if (is("session_not_found", "session_expired", "otp_expired", "flow_state_expired"))
    return "Ce lien a expiré. Demandez un nouveau lien de réinitialisation."
  if (/sending confirmation|error sending|smtp/i.test(msg))
    return "L'e-mail de confirmation n'a pas pu être envoyé. Réessayez dans quelques minutes ou contactez-nous."
  if (/database error/i.test(msg))
    return "La création de votre espace a échoué de notre côté. Réessayez dans un instant ou contactez-nous."
  return ctx === "login" ? "Connexion impossible pour le moment. Réessayez."
    : ctx === "signup" ? "Inscription impossible pour le moment. Réessayez dans un instant."
    : ctx === "reset" ? "Impossible d'enregistrer ce mot de passe. Réessayez."
    : "Impossible d'envoyer l'e-mail. Réessayez."
}
