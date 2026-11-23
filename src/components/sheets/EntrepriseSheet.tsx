import { useEffect, useRef, useState } from "react"
import { AnimatePresence } from "motion/react"
import { Building2, ImageIcon, Search } from "lucide-react"
import { Btn, F, Sheet, Tg, inp, tx, useC } from "../ui"
import { useProfile } from "../../lib/profile"
import { api } from "../../lib/accountApi"
import { supabase } from "../../lib/supabase"
import { CO, missingLegal } from "../../lib/devisDoc"
import PhotoCropper from "../photo/PhotoCropper"

/* update44 · Écran « Entreprise » : toutes les mentions légales des devis et factures. */
const FIELDS = ["entreprise_nom", "entreprise_forme", "entreprise_capital", "entreprise_adresse", "entreprise_cp_ville", "entreprise_telephone", "entreprise_email", "entreprise_siret", "entreprise_tva", "entreprise_rcs_rm", "entreprise_ape", "entreprise_mediateur", "assurance_nom", "assurance_numero", "assurance_zone", "assurance_adresse", "iban", "avis_url"] as const
// update61 : virement (BIC), TVA sur les débits, personnalisation des documents (couleur, pied de page)
const EXTRA = ["bic", "devis_couleur", "devis_pied"] as const
const COLORS = ["#0E8F8F", "#2F6BFF", "#14141A", "#C2410C", "#15803D", "#7C3AED", "#B91C1C", "#A16207"]
type Form = Record<(typeof FIELDS)[number] | (typeof EXTRA)[number], string> & { entreprise_ei: boolean; tva_non_applicable: boolean; tva_sur_debits: boolean; delai_paiement_jours: string }

export default function EntrepriseSheet({ close }: { close: () => void }) {
  const { toast } = useC()
  const { p, save } = useProfile()
  const [f, setF] = useState<Form | null>(null)
  const [busy, setBusy] = useState(false), [look, setLook] = useState(false), [err, setErr] = useState(""), [logoBusy, setLogoBusy] = useState(false)
  const [crop, setCrop] = useState<File | null>(null), [logoTick, setLogoTick] = useState(0)
  const logoIn = useRef<HTMLInputElement>(null)
  useEffect(() => { const f = () => setLogoTick(x => x + 1); addEventListener("akno-logo", f); return () => removeEventListener("akno-logo", f) }, [])
  useEffect(() => {
    if (!crop) return
    const f = (e: KeyboardEvent) => { if (e.key !== "Escape") return; e.stopImmediatePropagation(); setCrop(null) }
    addEventListener("keydown", f, true); return () => removeEventListener("keydown", f, true)
  }, [crop])
  useEffect(() => {
    if (!p || f) return
    const o = Object.fromEntries([...FIELDS, ...EXTRA].map(k => [k, String(p[k] ?? "")])) as unknown as Form
    o.devis_couleur ||= "#0E8F8F"
    o.tva_sur_debits = !!p.tva_sur_debits
    o.entreprise_nom ||= String(p.nom_entreprise || "")
    o.entreprise_email ||= String(p.email || "")
    o.entreprise_telephone ||= String(p.telephone || "")
    o.entreprise_ei = !!p.entreprise_ei
    o.tva_non_applicable = !!p.tva_non_applicable
    o.delai_paiement_jours = String(p.delai_paiement_jours ?? 30)
    setF(o)
  }, [p, f])
  if (!f) return <Sheet title="Entreprise" c="#FFFFFF" onClose={close}><div className={tx.cap}>Chargement…</div></Sheet>
  const v = (k: keyof Form) => ({ value: String(f[k] ?? ""), onChange: (e: { target: { value: string } }) => { setF({ ...f, [k]: e.target.value }); setErr("") } })
  const lookup = async () => {
    setLook(true); setErr("")
    const r = await api("/api/account", { action: "siret_lookup", siret: f.entreprise_siret })
    setLook(false)
    if (!r.ok) { setErr(r.error || "Recherche impossible."); return }
    setF({
      ...f,
      entreprise_nom: f.entreprise_nom || String(r.nom || ""),
      entreprise_siret: String(r.siret || f.entreprise_siret),
      entreprise_tva: f.tva_non_applicable ? f.entreprise_tva : f.entreprise_tva || String(r.tva || ""),
      entreprise_adresse: f.entreprise_adresse || String(r.adresse || ""),
      entreprise_cp_ville: f.entreprise_cp_ville || String(r.cp_ville || ""),
      entreprise_ape: f.entreprise_ape || String(r.ape || ""),
      entreprise_ei: f.entreprise_ei || r.entrepreneur_individuel === true,
    })
    toast("Informations récupérées depuis l'annuaire des entreprises")
  }
  // Même recadrage circulaire que la photo employé (PhotoCropper) ; sortie carrée 512 px JPEG pour l'aperçu et les PDF (object-contain / cadre carré).
  const pickLogo = (file?: File | null) => {
    if (!file) return
    if (!/^image\//.test(file.type)) { setErr("Logo : PNG ou JPEG uniquement."); return }
    setErr(""); setCrop(file)
  }
  const uploadLogo = async (file: File) => {
    setCrop(null)
    if (file.size > 1_000_000) { setErr("Logo : 1 Mo maximum."); return }
    setLogoBusy(true)
    const { data: { user } } = await supabase.auth.getUser()
    const path = `${user?.id}/logo-${Date.now()}.jpg`
    const { error } = await supabase.storage.from("logos").upload(path, file, { upsert: true, contentType: "image/jpeg" })
    if (error) { setLogoBusy(false); setErr("Envoi du logo impossible."); return }
    const e2 = await save({ logo_path: path })
    setLogoBusy(false)
    if (e2) setErr(e2); else toast("Logo enregistré")
  }
  const submit = async () => {
    const siret = f.entreprise_siret.replace(/\s/g, "")
    if (siret && !/^\d{14}$/.test(siret)) { setErr("Le SIRET doit comporter 14 chiffres."); return }
    if (f.avis_url && !/^https:\/\//.test(f.avis_url.trim())) { setErr("Le lien d'avis doit commencer par https://"); return }
    setBusy(true)
    const patch: Record<string, unknown> = Object.fromEntries(FIELDS.map(k => [k, String(f[k] || "").trim() || null]))
    patch.entreprise_siret = siret || null
    patch.nom_entreprise = patch.entreprise_nom
    patch.entreprise_ei = f.entreprise_ei
    patch.tva_non_applicable = f.tva_non_applicable
    patch.delai_paiement_jours = Math.min(60, Math.max(0, Number(f.delai_paiement_jours) || 30))
    const bic = f.bic.replace(/\s/g, "").toUpperCase()
    if (bic && !/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(bic)) { setBusy(false); setErr("Le BIC doit comporter 8 ou 11 caractères."); return }
    const e = await save(patch)
    if (e) { setBusy(false); setErr(e); return }
    const extra = { bic: bic || null, devis_couleur: /^#[0-9a-f]{6}$/i.test(f.devis_couleur) ? f.devis_couleur : null, devis_pied: f.devis_pied.trim().slice(0, 240) || null, tva_sur_debits: f.tva_sur_debits }
    const changed = Object.entries(extra).some(([k, v]) => (p?.[k] ?? null) !== v && !(k === "tva_sur_debits" && !v && !p?.[k]) && !(k === "devis_couleur" && v === "#0E8F8F" && !p?.[k]))
    const e2 = changed ? await save(extra) : ""
    setBusy(false)
    if (e2) setErr("Mentions enregistrées. BIC, couleur et pied de page : appliquez la migration 20261121_10 (voir LISEZMOI).")
    else { toast("Entreprise enregistrée"); close() }
  }
  const miss = missingLegal("facture")
  return <Sheet title="Entreprise" sub="Mentions légales des devis et factures" c="#FFFFFF" onClose={close} footer={<Btn primary className="w-full" disabled={busy} onClick={submit}>{busy ? "Enregistrement…" : "Enregistrer"}</Btn>}>
    {miss.length > 0 && <div className="mb-4 rounded-[16px] border border-[#FFB340]/30 bg-[#FFB340]/10 px-4 py-3 text-[13.5px] text-white/80">À compléter pour des documents conformes : {miss.join(", ")}.</div>}
    <div className="space-y-3">
      <F l="SIRET"><div className="flex gap-2"><input className={inp} inputMode="numeric" placeholder="14 chiffres" {...v("entreprise_siret")} /><Btn onClick={lookup} disabled={look || f.entreprise_siret.replace(/\s/g, "").length < 9} aria-label="Remplir avec le SIRET"><Search size={16} />{look ? "…" : "Remplir"}</Btn></div></F>
      <F l="Raison sociale / nom commercial"><input className={inp} {...v("entreprise_nom")} /></F>
      <div className="flex items-center gap-3 px-1 text-[14px]"><Tg on={f.entreprise_ei} onClick={() => setF({ ...f, entreprise_ei: !f.entreprise_ei })} label="Entrepreneur individuel" />Entrepreneur individuel (ajoute « EI » au nom)</div>
      <div className="grid grid-cols-2 gap-2"><F l="Forme juridique"><input className={inp} placeholder="EI, SARL, SAS…" {...v("entreprise_forme")} /></F><F l="Capital (société)"><input className={inp} placeholder="1 000 €" {...v("entreprise_capital")} /></F></div>
      <F l="Adresse"><input className={inp} autoComplete="street-address" {...v("entreprise_adresse")} /></F>
      <F l="Code postal et ville"><input className={inp} {...v("entreprise_cp_ville")} /></F>
      <div className="grid grid-cols-2 gap-2"><F l="Téléphone"><input className={inp} type="tel" {...v("entreprise_telephone")} /></F><F l="E-mail pro"><input className={inp} type="email" {...v("entreprise_email")} /></F></div>
      <div className="flex items-center gap-3 px-1 text-[14px]"><Tg on={f.tva_non_applicable} onClick={() => setF({ ...f, tva_non_applicable: !f.tva_non_applicable })} label="TVA non applicable" />Franchise de TVA (art. 293 B du CGI)</div>
      {!f.tva_non_applicable && <F l="N° de TVA intracommunautaire"><input className={inp} placeholder="FR00123456789" {...v("entreprise_tva")} /></F>}
      <div className="grid grid-cols-2 gap-2"><F l="RCS / RM"><input className={inp} placeholder="RM 123 456 789 (69)" {...v("entreprise_rcs_rm")} /></F><F l="Code APE"><input className={inp} placeholder="4322A" {...v("entreprise_ape")} /></F></div>
      <div className={`px-1 pt-2 ${tx.cap}`}>Assurance décennale / RC pro (obligatoire sur les devis et factures du bâtiment)</div>
      <div className="grid grid-cols-2 gap-2"><F l="Assureur"><input className={inp} {...v("assurance_nom")} /></F><F l="N° de police"><input className={inp} {...v("assurance_numero")} /></F></div>
      <F l="Adresse de l'assureur"><input className={inp} {...v("assurance_adresse")} /></F>
      <F l="Couverture géographique"><input className={inp} placeholder="France métropolitaine" {...v("assurance_zone")} /></F>
      <F l="Médiateur de la consommation (nom et site)"><input className={inp} placeholder="Ex. CM2C — www.cm2c.net" {...v("entreprise_mediateur")} /></F>
      <div className={`px-1 pt-2 ${tx.cap}`}>Paiement par virement (imprimé sur les factures)</div>
      <F l="IBAN"><input className={inp} placeholder="FR76 …" {...v("iban")} /></F>
      <div className="grid grid-cols-[1.6fr_1fr] gap-2"><F l="BIC"><input className={inp} placeholder="AGRIFRPP" autoCapitalize="characters" {...v("bic")} /></F><F l="Délai de paiement (j)"><input className={inp} type="number" min={0} max={60} {...v("delai_paiement_jours")} /></F></div>
      {!f.tva_non_applicable && <div className="flex items-center gap-3 px-1 text-[14px]"><Tg on={f.tva_sur_debits} onClick={() => setF({ ...f, tva_sur_debits: !f.tva_sur_debits })} label="TVA sur les débits" />J'ai opté pour le paiement de la TVA d'après les débits</div>}
      <div className={`px-1 pt-2 ${tx.cap}`}>Apparence des devis et factures</div>
      <F l="Couleur d'accent"><div className="flex flex-wrap items-center gap-2">{COLORS.map(c => <button key={c} type="button" aria-label={`Couleur ${c}`} onClick={() => setF({ ...f, devis_couleur: c })} className={`h-9 w-9 rounded-full ring-offset-2 ring-offset-black ${f.devis_couleur.toLowerCase() === c.toLowerCase() ? "ring-2 ring-white" : ""}`} style={{ background: c }} />)}<input type="color" aria-label="Autre couleur" value={/^#[0-9a-f]{6}$/i.test(f.devis_couleur) ? f.devis_couleur : "#0E8F8F"} onChange={e => setF({ ...f, devis_couleur: e.target.value })} className="h-9 w-12 cursor-pointer rounded-[10px] bg-transparent" /></div></F>
      <F l="Pied de page (facultatif)"><input className={inp} maxLength={240} placeholder="Ex. Merci de votre confiance · www.monentreprise.fr" {...v("devis_pied")} /></F>
      <F l="Lien de VOTRE fiche d'avis Google"><input className={inp} placeholder="https://g.page/r/…/review" {...v("avis_url")} /></F>
      <div className="flex items-center gap-3 rounded-[16px] bg-white/[.04] p-3">
        <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-[12px] bg-white/[.06]">
          {CO.logo ? <img key={logoTick} src={CO.logo} alt="" className="h-full w-full object-contain" /> : p?.logo_path ? <Building2 size={20} /> : <ImageIcon size={20} className="text-white/40" />}
        </span>
        <div className="min-w-0 flex-1 text-[14px]"><div className="font-medium">Logo</div><div className={tx.cap}>{p?.logo_path ? "Logo enregistré · imprimé sur vos PDF" : "PNG ou JPEG, 1 Mo max."}</div></div>
        <label className="flex h-10 cursor-pointer items-center rounded-full bg-white/[.08] px-4 text-[14px] font-medium hover:bg-white/[.12]">{logoBusy ? "Envoi…" : p?.logo_path ? "Changer" : "Ajouter"}<input ref={logoIn} type="file" accept="image/*" className="hidden" onChange={e => { pickLogo(e.target.files?.[0]); e.target.value = "" }} /></label>
      </div>
    </div>
    {err && <p className="mt-3 px-1 text-[13px] text-[#FF9B96]">{err}</p>}
    <AnimatePresence>{crop && <PhotoCropper key="crop" file={crop} z={61} onCancel={() => setCrop(null)} onDone={f => void uploadLogo(f)} />}</AnimatePresence>
  </Sheet>
}
