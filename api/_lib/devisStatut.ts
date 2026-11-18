/* update52 · Statuts de devis : l'app écrit aval / att / env / val / ref / sans_reponse.
   Tant que la migration 20261118_07 n'est pas appliquée, la base n'accepte que brouillon / envoye / accepte / refuse :
   on lit les deux, et on réessaie avec l'ancienne valeur si la contrainte refuse la nouvelle (code 23514). */
const LEGACY: Record<string, string> = { env: "envoye", sans_reponse: "envoye", val: "accepte", ref: "refuse", aval: "brouillon", att: "brouillon" }
export function normStatut(st: unknown): string {
  const s = String(st || "")
  if (s === "envoye" || s === "envoyé") return "env"
  if (s === "accepte" || s === "accepté") return "val"
  if (s === "refuse" || s === "refusé") return "ref"
  return s
}
type Res = { error: { code?: string } | null }
/** Exécute une écriture avec le statut voulu, puis avec l'ancienne valeur si la contrainte d'origine la refuse. */
export async function withStatut<T extends Res>(statut: string, run: (s: string) => PromiseLike<T>): Promise<T> {
  const r = await run(statut)
  if (r.error?.code === "23514" && LEGACY[statut] && LEGACY[statut] !== statut) return run(LEGACY[statut])
  return r
}
