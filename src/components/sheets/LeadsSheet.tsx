import { useCallback, useEffect, useState } from "react"
import { Copy, Globe, Mail, Phone } from "lucide-react"
import { AMBER, Btn, Card, Chip, F, GREEN, GREY, Ic, List, RED, Row, Sheet, inp, tx, useC } from "../ui"
import { supabase } from "../../lib/supabase"
import { useProfile } from "../../lib/profile"

/* update47 · Demandes reçues par le formulaire du site (POST /api/lead). */
type Lead = { id: string; nom: string | null; telephone: string | null; email: string | null; adresse: string | null; code_postal: string | null; ville: string | null; message: string | null; source: string | null; statut: string; notes: string | null; created_at: string }
const ST: [string, string, string][] = [["nouveau", "Nouveau", AMBER], ["contacte", "Contacté", GREY], ["devis", "Devis envoyé", GREY], ["gagne", "Gagné", GREEN], ["perdu", "Perdu", RED]]
const when = (iso: string) => new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })

export function leadSnippet(key: string, origin = location.origin) {
  return `<form action="${origin}/api/lead" method="POST">
  <input type="hidden" name="lead_key" value="${key}">
  <input type="hidden" name="redirect" value="https://VOTRE-SITE.fr/merci">
  <input name="nom" placeholder="Votre nom" required>
  <input name="telephone" type="tel" placeholder="Téléphone" required>
  <input name="email" type="email" placeholder="E-mail">
  <input name="code_postal" placeholder="Code postal">
  <textarea name="message" placeholder="Votre projet"></textarea>
  <input name="website" style="display:none" tabindex="-1" autocomplete="off">
  <label><input type="checkbox" required> J'accepte d'être recontacté au sujet de ma demande.</label>
  <button type="submit">Envoyer</button>
</form>`
}

export default function LeadsSheet({ close }: { close: () => void }) {
  const { toast } = useC()
  const { p } = useProfile()
  const [rows, setRows] = useState<Lead[] | null>(null), [open, setOpen] = useState<Lead | null>(null), [code, setCode] = useState(false), [err, setErr] = useState("")
  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data, error } = await supabase.from("leads").select("*").eq("artisan_id", user.id).order("created_at", { ascending: false }).limit(300)
    if (error) { setErr("Demandes indisponibles : appliquez la migration 04."); setRows([]); return }
    setRows((data || []) as Lead[])
  }, [])
  useEffect(() => { void load(); const t = setInterval(load, 30000); return () => clearInterval(t) }, [load])
  const update = async (l: Lead, patch: Partial<Lead>) => {
    const { error } = await supabase.from("leads").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", l.id)
    if (error) { setErr("Mise à jour impossible."); return }
    setOpen({ ...l, ...patch }); void load()
  }
  const key = String(p?.lead_key || "")
  if (open) { const l = open, st = ST.find(s => s[0] === l.statut) || ST[0]; return <Sheet title={l.nom || "Demande"} sub={<Chip c={st[2]}>{st[1]}</Chip>} c="#FFFFFF" onClose={() => setOpen(null)}>
    <Card className="space-y-2 p-4 text-[14.5px]">
      <div className={tx.cap}>Reçue le {when(l.created_at)}{l.source ? ` · ${l.source}` : ""}</div>
      {l.message && <p className="whitespace-pre-wrap text-white/85">{l.message}</p>}
      {[l.adresse, [l.code_postal, l.ville].filter(Boolean).join(" ")].filter(Boolean).map(x => <div key={x} className="text-white/60">{x}</div>)}
    </Card>
    <div className="mt-3 grid grid-cols-2 gap-2">
      {l.telephone && <a href={`tel:${l.telephone}`} onClick={() => l.statut === "nouveau" && update(l, { statut: "contacte" })} className="flex h-12 items-center justify-center gap-2 rounded-full bg-white/[.08] text-[15px] font-medium"><Phone size={17} />Appeler</a>}
      {l.email && <a href={`mailto:${l.email}`} className="flex h-12 items-center justify-center gap-2 rounded-full bg-white/[.08] text-[15px] font-medium"><Mail size={17} />E-mail</a>}
    </div>
    <div className={`mt-5 px-1 ${tx.cap}`}>Statut</div>
    <div className="mt-2 flex flex-wrap gap-2">{ST.map(([k, lab]) => <button key={k} onClick={() => update(l, { statut: k })} className={`h-9 rounded-full px-4 text-[14px] font-medium ${l.statut === k ? "bg-white text-black" : "bg-white/[.07] text-white/70"}`}>{lab}</button>)}</div>
    <div className="mt-4"><F l="Notes"><textarea className={`${inp} h-28 py-3`} defaultValue={l.notes || ""} onBlur={e => e.target.value !== (l.notes || "") && update(l, { notes: e.target.value })} /></F></div>
    {err && <p className="mt-3 px-1 text-[13px] text-[#FF9B96]">{err}</p>}
  </Sheet> }
  const fresh = (rows || []).filter(r => r.statut === "nouveau").length
  return <Sheet title="Demandes du site" sub={rows ? `${fresh} nouvelle${fresh > 1 ? "s" : ""}` : "Chargement…"} c="#FFFFFF" onClose={close}>
    <List empty="Aucune demande pour l'instant. Branchez le formulaire de votre site ci-dessous." I={Globe}>
      {(rows || []).map((l, i) => { const st = ST.find(s => s[0] === l.statut) || ST[0]; return <Row key={l.id} first={!i} lead={<Ic I={Globe} />} t={l.nom || l.telephone || l.email || "Demande"} s={(l.message || "").slice(0, 60) || when(l.created_at)} rs={<Chip c={st[2]}>{st[1]}</Chip>} onClick={() => setOpen(l)} label="Ouvrir la demande" /> })}
    </List>
    <Card className="mt-4 p-4">
      <div className="text-[15px] font-medium">Brancher le formulaire de votre site</div>
      <div className={`mt-1 ${tx.cap}`}>Collez ce code dans votre site (ou donnez-le à votre webmaster). Chaque demande arrive ici avec une notification.</div>
      {code ? <><textarea readOnly className={`${inp} mt-3 h-56 py-3 font-mono text-[11.5px] leading-snug`} value={leadSnippet(key)} aria-label="Code du formulaire" /><Btn className="mt-2 w-full" onClick={() => { void navigator.clipboard?.writeText(leadSnippet(key)); toast("Code copié") }}><Copy size={16} />Copier le code</Btn></> : <Btn className="mt-3 w-full" disabled={!key} onClick={() => setCode(true)}>{key ? "Afficher le code" : "Appliquez la migration 01 pour obtenir votre clé"}</Btn>}
    </Card>
    {err && <p className="mt-3 px-1 text-[13px] text-[#FF9B96]">{err}</p>}
  </Sheet>
}
