/* update70 · Version de l'app (source unique : package.json → "version" et "buildNumber").
   Synchronisée avec iOS (CFBundleShortVersionString / CFBundleVersion) et Android (versionName / versionCode)
   par `npm run version:patch|minor|major|build` (scripts/version.mjs). */
declare const __AKNO_VERSION__: string
declare const __AKNO_BUILD_NUMBER__: number
export const APP_VERSION: string = typeof __AKNO_VERSION__ === "string" ? __AKNO_VERSION__ : "0.0.0"
export const APP_BUILD: number = typeof __AKNO_BUILD_NUMBER__ === "number" ? __AKNO_BUILD_NUMBER__ : 0
