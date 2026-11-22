#!/usr/bin/env node
/* update70 · Version unique de l'app + configuration native (idempotent).
   Source : package.json → "version" (ex. 1.1.12) et "buildNumber" (entier qui augmente à chaque envoi aux stores).
   Usage :
     npm run version:patch   1.0.0 → 1.0.1 (+1 build)     npm run version:minor   1.0.3 → 1.1.0 (+1 build)
     npm run version:major   1.4.2 → 2.0.0 (+1 build)     npm run version:build   même version, build +1
     npm run version:sync    ne change rien, recopie la version et la config dans ios/ et android/
   Recopie dans : iOS (MARKETING_VERSION = CFBundleShortVersionString, CURRENT_PROJECT_VERSION = CFBundleVersion,
   identifiant, textes de permission FR, schéma d'URL) et Android (versionName, versionCode, identifiant, permissions,
   lien profond). Identifiant / nom / schéma : app.config.json. */
import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const P = f => join(root, f)
const pkgPath = P("package.json")
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"))
const app = JSON.parse(readFileSync(P("app.config.json"), "utf8"))
const mode = process.argv[2] || "sync"

const semver = /^(\d+)\.(\d+)\.(\d+)$/
if (!semver.test(pkg.version)) { console.error(`Version invalide dans package.json : ${pkg.version} (attendu : 1.2.3)`); process.exit(1) }
let [maj, min, pat] = pkg.version.match(semver).slice(1).map(Number)
let build = Number(pkg.buildNumber) || 1
if (mode === "patch") { pat++; build++ }
else if (mode === "minor") { min++; pat = 0; build++ }
else if (mode === "major") { maj++; min = 0; pat = 0; build++ }
else if (mode === "build") build++
else if (mode !== "sync") { console.error("Usage : node scripts/version.mjs patch|minor|major|build|sync"); process.exit(1) }
const version = `${maj}.${min}.${pat}`
if (mode !== "sync") {
  const raw = readFileSync(pkgPath, "utf8")
  const next = raw.replace(/("version":\s*")[^"]+(")/, `$1${version}$2`).replace(/("buildNumber":\s*)\d+/, `$1${build}`)
  writeFileSync(pkgPath, next)
}

const edit = (file, fn) => { if (!existsSync(file)) return false; const a = readFileSync(file, "utf8"), b = fn(a); if (a !== b) writeFileSync(file, b); return true }

/* ---------- iOS ---------- */
const IOS_PERMS = {
  NSMicrophoneUsageDescription: "Akno utilise le micro pour vous permettre de parler à votre réceptionniste IA et de dicter vos demandes.",
  NSCameraUsageDescription: "Akno utilise l'appareil photo pour prendre en photo vos chantiers, les membres de votre équipe et vos documents.",
  NSPhotoLibraryUsageDescription: "Akno accède à vos photos pour ajouter un logo, une photo de chantier, d'équipe ou un document.",
  NSPhotoLibraryAddUsageDescription: "Akno enregistre dans vos photos les documents que vous choisissez d'exporter.",
  NSContactsUsageDescription: "Akno peut importer un contact de votre téléphone pour créer une fiche client plus vite.",
  NSLocationWhenInUseUsageDescription: "Akno utilise votre position pour vous situer sur la carte de vos chantiers.",
  NSFaceIDUsageDescription: "Akno utilise Face ID pour déverrouiller l'app de façon sécurisée.",
}
const plistSet = (xml, key, valueXml) => {
  const re = new RegExp(`\\s*<key>${key}</key>\\s*(<string>[^<]*</string>|<true/>|<false/>|<array>[\\s\\S]*?</array>)`)
  const entry = `\n\t<key>${key}</key>\n\t${valueXml}`
  return re.test(xml) ? xml.replace(re, entry) : xml.replace(/\s*<\/dict>\s*<\/plist>\s*$/, `${entry}\n</dict>\n</plist>\n`)
}
const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
const ios = edit(P("ios/App/App/Info.plist"), x => {
  for (const [k, v] of Object.entries(IOS_PERMS)) x = plistSet(x, k, `<string>${esc(v)}</string>`)
  x = plistSet(x, "CFBundleDevelopmentRegion", "<string>fr</string>")
  x = plistSet(x, "CFBundleDisplayName", `<string>${esc(app.appName)}</string>`)
  x = plistSet(x, "ITSAppUsesNonExemptEncryption", "<false/>")
  x = plistSet(x, "UIRequiredDeviceCapabilities", "<array>\n\t\t<string>arm64</string>\n\t</array>")
  x = plistSet(x, "UISupportedInterfaceOrientations", "<array>\n\t\t<string>UIInterfaceOrientationPortrait</string>\n\t</array>")
  x = x.replace(/\s*<key>CFBundleURLTypes<\/key>\s*<array>[\s\S]*?<\/dict>\s*<\/array>/, "")
  x = plistSet(x, "CFBundleURLTypes", `<array>\n\t\t<dict>\n\t\t\t<key>CFBundleURLName</key>\n\t\t\t<string>${esc(app.appId)}</string>\n\t\t\t<key>CFBundleURLSchemes</key>\n\t\t\t<array>\n\t\t\t\t<string>${esc(app.urlScheme)}</string>\n\t\t\t</array>\n\t\t</dict>\n\t</array>`)
  return x
})
edit(P("ios/App/App.xcodeproj/project.pbxproj"), x => x
  .replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`)
  .replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${build};`)
  .replace(/PRODUCT_BUNDLE_IDENTIFIER = [^;]+;/g, `PRODUCT_BUNDLE_IDENTIFIER = ${app.appId};`)
  .replace(/TARGETED_DEVICE_FAMILY = "1,2";/g, `TARGETED_DEVICE_FAMILY = 1;`))

/* ---------- Android ---------- */
const ANDROID_PERMS = [
  "android.permission.INTERNET",
  "android.permission.RECORD_AUDIO",
  "android.permission.MODIFY_AUDIO_SETTINGS",
  "android.permission.CAMERA",
  "android.permission.ACCESS_COARSE_LOCATION",
  "android.permission.ACCESS_FINE_LOCATION",
  "android.permission.USE_BIOMETRIC",
]
const android = edit(P("android/app/src/main/AndroidManifest.xml"), x => {
  for (const p of ANDROID_PERMS) if (!x.includes(`"${p}"`)) x = x.replace(/<\/manifest>\s*$/, `    <uses-permission android:name="${p}" />\n</manifest>\n`)
  for (const f of ["android.hardware.camera", "android.hardware.location.gps", "android.hardware.microphone"]) if (!x.includes(`"${f}"`)) x = x.replace(/<\/manifest>\s*$/, `    <uses-feature android:name="${f}" android:required="false" />\n</manifest>\n`)
  if (!x.includes("akno-deeplink")) x = x.replace(/(<category android:name="android.intent.category.LAUNCHER" \/>\s*<\/intent-filter>)/, `$1

            <!-- akno-deeplink : retour OAuth (${app.urlScheme}://auth/callback) -->
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="${app.urlScheme}" />
            </intent-filter>`)
  else x = x.replace(/(<!-- akno-deeplink[^>]*>\s*<intent-filter>[\s\S]*?<data android:scheme=")[^"]+(")/, `$1${app.urlScheme}$2`)
  x = x.replace(/android:allowBackup="true"/, 'android:allowBackup="false"')
  return x
})
edit(P("android/app/build.gradle"), x => x
  .replace(/versionCode \d+/, `versionCode ${build}`)
  .replace(/versionName "[^"]*"/, `versionName "${version}"`)
  .replace(/applicationId "[^"]*"/, `applicationId "${app.appId}"`))
edit(P("android/app/src/main/res/values/strings.xml"), x => x
  .replace(/(<string name="app_name">)[^<]*(<\/string>)/, `$1${app.appName}$2`)
  .replace(/(<string name="title_activity_main">)[^<]*(<\/string>)/, `$1${app.appName}$2`)
  .replace(/(<string name="custom_url_scheme">)[^<]*(<\/string>)/, `$1${app.urlScheme}$2`))

console.log(`Akno ${version} (build ${build})${mode === "sync" ? "" : ` · ${mode}`} · iOS ${ios ? "OK" : "absent"} · Android ${android ? "OK" : "absent"}`)
