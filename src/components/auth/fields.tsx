/* update45 · Briques du parcours de connexion / inscription (labels, focus, erreurs, force du mot de passe). */
import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode } from "react"
import { motion } from "motion/react"
import { ArrowRight, Eye, EyeOff } from "lucide-react"

export const EASE = [.22, 1, .36, 1] as const

type FieldProps = InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string; aside?: ReactNode; trailing?: ReactNode }

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field({ label, hint, error, aside, trailing, id, className = "", "aria-describedby": extra, ...r }, ref) {
  const auto = useId(), fid = id || auto, hid = `${fid}-hint`, eid = `${fid}-err`
  const desc = [hint && !error && hid, extra, error && eid].filter(Boolean).join(" ") || undefined
  return <div className="group/f">
    <div className="mb-2 flex items-baseline justify-between gap-3 px-0.5">
      <label htmlFor={fid} className="text-[13px] font-medium text-white/70 transition-colors group-focus-within/f:text-white">{label}</label>
      {aside}
    </div>
    <div className="relative">
      <input ref={ref} id={fid} aria-invalid={error ? true : undefined} aria-describedby={desc} {...r}
        className={`h-12 w-full rounded-[12px] border bg-[#0E0E10] px-4 text-[15.5px] text-white outline-none transition-[border-color,box-shadow,background-color] duration-200 [color-scheme:dark] placeholder:text-white/25 hover:border-white/[.16] focus:border-white/45 focus:bg-[#121214] focus:shadow-[0_0_0_4px_rgba(255,255,255,.07)] ${error ? "border-[#FF453A]/70 focus:border-[#FF453A] focus:shadow-[0_0_0_4px_rgba(255,69,58,.14)]" : "border-white/[.09]"} ${trailing ? "pr-12" : ""} ${className}`} />
      {trailing && <div className="absolute inset-y-0 right-1.5 flex items-center">{trailing}</div>}
    </div>
    {hint && !error && <p id={hid} className="mt-2 px-0.5 text-[12.5px] text-white/40">{hint}</p>}
    {error && <p id={eid} className="mt-2 px-0.5 text-[12.5px] text-[#FF6B61]">{error}</p>}
  </div>
})

export const PasswordField = forwardRef<HTMLInputElement, Omit<FieldProps, "type" | "trailing">>(function PasswordField(p, ref) {
  const [show, setShow] = useState(false)
  return <Field ref={ref} {...p} type={show ? "text" : "password"} autoCapitalize="none" autoCorrect="off" spellCheck={false}
    trailing={<button type="button" onClick={() => setShow(s => !s)} aria-label={show ? "Masquer le mot de passe" : "Afficher le mot de passe"} aria-pressed={show} className="flex h-9 w-9 items-center justify-center rounded-[9px] text-white/40 transition-colors hover:bg-white/[.06] hover:text-white focus-visible:text-white focus-visible:outline-2 focus-visible:outline-white/50">{show ? <EyeOff size={17} strokeWidth={1.75} /> : <Eye size={17} strokeWidth={1.75} />}</button>} />
})

/** 0 = vide, 1 = trop court, 2 = faible, 3 = correct, 4 = solide */
export function pwScore(pw: string) {
  if (!pw) return 0
  if (pw.length < 8) return 1
  let s = 0
  if (pw.length >= 12) s++
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++
  if (/\d/.test(pw)) s++
  if (/[^A-Za-z0-9]/.test(pw)) s++
  if (/^(.)\1+$/.test(pw) || /^(12345678|password|motdepasse|azerty)/i.test(pw)) s = 0
  return s <= 1 ? 2 : s === 2 ? 3 : 4
}
const LV = [null, { l: "Trop court", c: "#FF453A" }, { l: "Faible", c: "#FFB340" }, { l: "Correct", c: "#E6E6E6" }, { l: "Solide", c: "#30D158" }] as const

export function Strength({ pw, id }: { pw: string; id?: string }) {
  const s = pwScore(pw), lv = LV[s]
  return <div id={id} className="mt-2.5 flex items-center gap-3 px-0.5" aria-live="polite">
    <div className="flex flex-1 gap-1.5" aria-hidden>{[1, 2, 3, 4].map(i => <span key={i} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/[.08]">
      <motion.span className="block h-full origin-left rounded-full" initial={false} animate={{ scaleX: s >= i ? 1 : 0, backgroundColor: lv?.c || "#FFFFFF" }} transition={{ duration: .35, ease: EASE }} /></span>)}</div>
    <span className="w-[74px] text-right text-[12px] tabular-nums" style={{ color: lv ? lv.c : "rgba(255,255,255,.4)" }}>{lv ? lv.l : "8 car. min."}</span>
  </div>
}

export function Spinner() {
  return <svg className="h-[18px] w-[18px] animate-spin motion-reduce:animate-none" viewBox="0 0 24 24" fill="none" aria-hidden><circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".2" strokeWidth="2.5" /><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /></svg>
}

export function Submit({ busy, children, busyLabel = "Patientez…", arrow = true }: { busy?: boolean; children: ReactNode; busyLabel?: string; arrow?: boolean }) {
  return <motion.button type="submit" disabled={busy} aria-busy={busy || undefined} whileTap={{ scale: .985 }}
    className="group/b relative flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-full bg-white text-[15.5px] font-semibold tracking-[-0.01em] text-black shadow-[0_1px_0_rgba(255,255,255,.4)_inset,0_10px_30px_-12px_rgba(255,255,255,.35)] transition-[background-color,box-shadow,opacity] duration-200 hover:bg-[#F2F2F2] focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-white disabled:cursor-progress disabled:opacity-80">
    {busy ? <><Spinner /><span>{busyLabel}</span></> : <><span>{children}</span>{arrow && <ArrowRight size={17} strokeWidth={2} className="transition-transform duration-200 group-hover/b:translate-x-0.5" />}</>}
  </motion.button>
}

export const Ghost = ({ children, onClick, className = "" }: { children: ReactNode; onClick: () => void; className?: string }) =>
  <button type="button" onClick={onClick} className={`rounded-md text-[14px] font-medium text-white/55 transition-colors hover:text-white focus-visible:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50 ${className}`}>{children}</button>

export function Steps({ step, total }: { step: number; total: number }) {
  return <div className="mb-7 flex items-center gap-3" aria-label={`Étape ${step} sur ${total}`}>
    <div className="flex gap-1.5" aria-hidden>{Array.from({ length: total }, (_, i) => <span key={i} className="relative h-1 w-10 overflow-hidden rounded-full bg-white/[.1]">
      <motion.span className="absolute inset-0 origin-left rounded-full bg-white" initial={false} animate={{ scaleX: i < step ? 1 : 0 }} transition={{ duration: .5, ease: EASE }} /></span>)}</div>
    <span className="font-mono text-[11.5px] tabular-nums text-white/40">{step}/{total}</span>
  </div>
}
