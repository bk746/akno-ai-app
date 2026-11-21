import { StrictMode, Suspense, lazy } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"
import "@fontsource-variable/geist"
import "@fontsource-variable/geist-mono"
import "./index.css"
import AknoApp from "./components/AknoApp"
import AcceptDevis from "./components/AcceptDevis"
import { initMonitoring } from "./lib/monitoring"
import { initMobile } from "./lib/mobile"

const Legal = lazy(() => import("./components/Legal"))
const DossierPublic = lazy(() => import("./components/DossierPublic"))
const LEGAL = ["cgv", "mentions-legales", "confidentialite", "dpa"]
const Lazy = ({ children }: { children: React.ReactNode }) => <Suspense fallback={<div className="fixed inset-0 bg-black" />}>{children}</Suspense>
initMonitoring()
initMobile()

const PAGES = ["reception", "agenda", "relance", "devis", "parametres", "factures", "chantiers"] // update62 : onglets Factures et Chantiers

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/accept/:token" element={<AcceptDevis />} />
        <Route path="/dossier/:token" element={<Lazy><DossierPublic /></Lazy>} />
        {LEGAL.map(d => <Route key={d} path={`/${d}`} element={<Lazy><Legal doc={d} /></Lazy>} />)}
        <Route path="/inscription" element={<Navigate to="/reception?signup=1" replace />} />
        {PAGES.map(p => <Route key={p} path={`/${p}`} element={<AknoApp />} />)}
        <Route path="*" element={<Navigate to={"/reception" + location.search + location.hash} replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>
)
