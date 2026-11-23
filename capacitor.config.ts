/* update70 · Configuration Capacitor (iOS / Android).
   L'identifiant, le nom et le serveur API se changent dans app.config.json (un seul endroit). */
import type { CapacitorConfig } from "@capacitor/cli"
import app from "./app.config.json"

const config: CapacitorConfig = {
  appId: app.appId,
  appName: app.appName,
  webDir: "dist",
  // L'app embarque le build local (dist). Android sert l'app sur https://localhost, iOS sur capacitor://localhost.
  server: { androidScheme: "https" },
  backgroundColor: "#000000",
  ios: { contentInset: "never", backgroundColor: "#000000", scheme: "Akno" },
  android: { backgroundColor: "#000000", allowMixedContent: false },
  plugins: {
    SplashScreen: { launchShowDuration: 1500, launchAutoHide: false, backgroundColor: "#000000", showSpinner: false, androidScaleType: "CENTER_CROP", splashFullScreen: true, splashImmersive: false },
    StatusBar: { style: "LIGHT", backgroundColor: "#00000000", overlaysWebView: true },
    /* update84 · le WebView ne doit pas redimensionner le layout : --kb (visualViewport) suit le clavier. Plugin optionnel. */
    Keyboard: { resize: "none" },
  },
}

export default config
