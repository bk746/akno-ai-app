import { StrictMode, Suspense, lazy } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"
import "@fontsource-variable/geist"
import "@fontsource-variable/geist-mono"
import "./index.css"
import AknoApp from "./components/AknoApp"
import ReserverPublic from "./components/ReserverPublic"
import RejoindrePublic from "./components/RejoindrePublic"
import AcceptDevis from "./components/AcceptDevis"
import { initMonitoring } from "./lib/monitoring"
import { initMobile } from "./lib/mobile"
import { initNative } from "./lib/native"
import { applyStatusBar } from "./lib/statusBar"

const Legal = lazy(() => import("./components/Legal"))
const DossierPublic = lazy(() => import("./components/DossierPublic"))
const PayerPublic = lazy(() => import("./components/PayerPublic"))
const LEGAL = ["cgv", "mentions-legales", "confidentialite", "dpa", "suppression-compte"] // update70 : page publique de suppression de compte (Google Play)
const Lazy = ({ children }: { children: React.ReactNode }) => <Suspense fallback={<div className="fixed inset-0 bg-black" />}>{children}</Suspense>
initMonitoring()
initMobile()
initNative() // update70 · app iOS / Android (Capacitor)
void applyStatusBar(location.pathname.startsWith("/payer") || location.pathname.startsWith("/dossier") || location.pathname.startsWith("/reserver") || location.pathname.startsWith("/rejoindre") ? "dark" : "light")

const PAGES = ["reception", "agenda", "relance", "devis", "parametres", "factures", "chantiers", "equipe", "clients"] // update62 : onglets Factures et Chantiers

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/accept/:token" element={<AcceptDevis />} />
        <Route path="/reserver/:token" element={<ReserverPublic />} />
        <Route path="/rejoindre/:token" element={<RejoindrePublic />} />
        <Route path="/dossier/:token" element={<Lazy><DossierPublic /></Lazy>} />
        <Route path="/payer/:token" element={<Lazy><PayerPublic /></Lazy>} />
        {LEGAL.map(d => <Route key={d} path={`/${d}`} element={<Lazy><Legal doc={d} /></Lazy>} />)}
        <Route path="/inscription" element={<Navigate to="/reception?signup=1" replace />} />
        {PAGES.map(p => <Route key={p} path={`/${p}`} element={<AknoApp />} />)}
        <Route path="*" element={<Navigate to={"/reception" + location.search + location.hash} replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>
)
