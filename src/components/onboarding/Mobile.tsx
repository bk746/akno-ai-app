/* update61 · Briques des écrans d'inscription au style de la maquette (noir premium, colonne centrée, bouton blanc en bas). */
import type { ReactNode } from "react"
import { motion } from "motion/react"
import { ChevronLeft, Check } from "lucide-react"
import { EASE, Spinner } from "../auth/fields"

export function MScreen({ children, back, footer, center }: { children: ReactNode; back?: () => void; footer?: ReactNode; center?: boolean }) {
  return <div className="flex min-h-[100dvh] flex-col bg-black text-white antialiased" style={{ paddingTop: "max(env(safe-area-inset-top), 12px)", paddingBottom: "max(env(safe-area-inset-bottom), 16px)" }}>
    <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col px-6">
      <div className="h-11">{back && <button type="button" onClick={back} aria-label="Retour" className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-white/85 transition-colors hover:bg-white/[.06]"><ChevronLeft size={24} strokeWidth={2} /></button>}</div>
      <div className={`flex flex-1 flex-col ${center ? "items-center justify-center text-center" : ""}`}>{children}</div>
      {footer && <div className="pt-6">{footer}</div>}
    </div>
  </div>
}
export const MTitle = ({ children }: { children: ReactNode }) => <motion.h1 initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .35, ease: EASE }} className="mt-4 text-[28px] font-semibold leading-[1.12] tracking-[-0.035em] text-balance">{children}</motion.h1>
export const MSub = ({ children }: { children: ReactNode }) => <p className="mt-2 text-[14.5px] leading-[1.5] text-white/50 text-pretty">{children}</p>

export function MButton({ children, onClick, busy, disabled, type = "button", variant = "white" }: { children: ReactNode; onClick?: () => void; busy?: boolean; disabled?: boolean; type?: "button" | "submit"; variant?: "white" | "dark" }) {
  return <motion.button type={type} onClick={onClick} disabled={busy || disabled} whileTap={{ scale: .985 }} aria-busy={busy || undefined}
    className={`flex h-[52px] w-full items-center justify-center gap-2.5 rounded-full text-[16px] font-semibold tracking-[-0.01em] transition-[background-color,opacity] duration-200 focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-white disabled:opacity-60 ${variant === "white" ? "bg-[#F5F5F7] text-black hover:bg-white" : "bg-[#1C1C1E] text-white hover:bg-[#242426]"}`}>
    {busy ? <Spinner /> : null}{children}
  </motion.button>
}

/** Champ unique, grand, comme sur la maquette (« Votre e-mail »). */
export function MInput(p: React.InputHTMLAttributes<HTMLInputElement> & { error?: string }) {
  const { error, className = "", ...r } = p
  return <div>
    <input {...r} aria-invalid={error ? true : undefined} className={`h-[54px] w-full rounded-[14px] border bg-[#1C1C1E] px-4 text-[16.5px] text-white outline-none transition-[border-color,box-shadow] [color-scheme:dark] placeholder:text-white/30 focus:border-white/35 focus:shadow-[0_0_0_4px_rgba(255,255,255,.06)] ${error ? "border-[#FF453A]/70" : "border-transparent"} ${className}`} />
    {error && <p className="mt-2 px-1 text-[13px] text-[#FF6B61]">{error}</p>}
  </div>
}

/** Liste à choix unique avec coche (« Votre métier ? »). */
export function MChoice({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return <div role="radiogroup" className="overflow-hidden rounded-[16px] bg-[#1C1C1E]">
    {options.map((o, i) => <button key={o} type="button" role="radio" aria-checked={value === o} onClick={() => onChange(o)} className={`flex h-[50px] w-full items-center justify-between px-4 text-left text-[16px] transition-colors hover:bg-white/[.04] ${i ? "border-t border-white/[.07]" : ""}`}>
      <span>{o}</span>{value === o && <motion.span initial={{ scale: .5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}><Check size={19} strokeWidth={2.4} /></motion.span>}
    </button>)}
  </div>
}
