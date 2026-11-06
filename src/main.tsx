import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"
import "@fontsource-variable/geist"
import "@fontsource-variable/geist-mono"
import "./index.css"
import AknoApp from "./components/AknoApp"
import AcceptDevis from "./components/AcceptDevis"

const PAGES = ["reception", "agenda", "relance", "devis", "parametres"]

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/accept/:token" element={<AcceptDevis />} />
        {PAGES.map(p => <Route key={p} path={`/${p}`} element={<AknoApp />} />)}
        <Route path="*" element={<Navigate to={"/reception" + location.search + location.hash} replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>
)
