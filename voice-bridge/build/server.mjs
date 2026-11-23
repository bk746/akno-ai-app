// src/server.ts
import http from "node:http";
import { WebSocketServer, WebSocket } from "ws";

// ../src/lib/tarifs.ts
var DEFAULT_TARIFS = {
  deplacement: 49,
  diagnostic: null,
  tauxHoraire: null,
  devisGratuit: true,
  majorationUrgence: 50,
  majorationWeekend: null,
  zoneKm: 30,
  entretienChaudiere: null
};
var KEYS = Object.keys(DEFAULT_TARIFS);
function asNumber(v) {
  if (v === null || v === void 0 || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
function asBool(v) {
  if (v === null || v === void 0 || v === "") return null;
  if (typeof v === "boolean") return v;
  if (v === "true" || v === 1 || v === "1") return true;
  if (v === "false" || v === 0 || v === "0") return false;
  return null;
}
function mergeTarifs(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  return {
    deplacement: asNumber(src.deplacement),
    diagnostic: asNumber(src.diagnostic),
    tauxHoraire: asNumber(src.tauxHoraire),
    devisGratuit: asBool(src.devisGratuit),
    majorationUrgence: asNumber(src.majorationUrgence),
    majorationWeekend: asNumber(src.majorationWeekend),
    zoneKm: asNumber(src.zoneKm),
    entretienChaudiere: asNumber(src.entretienChaudiere)
  };
}
function euro(n) {
  return `${String(n).replace(".", ",")} \u20AC`;
}
function pct(n) {
  return `+${String(n).replace(".", ",")} %`;
}
function formatTarifsForPrompt(raw) {
  const t = mergeTarifs(raw);
  const hint = (set) => set ? "tarif de l'artisan" : "indicatif, \xE0 confirmer par l'artisan";
  const lines = [
    "TARIFS QUE TU PEUX CITER (frais fixes uniquement \u2014 jamais le prix des travaux)",
    `- Frais de d\xE9placement : ${euro(t.deplacement ?? DEFAULT_TARIFS.deplacement)} (${hint(t.deplacement != null)}).`,
    t.diagnostic != null ? `- Frais de diagnostic : ${euro(t.diagnostic)} (tarif de l'artisan).` : "- Frais de diagnostic : non communiqu\xE9 \u2014 ne l'invente pas, dis que le diagnostic est \xE9tabli sur place puis chiffr\xE9 dans le devis.",
    t.tauxHoraire != null ? `- Taux horaire : ${euro(t.tauxHoraire)} de l'heure (tarif de l'artisan, hors pi\xE8ces et hors travaux).` : "- Taux horaire : non communiqu\xE9 \u2014 ne l'invente pas.",
    `- Devis : ${t.devisGratuit ?? DEFAULT_TARIFS.devisGratuit ? "gratuit" : "payant"} (${hint(t.devisGratuit != null)}).`,
    `- Majoration urgence : ${pct(t.majorationUrgence ?? DEFAULT_TARIFS.majorationUrgence)} (${hint(t.majorationUrgence != null)}).`,
    t.majorationWeekend != null ? `- Majoration week-end : ${pct(t.majorationWeekend)} (tarif de l'artisan).` : "- Majoration week-end : non communiqu\xE9e \u2014 ne l'invente pas.",
    `- Zone d'intervention : ${t.zoneKm ?? DEFAULT_TARIFS.zoneKm} km (${hint(t.zoneKm != null)}).`,
    t.entretienChaudiere != null ? `- Entretien chaudi\xE8re (forfait) : ${euro(t.entretienChaudiere)} (tarif de l'artisan).` : "- Entretien chaudi\xE8re : pas de forfait communiqu\xE9 \u2014 ne l'invente pas ; pour un entretien ou un contrat (cat\xE9gorie B), propose un devis \xE0 valider par l'artisan, sans visite de diagnostic.",
    "Tu peux citer ces frais fixes si on te les demande. Tu ne chiffres jamais les travaux, pi\xE8ces, main-d'\u0153uvre hors taux horaire indiqu\xE9, ni un total d'intervention."
  ];
  return lines.join("\n");
}

// ../src/lib/phone.ts
function digitsFr(raw) {
  let d = String(raw || "").replace(/\D/g, "");
  if (d.startsWith("33") && d.length >= 11) d = "0" + d.slice(2);
  return d;
}
function formatPhonePairs(raw) {
  const d = digitsFr(raw);
  if (!d) return "";
  return (d.match(/.{1,2}/g) || [d]).join(" ");
}
function hasEmergencyPhone(raw) {
  return digitsFr(raw).length >= 10;
}

// ../src/lib/voice/receptionist.ts
var CUSTOM_VOICE_KERYAN = "3ixfadarbuwy";
var isCustomVoiceId = (id) => id.toLowerCase() === CUSTOM_VOICE_KERYAN;
var VOICES = [
  { id: CUSTOM_VOICE_KERYAN, name: "Ma voix (Keryan)", gender: "male", tone: "Voix personnalis\xE9e", use: "R\xE9ceptionniste", reco: true },
  { id: "celeste", name: "Celeste", gender: "female", tone: "Empathique, assur\xE9e, rassurante", use: "Accueil, assistance", reco: true },
  { id: "aurora", name: "Aurora", gender: "female", tone: "Sereine, pos\xE9e, rayonnante", use: "Accueil, assistance", reco: true },
  { id: "iris", name: "Iris", gender: "female", tone: "Aimable, enjou\xE9e, d'un charme naturel", use: "Commercial, accueil", reco: true },
  { id: "ara", name: "Ara", gender: "female", tone: "Chaleureuse et aimable", use: "Polyvalente", reco: true },
  { id: "ursa", name: "Ursa", gender: "female", tone: "Aimable, chaleureuse, constante", use: "Assistante, podcast", reco: true },
  { id: "carina", name: "Carina", gender: "female", tone: "Douce, empathique, apaisante", use: "Bien-\xEAtre, assistance" },
  { id: "luna", name: "Luna", gender: "female", tone: "Douce, patiente, attentionn\xE9e", use: "P\xE9dagogie, assistante" },
  { id: "liora", name: "Liora", gender: "female", tone: "Calme, pos\xE9e, lumineuse", use: "Bien-\xEAtre, assistante" },
  { id: "eve", name: "Eve", gender: "female", tone: "\xC9nergique et enjou\xE9e", use: "Polyvalente", accent: "britannique" },
  { id: "atlas", name: "Atlas", gender: "male", tone: "Assur\xE9, pos\xE9, rassurant", use: "Commercial, assistant", reco: true },
  { id: "castor", name: "Castor", gender: "male", tone: "Charismatique, simple, d\xE9tendu", use: "Commercial, accueil", reco: true },
  { id: "rex", name: "Rex", gender: "male", tone: "Assur\xE9 et clair", use: "Polyvalent", reco: true },
  { id: "sal", name: "Sal", gender: "male", tone: "Doux et \xE9quilibr\xE9", use: "Polyvalent" },
  { id: "lux", name: "Lux", gender: "male", tone: "Pos\xE9, calme, sage", use: "Bien-\xEAtre, narration" },
  { id: "perseus", name: "Perseus", gender: "male", tone: "Solide, assur\xE9, digne de confiance", use: "Publicit\xE9, narration" },
  { id: "lumen", name: "Lumen", gender: "male", tone: "Chaleureux, clair, engageant", use: "P\xE9dagogie, publicit\xE9" },
  { id: "helios", name: "Helios", gender: "male", tone: "Enjou\xE9, \xE9nergique, polyvalent", use: "Assistant, bien-\xEAtre" },
  { id: "cosmo", name: "Cosmo", gender: "male", tone: "Vif, curieux, facile \xE0 suivre", use: "P\xE9dagogie, podcast" },
  { id: "altair", name: "Altair", gender: "male", tone: "\xC9l\xE9gant, raffin\xE9, haut de gamme", use: "Publicit\xE9, narration" },
  { id: "zenith", name: "Zenith", gender: "male", tone: "Incisif, concentr\xE9, d\xE9termin\xE9", use: "Commercial, publicit\xE9" },
  { id: "kepler", name: "Kepler", gender: "male", tone: "Inventif, charismatique", use: "Publicit\xE9, podcast" },
  { id: "orion", name: "Orion", gender: "male", tone: "Riche, cin\xE9matographique, profond", use: "Narration, livres audio" },
  { id: "helix", name: "Helix", gender: "male", tone: "Audacieux, dynamique", use: "Commentaire, podcast" },
  { id: "sirius", name: "Sirius", gender: "male", tone: "Vif d'esprit, malicieux", use: "Commentaire, personnages" },
  { id: "zagan", name: "Zagan", gender: "male", tone: "Puissant, dramatique", use: "Personnages, narration" },
  { id: "leo", name: "Leo", gender: "male", tone: "Autoritaire et puissant", use: "Polyvalent", accent: "britannique" },
  { id: "rigel", name: "Rigel", gender: "male", tone: "Pr\xE9cis, professionnel, calme", use: "Assistant, support", accent: "australien" },
  { id: "naksh", name: "Naksh", gender: "male", tone: "Chaleureux, r\xE9fl\xE9chi", use: "Assistant, support", accent: "indien" }
];
var DEFAULT_VOICE = "ara";
var ALLOWED_VOICE_IDS = new Set(VOICES.map((v) => v.id));
var VOICE_IDS = ALLOWED_VOICE_IDS;
var isVoiceId = (v) => typeof v === "string" && VOICE_IDS.has(v.toLowerCase());
var DEFAULT_PICKUP = "fallback";
var LIMITS = { presentation: 600, services: 20, nom: 80, prix: 40, duree: 40, zone: 200, disponibilites: 300, urgences: 500, interdits: 500, faq: 12, q: 160, r: 400, consignes: 1200, prononciations: 10, mot: 60, dit: 80 };
var SPEED_MIN = 0.85;
var SPEED_MAX = 1.2;
var emptyConfig = () => ({
  voice: DEFAULT_VOICE,
  speed: 1,
  enabled: true,
  pickup: DEFAULT_PICKUP,
  operator: "orange",
  forwardApplied: "",
  tutoiement: false,
  presentation: "",
  services: [],
  zone: "",
  disponibilites: "",
  urgences: "",
  interdits: "",
  faq: [],
  consignes: "",
  prononciations: []
});
var clean = (v, max) => typeof v !== "string" ? "" : v.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, " ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, max);
var line = (v, max) => clean(v, max).replace(/\s*\n\s*/g, " ");
var arr = (v) => Array.isArray(v) ? v : [];
function resolveVoice(raw, fallback) {
  const cv = typeof raw.customVoice === "string" ? raw.customVoice.toLowerCase().trim() : "";
  if (cv === CUSTOM_VOICE_KERYAN) return CUSTOM_VOICE_KERYAN;
  const v = typeof raw.voice === "string" ? raw.voice.toLowerCase().trim() : "";
  if (v === CUSTOM_VOICE_KERYAN || v && isVoiceId(v) && isCustomVoiceId(v)) return CUSTOM_VOICE_KERYAN;
  if (v && isVoiceId(v) && !isCustomVoiceId(v)) return v;
  return fallback;
}
function normalizeConfig(raw) {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const base = emptyConfig();
  const sp = Number(o.speed);
  return {
    voice: resolveVoice(o, base.voice),
    speed: Number.isFinite(sp) && sp > 0 ? Math.round(Math.min(SPEED_MAX, Math.max(SPEED_MIN, sp)) * 100) / 100 : 1,
    enabled: o.enabled !== false,
    pickup: o.pickup === "direct" ? "direct" : DEFAULT_PICKUP,
    operator: o.operator === "sfr" || o.operator === "bouygues" || o.operator === "free" ? o.operator : "orange",
    forwardApplied: o.forwardApplied === "off" || o.forwardApplied === "direct" || o.forwardApplied === "fallback" ? o.forwardApplied : "",
    tutoiement: o.tutoiement === true,
    presentation: clean(o.presentation, LIMITS.presentation),
    services: arr(o.services).map((s) => s && typeof s === "object" ? s : {}).map((s) => ({ nom: line(s.nom, LIMITS.nom), prix: line(s.prix, LIMITS.prix), duree: line(s.duree, LIMITS.duree) })).filter((s) => s.nom).slice(0, LIMITS.services),
    zone: line(o.zone, LIMITS.zone),
    disponibilites: clean(o.disponibilites, LIMITS.disponibilites),
    urgences: clean(o.urgences, LIMITS.urgences),
    interdits: clean(o.interdits, LIMITS.interdits),
    faq: arr(o.faq).map((f) => f && typeof f === "object" ? f : {}).map((f) => ({ q: line(f.q, LIMITS.q), r: clean(f.r, LIMITS.r) })).filter((f) => f.q && f.r).slice(0, LIMITS.faq),
    consignes: clean(o.consignes, LIMITS.consignes),
    // Clés acceptées par xAI : lettres, chiffres, apostrophes, espaces.
    // Mot avec ponctuation/symboles ignoré (pas de troncature : « C++ » remplacerait chaque « C »).
    prononciations: arr(o.prononciations).map((p) => p && typeof p === "object" ? p : {}).map((p) => ({ mot: line(p.mot, LIMITS.mot), dit: line(p.dit, LIMITS.dit) })).filter((p) => p.mot.length >= 2 && /^[\p{L}\p{N}' ’]+$/u.test(p.mot) && p.dit && p.mot.toLowerCase() !== p.dit.toLowerCase()).slice(0, LIMITS.prononciations)
  };
}
var ACTIVITE = {
  "\xE9lectricien": "\xE9lectricit\xE9",
  "electricien": "\xE9lectricit\xE9",
  "plombier": "plomberie",
  "chauffagiste": "chauffage",
  "serrurier": "serrurerie",
  "peintre": "peinture",
  "menuisier": "menuiserie",
  "ma\xE7on": "ma\xE7onnerie",
  "macon": "ma\xE7onnerie",
  "couvreur": "couverture",
  "carreleur": "carrelage",
  "plaquiste": "pl\xE2trerie et cloisons",
  "climaticien": "climatisation",
  "multiservice": "multi-services",
  "multiservices": "multi-services",
  "autre": ""
};
function metierActivite(m) {
  const t = (m || "").trim();
  if (!t) return "";
  const k = t.toLowerCase();
  return k in ACTIVITE ? ACTIVITE[k] : t;
}
var DAYS = [["lun", "lundi"], ["mar", "mardi"], ["mer", "mercredi"], ["jeu", "jeudi"], ["ven", "vendredi"], ["sam", "samedi"], ["dim", "dimanche"]];
var hh = (t) => {
  const [h, m] = t.split(":");
  return `${Number(h)} h${m && m !== "00" ? ` ${m}` : ""}`;
};
function formatHoraires(raw) {
  if (!raw || typeof raw !== "object") return "";
  const h = raw;
  const val = (k) => {
    const v = h[k];
    return Array.isArray(v) && /^\d\d:\d\d$/.test(String(v[0])) && /^\d\d:\d\d$/.test(String(v[1])) ? `${v[0]}-${v[1]}` : "";
  };
  const groups = [];
  for (const [k, l] of DAYS) {
    const v = val(k);
    const g = groups[groups.length - 1];
    if (g && g.v === v) g.to = l;
    else groups.push({ from: l, to: l, v });
  }
  const open = groups.filter((g) => g.v);
  if (!open.length) return "";
  const days = (g) => g.from === g.to ? `le ${g.from}` : `du ${g.from} au ${g.to}`;
  const parts = open.map((g) => {
    const [a, b] = g.v.split("-");
    return `${days(g)} de ${hh(a)} \xE0 ${hh(b)}`;
  });
  const closed = groups.filter((g) => !g.v).map((g) => g.from === g.to ? g.from : `du ${g.from} au ${g.to}`);
  return parts.join(", ") + (closed.length ? `, ferm\xE9 ${closed.join(" et ")}` : "");
}
function hasCustom(c) {
  return !!(c.presentation || c.services.length || c.zone || c.disponibilites || c.urgences || c.interdits || c.faq.length || c.consignes || c.prononciations.length || c.tutoiement);
}
var hasPricedService = (c) => !!c?.services.some((s) => s.prix);
function formatConfigForPrompt(c) {
  if (!c || !hasCustom(c)) return "";
  const out = [];
  if (c.tutoiement) out.push(`TON CHOISI PAR L'ARTISAN : tutoiement. Tutoie le client du d\xE9but \xE0 la fin, avec respect et sans familiarit\xE9 ; adapte les phrases mod\xE8les ci-dessus (\xAB Quand es-tu disponible ? \xBB, \xAB Peux-tu m'\xE9peler ton adresse e-mail ? \xBB).`);
  if (c.presentation) out.push(`PR\xC9SENTATION DE L'ENTREPRISE (si on te demande qui vous \xEAtes ou ce que vous faites, r\xE9sume-la en une ou deux phrases) :
${c.presentation}`);
  if (c.services.length) {
    out.push(`PRESTATIONS R\xC9ALIS\xC9ES (liste de l'artisan, fait foi pour savoir si une demande est dans notre champ) :
${c.services.map((s) => `- ${s.nom}${s.prix ? ` \u2014 prix indicatif : ${s.prix}` : ""}${s.duree ? ` \u2014 dur\xE9e habituelle : ${s.duree}` : ""}`).join("\n")}` + (hasPricedService(c) ? `
Un prix indicatif de cette liste peut \xEAtre donn\xE9 tel quel, en pr\xE9cisant que c'est indicatif et que le prix d\xE9finitif est confirm\xE9 par l'artisan (devis ou visite). Jamais d'autre prix.` : ""));
  }
  if (c.disponibilites) out.push(`DISPONIBILIT\xC9S ET D\xC9LAIS (indications de l'artisan ; les cr\xE9neaux r\xE9els restent ceux de l'agenda) :
${c.disponibilites}`);
  if (c.urgences) out.push(`URGENCES \u2014 CONSIGNES DE L'ARTISAN (en plus de la cat\xE9gorie C, jamais \xE0 la place des consignes de s\xE9curit\xE9) :
${c.urgences}`);
  if (c.faq.length) out.push(`QUESTIONS FR\xC9QUENTES (r\xE9ponds avec ces r\xE9ponses, reformul\xE9es naturellement et bri\xE8vement) :
${c.faq.map((f) => `Q : ${f.q}
R : ${f.r}`).join("\n")}`);
  if (c.consignes) out.push(`CONSIGNES PARTICULI\xC8RES DE L'ARTISAN :
${c.consignes}`);
  if (c.interdits) out.push(`\xC0 NE JAMAIS PROMETTRE NI DIRE (consigne absolue de l'artisan) :
${c.interdits}`);
  return `INFOS DE L'ARTISAN (configur\xE9es dans \xAB Ma r\xE9ceptionniste \xBB \u2014 elles compl\xE8tent les r\xE8gles ci-dessus ; en cas de conflit, la s\xE9curit\xE9 (gaz, 112), l'annonce d'enregistrement, ne jamais se dire humaine, ne jamais inventer un prix ou un cr\xE9neau, priment toujours) :

${out.join("\n\n")}`;
}
function replaceMap(c) {
  if (!c?.prononciations.length) return void 0;
  return Object.fromEntries(c.prononciations.map((p) => [p.mot, p.dit]));
}

// ../src/lib/voice/script.ts
var PLACEHOLDER_COMPANY = /^l['\u2019]entreprise$/i;
function companyName(...vals) {
  for (const v of vals) {
    const t = (v ?? "").trim();
    if (t && !PLACEHOLDER_COMPANY.test(t)) return t;
  }
  return "Akno";
}
var emptyProfile = () => ({
  prenom: "l'artisan",
  company: "Akno",
  email: "",
  phone: "",
  address: "",
  city: "votre secteur",
  metier: "b\xE2timent",
  rayon: "30 km",
  tarifs: mergeTarifs(),
  telephoneUrgence: ""
});
function mergeProfile(partial) {
  const base = emptyProfile();
  if (!partial) return base;
  const pick = (v, fallback = "") => v && v.trim() || fallback;
  const tarifs = mergeTarifs(partial.tarifs);
  return {
    prenom: pick(partial.prenom, base.prenom),
    company: companyName(partial.company, base.company),
    email: pick(partial.email),
    phone: pick(partial.phone),
    address: pick(partial.address),
    city: pick(partial.city, base.city),
    metier: pick(metierActivite(partial.metier), base.metier),
    rayon: tarifs.zoneKm != null ? `${tarifs.zoneKm} km` : pick(partial.rayon, base.rayon),
    tarifs,
    telephoneUrgence: pick(partial.telephoneUrgence),
    accueil: pick(partial.accueil),
    reception: normalizeConfig(partial.reception),
    horaires: partial.horaires && typeof partial.horaires === "object" ? partial.horaires : void 0
  };
}
var VOICE_ID = DEFAULT_VOICE;
var RECORDING_NOTICE = "Appel enregistr\xE9.";
function welcomeLine(p) {
  const custom = (p.accueil || "").replace(/\s+/g, " ").trim();
  const co = companyName(p.company);
  const listen = p.reception?.tutoiement ? "je t'\xE9coute" : "je vous \xE9coute";
  if (custom) {
    const hasRec = /enregistr/i.test(custom);
    const end = (t) => /[.!?…]$/.test(t) ? t : `${t}.`;
    return hasRec ? custom : `${end(custom)} ${RECORDING_NOTICE}`;
  }
  return `${co}, bonjour, ${listen}. ${RECORDING_NOTICE}`;
}
var KEYTERMS_RAW = [
  "Akno",
  "devis",
  "d\xE9pannage",
  "chaudi\xE8re",
  "cumulus",
  "ballon d'eau chaude",
  "chauffe-eau",
  "VMC",
  "disjoncteur",
  "tableau \xE9lectrique",
  "fuite",
  "fuite d'eau",
  "d\xE9g\xE2t des eaux",
  "robinetterie",
  "robinet",
  "mitigeur",
  "siphon",
  "chasse d'eau",
  "WC",
  "toilettes",
  "radiateur",
  "pompe \xE0 chaleur",
  "clim",
  "climatisation",
  "carrelage",
  "fa\xEFence",
  "placo",
  "enduit",
  "ravalement",
  "toiture",
  "goutti\xE8re",
  "tuile",
  "zinguerie",
  "menuiserie",
  "volet roulant",
  "canalisation",
  "d\xE9bouchage",
  "ramonage",
  "entretien chaudi\xE8re",
  "contrat d'entretien",
  "abonnement",
  "lavabo",
  "\xE9vier",
  "luminaire",
  "interrupteur",
  "isolation",
  "infiltration",
  "moisissure",
  "code d'acc\xE8s",
  "GRDF",
  "pression",
  "purge",
  "MaPrimeR\xE9nov'",
  "garantie d\xE9cennale",
  "syndic",
  "serrure",
  "arobase",
  "underscore",
  "tiret bas"
];
var KEYTERMS = KEYTERMS_RAW.map((t) => t.slice(0, 50)).slice(0, 100);
function formatSlotsHint(slots) {
  const top = slots.filter((s) => s.label || s.date && s.heure).slice(0, 8);
  if (!top.length) return "";
  const lines = top.map((s) => `- ${s.label || `${s.date} \xE0 ${s.heure}`} (date ${s.date || ""}, heure ${s.heure || ""})`);
  return `

CR\xC9NEAUX D\xC9J\xC0 CONSULT\xC9S (\xE0 partir de demain, heure de Paris) :
${lines.join("\n")}
Demande d'abord \xAB Quand \xEAtes-vous disponible ? \xBB et attends sa r\xE9ponse (jour, matin / apr\xE8s-midi, fin de semaine\u2026). Propose ensuite le ou les cr\xE9neaux de cette liste qui correspondent le mieux, les plus proches de sa demande. N'appelle get_available_slots que si la p\xE9riode demand\xE9e n'est pas couverte ici, ou si cette liste est vide. N'annonce pas \xAB Je regarde\u2026 \xBB : le syst\xE8me le dit si l'agenda est lent. Ne propose des cr\xE9neaux sans avoir demand\xE9 sa pr\xE9f\xE9rence que s'il dit qu'il n'en a pas (\xAB peu importe \xBB, \xAB d\xE8s que possible \xBB). N'appelle book_appointment qu'une fois le cr\xE9neau choisi et le pr\xE9nom, le nom, le t\xE9l\xE9phone, l'e-mail et l'adresse collect\xE9s.`;
}
function urgenceNumberBlock(raw) {
  const spoken = formatPhonePairs(raw);
  if (!hasEmergencyPhone(raw) || !spoken) {
    return `NUM\xC9RO D'URGENCE : aucun n'est renseign\xE9. En cat\xE9gorie C, ne donne aucun num\xE9ro personnel. Apr\xE8s les consignes de s\xE9curit\xE9, prends nom, pr\xE9nom, t\xE9l\xE9phone et adresse ; l'artisan rappelle au plus vite.`;
  }
  return `NUM\xC9RO D'URGENCE (uniquement en cat\xE9gorie C, jamais pour un appel non urgent) : ${spoken}.
Apr\xE8s les consignes de s\xE9curit\xE9, dis exactement : \xAB Un num\xE9ro d'urgence est disponible, vous pouvez le noter ? \xBB
ATTENDS la r\xE9ponse du client avant de le dicter.
S'il accepte, dicte-le lentement par paires : ${spoken}. Propose ensuite de le r\xE9p\xE9ter.
S'il refuse, ne le donne pas : prends ses coordonn\xE9es et l'artisan rappelle au plus vite.`;
}
function contactBlock(opts) {
  const ifMissing = opts.emailOptional ? "N'insiste pas sur l'e-mail s'il saute : dans ce cas, ne demande pas de l'\xE9peler." : "S'il n'a pas donn\xE9 d'e-mail, redemande-le, puis fais-le \xE9peler.";
  const role = opts.emailRole ? ` ${opts.emailRole}` : "";
  return `\xAB Pouvez-vous me donner votre nom, pr\xE9nom, email et num\xE9ro de t\xE9l\xE9phone ? \xBB Puis uniquement ce qui manque. ${ifMissing}
D\xE8s qu'un e-mail est donn\xE9 \u2014 m\xEAme s'il te para\xEEt clair, m\xEAme s'il l'a d\xE9j\xE0 dit en toutes lettres \u2014 demande TOUJOURS exactement : \xAB Pouvez-vous m'\xE9peler votre adresse email, s'il vous pla\xEEt ? \xBB S'il a d\xE9j\xE0 \xE9pel\xE9 lettre par lettre dans la m\xEAme r\xE9ponse, ne redemande pas : transcris et fais seulement la relecture br\xE8ve.
\xC9coute lettre par lettre. \xC9cris l'e-mail exactement comme \xE9pel\xE9, sans espaces : \xAB arobase \xBB, \xAB arobasse \xBB ou \xAB at \xBB \u2192 @ ; \xAB point \xBB \u2192 . ; \xAB tiret \xBB ou \xAB trait d'union \xBB \u2192 - ; \xAB underscore \xBB, \xAB tiret bas \xBB ou \xAB tiret du 8 \xBB \u2192 _. \xAB point com \xBB \u2192 .com, \xAB point fr \xBB \u2192 .fr. L'\xE9pellation prime sur ce qu'il a dict\xE9 avant : ne \xAB corrige \xBB pas l'orthographe. Si une partie est peu claire, redemande seulement cette partie, sans inventer.
Ensuite, une seule relecture br\xE8ve de cet e-mail (ex. \xAB Donc c'est [e-mail]. \xBB), sans \xAB C'est bien \xE7a ? \xBB ni \xAB Je relis \xBB. S'il corrige, reprends ; sinon encha\xEEne. Pas d'autre confirmation champ par champ.
Si le t\xE9l\xE9phone est peu clair, reformule-le naturellement, sans dire \xAB Je relis \xBB ni demander si c'est juste.
Ensuite, s\xE9par\xE9ment : \xAB Et l'adresse de votre domicile ? \xBB${role}`;
}
function buildInstructions(p) {
  const addr = p.address || "l'adresse de l'entreprise n'est pas renseign\xE9e, tu la transmets \xE0 l'artisan";
  const email = p.email || "l'e-mail n'est pas renseign\xE9, tu prends le message et l'artisan rappellera";
  const metier = (p.metier || "b\xE2timent").trim() || "b\xE2timent";
  const metierLarge = /b[aâ]timent|btp|multi[- ]?services|g[eé]n[eé]ral/i.test(metier);
  const champMetier = metierLarge ? "le multi-services BTP courant (plomberie, chauffage, \xE9lectricit\xE9, r\xE9novation, entretien des \xE9quipements du b\xE2timent)" : metier;
  const cfg = p.reception;
  const services = cfg?.services.map((x) => x.nom).join(", ") || "";
  const champ = services ? `${champMetier} \u2014 prestations list\xE9es par l'artisan : ${services}` : champMetier;
  const zone = cfg?.zone || `rayon ${p.rayon} autour de ${p.city}`;
  const horaires = formatHoraires(p.horaires);
  const priced = hasPricedService(cfg);
  const extra = formatConfigForPrompt(cfg);
  return `Tu es la secr\xE9taire de ${p.company}, entreprise de ${metier} \xE0 ${p.city} (rayon ${p.rayon}). Champ : ${champ}.

TON \u2014 Secr\xE9taire de PME du BTP, pas un robot. Fran\xE7ais, ${cfg?.tutoiement ? "tutoiement" : "vouvoiement"}. Phrases courtes. \xAB D'accord \xBB, \xAB Tr\xE8s bien \xBB, \xAB C'est not\xE9 \xBB, puis UNE question. Interdit : \xAB C'est bien \xE7a ? \xBB, \xAB Je relis \xBB, r\xE9p\xE9ter un num\xE9ro ou une adresse d\xE9j\xE0 confirm\xE9s, listes \xE0 voix haute, markdown, monologues. Un num\xE9ro se confirme UNE seule fois. Un seul r\xE9cap, juste avant de conclure. Tu ne te pr\xE9sentes pas \xE0 nouveau : l'accueil est d\xE9j\xE0 jou\xE9. Si on te demande si tu es une personne : \xAB Je suis l'assistante de ${p.company}, je prends votre demande et l'artisan vous rappelle. \xBB Ne le dis pas sinon. Ne prononce pas le pr\xE9nom de l'artisan : \xAB l'artisan \xBB, \xAB notre technicien \xBB, \xAB ${p.company} \xBB. Ne redemande jamais une info d\xE9j\xE0 donn\xE9e (sauf \xE9pellation de l'e-mail, une fois).

LEXIQUE (tu comprends et emploies ces mots, tu ne les corriges pas) : chaudi\xE8re, cumulus / ballon d'eau chaude, chauffe-eau, VMC, disjoncteur, tableau \xE9lectrique, fuite, d\xE9g\xE2t des eaux, robinetterie, mitigeur, siphon, WC, radiateur, pompe \xE0 chaleur, clim, carrelage, fa\xEFence, placo, enduit, ravalement, toiture, goutti\xE8re, tuile, zinguerie, menuiserie, volet roulant, canalisation, d\xE9bouchage, ramonage.

D\xC9ROUL\xC9 (dans cet ordre, une question \xE0 la fois)
1. Motif. 2. Urgence (\xE7a coule encore, plus de chauffage, plus d'\xE9lectricit\xE9, seul WC, gaz ?) \u2192 si oui C. 3. Nom et pr\xE9nom. 4. T\xE9l\xE9phone, confirm\xE9 une fois. 5. Adresse (+ code d'acc\xE8s si besoin). 6. Cr\xE9neau (A/B). 7. R\xE9cap court (nom, motif, lieu, date/heure). 8. Appelle save_call AVANT de dire au revoir. Puis seulement : \xAB Merci, au revoir. \xBB

A \u2014 Diagnostic (chaudi\xE8re, ballon non identique, PAC, tableau, panne, r\xE9novation, fuite \xE0 voir) : une question de pr\xE9cision, \xAB l'artisan doit passer pour un diagnostic, quand \xEAtes-vous disponible ? \xBB, puis vrais cr\xE9neaux (get_available_slots, jamais invent\xE9s, pas aujourd'hui sauf demande). Coordonn\xE9es : ${contactBlock({ emailRole: "L'e-mail sert \xE0 la confirmation du RDV." })} book_appointment. Si reason taken : deux alternatives. Si technical : suis l'instruction, ne dis jamais que le cr\xE9neau est pris. R\xE9cap, save_call (devis_demande false).

B \u2014 Devis maintenant (forfait entretien/ramonage/contrat, ou remplacement \xE0 l'identique : WC, robinet, mitigeur, lavabo, \xE9vier, ballon identique, prise, luminaire) : pr\xE9cisions, propose un devis (tarif list\xE9 seulement s'il existe, rien ne part sans l'artisan). Coordonn\xE9es : ${contactBlock({ emailRole: "L'e-mail sert \xE0 l'envoi du devis." })} Cr\xE9neau seulement s'il en veut, m\xEAmes r\xE8gles qu'en A. R\xE9cap, save_call (devis_demande true, type_demande devis).

C \u2014 Urgence (fuite active, d\xE9g\xE2t des eaux, plus de chauffage/eau chaude en hiver, panne \xE9lectrique, seul WC bouch\xE9, odeur de gaz) : rassurer, consigne utile (eau : vanne g\xE9n\xE9rale ; \xE9lectricit\xE9 : disjoncteur, rien de mouill\xE9 ; gaz : couper le gaz, aucun interrupteur, ouvrir, sortir, 112 et/ou GRDF 0 800 47 33 33).
${urgenceNumberBlock(p.telephoneUrgence)}
Coordonn\xE9es : ${contactBlock({ emailOptional: true })} rappel au plus vite, save_call (rappel_souhaite true, urgence urgent, type_demande urgence) AVANT au revoir. Hors gaz d\xE9j\xE0 aux secours : proposer une visite (A), pas de devis.

D \u2014 Rappel : seulement s'il n'est pas d\xE9j\xE0 pr\xE9vu. \xAB Souhaitez-vous \xEAtre rappel\xE9 ? \xBB + le moment.

${formatTarifsForPrompt(p.tarifs)}
Prix : uniquement les tarifs list\xE9s plus bas${priced ? " et les prix indicatifs des prestations de l'artisan" : ""}. Jamais le prix des travaux, jamais d'IBAN/carte. Zone : ${zone} (hors zone : le dire, prendre le num\xE9ro). Horaires : ${horaires || "semaine, 8 h\u201318 h"}. Suivi RDV / facture / r\xE9clamation : noter, l'artisan rappelle.

Entreprise : ${p.company}, ${addr}, ${email}.${extra ? `
${extra}` : ""}`;
}
var VOICE_TOOLS = [
  {
    type: "function",
    name: "get_available_slots",
    description: "Consulte l'agenda r\xE9el et renvoie les cr\xE9neaux libres (lundi\u2013vendredi, 8 h\u201318 h, heure de Paris). \xC0 appeler apr\xE8s que le client a indiqu\xE9 une p\xE9riode, si aucun cr\xE9neau pr\xE9charg\xE9 ne correspond, ou si la liste pr\xE9charg\xE9e est vide. Passe date_from, date_to ou preferred_day d'apr\xE8s sa r\xE9ponse. N'annonce pas \xAB Je regarde\u2026 \xBB : le syst\xE8me le dit si l'appel r\xE9seau est lent.",
    parameters: {
      type: "object",
      properties: {
        date_from: { type: "string", description: "D\xE9but de p\xE9riode YYYY-MM-DD" },
        date_to: { type: "string", description: "Fin de p\xE9riode YYYY-MM-DD" },
        preferred_day: { type: "string", description: "Jour souhait\xE9 : lundi\u2026vendredi, aujourd'hui, demain, ou YYYY-MM-DD" },
        duree_minutes: { type: "number", description: "Dur\xE9e en minutes, 60 par d\xE9faut" }
      }
    }
  },
  {
    type: "function",
    name: "book_appointment",
    description: "R\xE9serve le cr\xE9neau choisi APR\xC8S avoir collect\xE9 pr\xE9nom, nom, t\xE9l\xE9phone, e-mail et adresse. V\xE9rifie qu'il est encore libre ; s'il est pris (reason taken), renvoie des alternatives sans l'enregistrer. reason technical = souci technique : le cr\xE9neau N'EST PAS pris, suis le champ instruction.",
    parameters: {
      type: "object",
      properties: {
        prenom: { type: "string", description: "Pr\xE9nom du client" },
        nom: { type: "string", description: "Nom de famille du client" },
        client: { type: "string", description: "Nom complet (pr\xE9nom + nom) si prenom et nom ne sont pas envoy\xE9s s\xE9par\xE9ment" },
        telephone: { type: "string", description: "Num\xE9ro de t\xE9l\xE9phone" },
        email: { type: "string", description: "E-mail du client tel qu'\xE9pel\xE9 (arobase \u2192 @, point \u2192 ., tiret \u2192 -, underscore \u2192 _) : confirmation du RDV (A) ou envoi du devis (B : forfait ou remplacement simple \xE0 l'identique)" },
        date: { type: "string", description: "Date du rendez-vous au format YYYY-MM-DD" },
        heure: { type: "string", description: "Heure de d\xE9but au format HH:MM (24 h)" },
        duree_minutes: { type: "number", description: "Dur\xE9e en minutes, 60 par d\xE9faut" },
        objet: { type: "string", description: "Motif du rendez-vous, ex. Diagnostic chaudi\xE8re" },
        adresse: { type: "string", description: "Adresse compl\xE8te du chantier" },
        ville: { type: "string" },
        notes: { type: "string" }
      },
      required: ["prenom", "nom", "telephone", "email", "adresse", "date", "heure", "objet"]
    }
  },
  {
    type: "function",
    name: "save_call",
    description: "Enregistre le bilan de l'appel dans R\xE9ception. \xC0 appeler apr\xE8s le r\xE9capitulatif, ou juste avant de conclure. Inclure toutes les informations collect\xE9es. N'entra\xEEne pas la g\xE9n\xE9ration automatique d'un devis.",
    parameters: {
      type: "object",
      properties: {
        nom_client: { type: "string" },
        telephone_client: { type: "string" },
        adresse: { type: "string" },
        ville: { type: "string" },
        code_postal: { type: "string" },
        motif: { type: "string", description: "Sujet court, ex. Fuite sous \xE9vier" },
        besoin_detail: { type: "string" },
        resume: { type: "string", description: "R\xE9sum\xE9 complet de l'appel en 2 \xE0 4 phrases" },
        type_demande: {
          type: "string",
          enum: ["urgence", "depannage", "devis", "rdv", "suivi", "reclamation", "facture", "commercial", "autre"]
        },
        urgence: { type: "string", enum: ["normal", "urgent"] },
        a_rappeler: { type: "boolean", description: "Identique \xE0 rappel_souhaite : true si le client souhaite \xEAtre rappel\xE9 par l'artisan" },
        rappel_souhaite: { type: "boolean", description: "true si le client souhaite \xEAtre rappel\xE9 par l'artisan / l'ouvrier" },
        rappel_creneau: { type: "string", description: "Moment pr\xE9f\xE9r\xE9 pour le rappel, texte libre (ex. demain matin, cet apr\xE8s-midi). Uniquement si rappel_souhaite est true." },
        devis_demande: { type: "boolean", description: "true en cat\xE9gorie B (forfait / entretien / ramonage / contrat, ou remplacement simple \xE0 l'identique : WC, robinet, mitigeur, chasse d'eau, lavabo, \xE9vier, ballon identique, prise, interrupteur, luminaire). false en cat\xE9gorie A (diagnostic) et hors prestation. Note seulement la demande : l'artisan g\xE9n\xE9rera le brouillon depuis la fiche client." },
        email_client: { type: "string", description: "E-mail du client tel qu'\xE9pel\xE9 (arobase \u2192 @, point \u2192 ., tiret \u2192 -, underscore \u2192 _) : envoi du devis (B) ou confirmation du rendez-vous (A)." },
        rdv_pris: { type: "boolean" },
        notes: { type: "string" }
      },
      required: ["resume"]
    }
  }
];
var TURN_DETECTION = {
  type: "server_vad",
  // xAI documente server_vad + idle_timeout_ms (pas semantic_vad / eagerness).
  // silence_duration plus court = elle répond plus vite ; 330 ms reste assez long pour ne pas couper le client.
  threshold: 0.72,
  silence_duration_ms: 330,
  prefix_padding_ms: 200,
  idle_timeout_ms: 8e3
};
function buildSessionConfig(p, sampleRate, slotsNote) {
  const keyterms = [...KEYTERMS];
  if (p.company && !keyterms.includes(p.company)) keyterms.push(p.company.slice(0, 50));
  const cfg = p.reception || normalizeConfig(null);
  const replace = replaceMap(cfg);
  return {
    voice: cfg.voice || VOICE_ID,
    instructions: buildInstructions(p) + (slotsNote || ""),
    ...replace ? { replace } : {},
    reasoning: { effort: "none" },
    turn_detection: TURN_DETECTION,
    tools: VOICE_TOOLS,
    audio: {
      input: {
        format: { type: "audio/pcm", rate: sampleRate },
        transcription: { language_hint: "fr", model: "grok-transcribe", keyterms }
      },
      output: {
        format: { type: "audio/pcm", rate: 24e3 },
        speed: cfg.speed || 1
      }
    }
  };
}

// ../src/lib/voice/callDebrief.ts
var norm = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
var EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
var SLOT = /\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|demain)?\s*(?:\d{1,2}\s*(?:\/|janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\s*\d{0,4})?\s*(?:à\s*)?(\d{1,2})\s*(?:h|heures?)\s*(\d{0,2})?/i;
function pickEmail(lines) {
  for (const l of [...lines].reverse()) {
    const m = l.text.match(EMAIL);
    if (m) return m[0].toLowerCase();
  }
  return "";
}
function pickPhone(lines, fallbackFrom = "") {
  for (const l of [...lines].reverse()) {
    const digits = l.text.replace(/[^\d+]/g, "");
    if (digits.length >= 10) {
      let d = digits.replace(/^00/, "+");
      if (/^0[1-9]\d{8}$/.test(d)) d = `+33${d.slice(1)}`;
      if (/^\+33\d{9}$/.test(d) || /^0[1-9]\d{8}$/.test(d)) return d.startsWith("+") ? d : `+33${d.slice(1)}`;
    }
  }
  const fb = fallbackFrom.replace(/[^\d+]/g, "");
  if (fb.length >= 11 && fb.startsWith("+")) return fb;
  return "";
}
function pickName(lines) {
  const patts = [
    /(?:je m['’]?appelle|mon nom est|c'est|je suis)\s+([A-ZÀ-ÖØ-Þ][\p{L}'-]+(?:\s+[A-ZÀ-ÖØ-Þ][\p{L}'-]+){0,2})/iu,
    /(?:nom|prénom)\s*[,:]?\s*([A-ZÀ-ÖØ-Þ][\p{L}'-]+(?:\s+[A-ZÀ-ÖØ-Þ][\p{L}'-]+){0,2})/iu
  ];
  for (const l of lines) {
    if (l.role !== "user") continue;
    for (const p of patts) {
      const m = l.text.match(p);
      if (m?.[1] && m[1].length > 2 && !/^(oui|non|bonjour|merci)$/i.test(m[1])) return m[1].trim();
    }
  }
  return "";
}
function pickAddress(lines) {
  for (const l of [...lines].reverse()) {
    const t = l.text;
    if (/^\d+\s+(rue|avenue|boulevard|impasse|place|chemin|allée)/i.test(t) || /\d{5}\s+[A-Za-zÀ-ÿ]/.test(t)) return t.slice(0, 220);
    const m = t.match(/(?:adresse|habite|situé)[^.]*?(\d+[^.]{8,80})/i);
    if (m?.[1]) return m[1].trim();
  }
  return "";
}
function pickMotif(lines) {
  const user = lines.filter((l) => l.role === "user").map((l) => l.text).join(" ");
  const m = user.match(/(?:fuite|chaudière|ballon|dépannage|devis|robinet|évier|salle de bain|chauffage|électricité|plomberie|rénovation)[^.!?]{0,80}/i);
  return m ? m[0].trim() : "";
}
function pickSlot(lines) {
  for (const l of [...lines].reverse()) {
    const m = l.text.match(SLOT);
    if (m) return [m[1], m[2], m[3]].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  }
  return "";
}
function debriefFromTranscript(lines, from, booked) {
  const nom = pickName(lines);
  const tel = pickPhone(lines, from);
  const email = pickEmail(lines);
  const adresse = pickAddress(lines);
  const motif = pickMotif(lines) || "Demande d'intervention";
  const slot = pickSlot(lines);
  const rdv = booked?.start ? new Date(booked.start).toLocaleString("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : slot;
  const issue = booked ? `Rendez-vous confirm\xE9${rdv ? ` : ${rdv}` : ""}.` : /pris|indisponible|alternativ/i.test(lines.slice(-4).map((l) => l.text).join(" ")) ? "Cr\xE9neau demand\xE9 : \xE0 confirmer avec le client." : "\xC0 rappeler pour finaliser.";
  const resume = [motif, tel ? `T\xE9l. ${tel}` : "", email ? `E-mail ${email}` : "", adresse ? `Adresse : ${adresse}` : "", rdv || slot ? `Cr\xE9neau : ${rdv || slot}` : "", issue].filter(Boolean).join(" \xB7 ").slice(0, 600);
  const nom_client = nom || (tel ? tel : from ? "Appelant" : "Appel t\xE9l\xE9phonique");
  const type_demande = /devis/i.test(norm(lines.map((l) => l.text).join(" "))) ? "devis" : "autre";
  return {
    nom_client,
    telephone_client: tel || from || "",
    email_client: email,
    adresse,
    ville: "",
    motif,
    resume,
    besoin_detail: motif,
    type_demande,
    rappel_souhaite: !booked
  };
}

// src/audio.ts
var BIAS = 132;
function ulawToPcm(u) {
  u = ~u & 255;
  const sign = u & 128, exp = u >> 4 & 7, man = u & 15;
  let s = ((man << 3) + BIAS << exp) - BIAS;
  return sign ? -s : s;
}
var CallRecorder = class {
  inb = [];
  out = /* @__PURE__ */ new Map();
  outPos = 0;
  max;
  constructor(maxSeconds = 20 * 60) {
    this.max = maxSeconds * 8e3;
  }
  /** Audio de l'appelant : Twilio envoie 20 ms toutes les 20 ms, silence compris. */
  addInbound(b64) {
    const buf = Buffer.from(b64, "base64");
    for (const u of buf) if (this.inb.length < this.max) this.inb.push(ulawToPcm(u));
  }
  /** Audio de l'IA : arrive plus vite que le temps réel, Twilio le joue à la suite. */
  addOutbound(b64) {
    const buf = Buffer.from(b64, "base64");
    if (this.outPos < this.inb.length) this.outPos = this.inb.length;
    for (const u of buf) {
      if (this.outPos >= this.max) break;
      this.out.set(this.outPos++, ulawToPcm(u));
    }
  }
  /** Coupure (l'appelant parle) : ce qui n'a pas encore été joué est effacé. */
  clearOutbound() {
    for (let i = this.inb.length; i < this.outPos; i++) this.out.delete(i);
    this.outPos = this.inb.length;
  }
  get seconds() {
    return this.inb.length / 8e3;
  }
  /** WAV PCM 16 bits mono 8 kHz (mix des deux pistes). */
  toWav() {
    const n = Math.max(this.inb.length, Math.min(this.outPos, this.max));
    const data = Buffer.alloc(n * 2);
    for (let i = 0; i < n; i++) {
      const v = (this.inb[i] || 0) + (this.out.get(i) || 0);
      data.writeInt16LE(Math.max(-32768, Math.min(32767, v)), i * 2);
    }
    const h = Buffer.alloc(44);
    h.write("RIFF", 0);
    h.writeUInt32LE(36 + data.length, 4);
    h.write("WAVE", 8);
    h.write("fmt ", 12);
    h.writeUInt32LE(16, 16);
    h.writeUInt16LE(1, 20);
    h.writeUInt16LE(1, 22);
    h.writeUInt32LE(8e3, 24);
    h.writeUInt32LE(16e3, 28);
    h.writeUInt16LE(2, 32);
    h.writeUInt16LE(16, 34);
    h.write("data", 36);
    h.writeUInt32LE(data.length, 40);
    return Buffer.concat([h, data]);
  }
};

// src/token.ts
import { createHmac, timingSafeEqual } from "node:crypto";
function signToken(secret, artisanId, callSid, exp) {
  return createHmac("sha256", secret).update(`${artisanId}.${callSid}.${exp}`).digest("hex");
}
function verifyToken(secret, p, now = Date.now()) {
  const exp = Number(p.exp);
  if (!secret || !p.token || !p.artisan_id || !p.call_sid || !Number.isFinite(exp) || exp * 1e3 < now) return false;
  const a = Buffer.from(signToken(secret, p.artisan_id, p.call_sid, exp)), b = Buffer.from(String(p.token));
  return a.length === b.length && timingSafeEqual(a, b);
}

// src/server.ts
var E = process.env;
var PORT = Number(E.PORT || 8080);
var XAI_URL = E.XAI_REALTIME_URL || "wss://api.x.ai/v1/realtime?model=grok-voice-latest";
var APP_URL = (E.APP_URL || "https://akno-ai-app-v2.vercel.app").replace(/\/$/, "");
var SB_URL = (E.SUPABASE_URL || "").replace(/\/$/, "");
var SB_KEY = E.SUPABASE_SERVICE_ROLE_KEY || "";
var MAX_CALL_S = Number(E.MAX_CALL_SECONDS || 900);
var log = (...a) => console.log((/* @__PURE__ */ new Date()).toISOString(), ...a);
async function sb(path, init = {}) {
  if (!SB_URL || !SB_KEY) {
    log("[sb] non configur\xE9, ignor\xE9 :", path);
    return null;
  }
  const r = await fetch(`${SB_URL}${path}`, { ...init, headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", ...init.headers || {} } });
  if (!r.ok) {
    log("[sb]", r.status, path, (await r.text().catch(() => "")).slice(0, 200));
    return null;
  }
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}
var PROFILE_CACHE_TTL_MS = 10 * 6e4;
var profileCache = /* @__PURE__ */ new Map();
function profileFromCache(artisanId) {
  const hit = profileCache.get(artisanId);
  if (!hit || Date.now() - hit.at > PROFILE_CACHE_TTL_MS) return null;
  return hit.profile;
}
function putProfileCache(artisanId, profile) {
  profileCache.set(artisanId, { profile, at: Date.now() });
}
async function loadProfile(artisanId) {
  const rows = await sb(`/rest/v1/artisans?id=eq.${artisanId}&select=*`);
  const a = Array.isArray(rows) ? rows[0] || {} : {};
  const profile = mergeProfile({
    prenom: a.prenom || "",
    company: companyName(a.nom_entreprise, a.entreprise_nom),
    email: a.entreprise_email || a.email || "",
    phone: a.entreprise_telephone || a.telephone || "",
    address: a.entreprise_adresse || "",
    city: a.entreprise_cp_ville || "",
    tarifs: a.tarifs && typeof a.tarifs === "object" ? a.tarifs : void 0,
    telephoneUrgence: typeof a.telephone_urgence === "string" ? a.telephone_urgence : "",
    accueil: typeof a.message_accueil === "string" ? a.message_accueil.slice(0, 300) : "",
    metier: typeof a.entreprise_metier === "string" ? a.entreprise_metier.slice(0, 80) : "",
    horaires: a.horaires && typeof a.horaires === "object" ? a.horaires : void 0,
    reception: a.reception_config && typeof a.reception_config === "object" ? a.reception_config : void 0
  });
  putProfileCache(artisanId, profile);
  return profile;
}
function phoneNote(p, from) {
  return `

CONTEXTE T\xC9L\xC9PHONE : vrai appel sur la ligne de ${p.company} (l'artisan n'a pas pu d\xE9crocher, l'appel t'a \xE9t\xE9 renvoy\xE9). Num\xE9ro de l'appelant : ${from || "masqu\xE9"}. Si ce num\xE9ro est connu, demande simplement si l'on peut le rappeler sur ce num\xE9ro au lieu de le faire dicter. Quand tout est not\xE9 et que le client a dit au revoir, conclus en une phrase courte.`;
}
function twilioSession(p, slotsNote, from) {
  const session = buildSessionConfig(p, 8e3, slotsNote + phoneNote(p, from));
  session.audio.input.format = { type: "audio/pcmu" };
  session.audio.output.format = { type: "audio/pcmu" };
  return session;
}
var APP_TIMEOUT_MS = Number(E.APP_TIMEOUT_MS || 8e3);
async function akno(path, artisanId, body, ms = APP_TIMEOUT_MS) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms), t0 = Date.now();
  try {
    const r = await fetch(`${APP_URL}${path}`, { method: "POST", signal: ctl.signal, headers: { "Content-Type": "application/json", "x-akno-bridge": E.BRIDGE_SECRET || "", "x-akno-artisan": artisanId }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => null);
    if (!j || typeof j !== "object") return { ok: false, error: `HTTP ${r.status}`, _status: r.status, _fail: "http" };
    if (!r.ok && r.status !== 409) log("[app]", path, body.action || body.type || "", r.status, `${Date.now() - t0}ms`);
    return { ...j, _status: r.status, ...r.ok || r.status === 409 ? {} : { _fail: "http" } };
  } catch (e) {
    const timeout = e?.name === "AbortError";
    log("[app]", path, body.action || body.type || "", timeout ? `timeout ${ms}ms` : `r\xE9seau ${e?.message || e}`);
    return { ok: false, error: timeout ? "L'agenda met trop de temps \xE0 r\xE9pondre." : "Agenda injoignable.", _fail: timeout ? "timeout" : "network" };
  } finally {
    clearTimeout(t);
  }
}
function isBusinessRefusal(b) {
  if (b.ok) return false;
  if (b._fail) return false;
  if (b.reason) return b.reason === "taken" || b.reason === "invalid";
  return b._status === 409;
}
var TECH_BOOK = "PROBL\xC8ME TECHNIQUE : la r\xE9servation n'a pas pu \xEAtre confirm\xE9e (agenda injoignable). Ne dis JAMAIS que le cr\xE9neau est pris. Dis : \xAB Je n'arrive pas \xE0 confirmer le rendez-vous pour un souci technique. Je note votre demande pour ce cr\xE9neau et l'artisan vous rappelle pour le confirmer. \xBB Puis termine normalement ; save_call avec rdv_pris false et rappel_souhaite true.";
var TECH_SLOTS = "PROBL\xC8ME TECHNIQUE : l'agenda ne r\xE9pond pas. N'invente aucun cr\xE9neau. Note les disponibilit\xE9s du client ; l'artisan le rappelle pour fixer le rendez-vous (rappel_souhaite true).";
var transcriptText = (lines) => lines.map((l) => `${l.role === "assistant" ? "Akno" : "Client"}: ${l.text.trim()}`).filter((l) => !l.endsWith(":")).join("\n");
function handleCall(tw) {
  let streamSid = "", callSid = "", artisanId = "", from = "";
  let xai = null, ready = false, closed = false, saved = false, callId = null;
  let profile = mergeProfile();
  const lines = [];
  const rec = new CallRecorder();
  const startedAt = Date.now();
  let assistantBuf = "", greeting = true;
  let maxTimer = null;
  let booked = null;
  let bookFailed = null;
  let bookQueue = Promise.resolve();
  let lastBookKey = "";
  let ringT0 = 0;
  let firstAudioLogged = false;
  let slotsHintText = "";
  let voiceReverted = false;
  const latency = (tag) => {
    if (!ringT0) return;
    log("[latency]", tag, `${Date.now() - ringT0}ms`, "call", callSid ? callSid.slice(-8) : "?");
  };
  const toTwilio = (m) => {
    if (tw.readyState === WebSocket.OPEN) tw.send(JSON.stringify(m));
  };
  const toXai = (m) => {
    if (xai?.readyState === WebSocket.OPEN) xai.send(JSON.stringify(m));
  };
  async function upsertCall(fields) {
    const row = { artisan_id: artisanId, twilio_call_sid: callSid, source: "ia_telephone", ...fields };
    const out = await sb(`/rest/v1/calls?on_conflict=twilio_call_sid&select=id`, { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(row) });
    const id = Array.isArray(out) && out[0]?.id;
    if (id) callId = Number(id);
    return callId;
  }
  async function saveCall(args) {
    const urgent = args.urgence === "urgent" || args.type_demande === "urgence";
    let rappel = args.rappel_souhaite === true || args.rappel_souhaite == null && args.a_rappeler === true;
    const wantDevis = args.devis_demande === true || args.type_demande === "devis";
    let type = String(args.type_demande || "").trim() || "autre";
    if (wantDevis && type === "autre") type = "devis";
    const resume = String(args.resume || "").trim() || "Appel t\xE9l\xE9phonique re\xE7u par la r\xE9ceptionniste.";
    const unconfirmed = !booked && (args.rdv_pris === true || !!bookFailed);
    if (unconfirmed) rappel = true;
    const noteRdv = unconfirmed ? `RDV demand\xE9 mais NON confirm\xE9${bookFailed ? ` (${bookFailed})` : ""} \u2014 rappeler le client pour le fixer.` : "";
    const row = {
      nom_client: String(args.nom_client || "").trim() || "Appel t\xE9l\xE9phonique",
      telephone_client: String(args.telephone_client || "").trim() || from || null,
      motif: String(args.motif || "").trim() || args.type_demande || "Appel",
      besoin_detail: String(args.besoin_detail || "").trim() || null,
      resume,
      code_postal: String(args.code_postal || "").trim() || null,
      ville: String(args.ville || "").trim() || null,
      adresse: String(args.adresse || "").trim() || null,
      type_demande: type,
      urgence: urgent ? "urgent" : "normal",
      email_client: String(args.email_client || "").trim() || null,
      statut: rappel ? "a_rappeler" : booked ? "rdv_pris" : "renseigne",
      rdv_date: booked?.start || null,
      notes: [String(args.notes || "").trim(), noteRdv].filter(Boolean).join(" \u2014 ") || null,
      rappel_souhaite: rappel,
      rappel_creneau: rappel ? String(args.rappel_creneau || "").trim() || null : null,
      transcript: transcriptText(lines) || null,
      duration: Math.round((Date.now() - startedAt) / 1e3)
    };
    const id = await upsertCall(row);
    saved = true;
    if (id && booked?.appointmentId) void sb(`/rest/v1/appointments?id=eq.${booked.appointmentId}`, { method: "PATCH", body: JSON.stringify({ call_id: id }) });
    void akno("/api/notify", artisanId, { type: "call", client: row.nom_client, motif: row.motif, resume, besoin_detail: row.besoin_detail, call_id: id, rappel_souhaite: rappel, rappel_creneau: row.rappel_creneau, urgent });
    return { ok: true, call_id: id, message: wantDevis ? "Appel enregistr\xE9. Demande de devis not\xE9e \u2014 \xE0 g\xE9n\xE9rer depuis la fiche client." : "Appel enregistr\xE9 dans R\xE9ception." };
  }
  const bookSlotKey = (a) => `${String(a.date || "").trim()}|${String(a.heure || "").trim().toLowerCase().replace("h", ":")}`;
  async function book(args) {
    const run = async () => {
      const key = bookSlotKey(args);
      if (booked && lastBookKey === key) {
        return { ok: true, appointment_id: booked.appointmentId, confirmation: `Rendez-vous confirm\xE9 pour ${[args.prenom, args.nom].filter(Boolean).join(" ") || args.client || "le client"}.` };
      }
      const client = [args.prenom, args.nom].map((x) => String(x || "").trim()).filter(Boolean).join(" ") || String(args.client || "").trim() || "Client";
      const t0 = Date.now();
      let b = await akno("/api/booking", artisanId, { action: "book", ...args, client });
      const slot = [args.date, args.heure].filter(Boolean).join(" \xE0 ");
      if (!b.ok && (b._fail === "timeout" || b._fail === "network")) {
        b = await akno("/api/booking", artisanId, { action: "book", ...args, client }, Math.max(APP_TIMEOUT_MS, 12e3));
      }
      log("[book]", b.ok ? "ok" : `refus ${b.reason || b._fail || b._status}`, `${Date.now() - t0}ms`);
      if (!b.ok) {
        if (isBusinessRefusal(b)) return { ok: false, reason: b.reason || "taken", error: b.error || "Cr\xE9neau indisponible.", alternatives: b.alternatives || [] };
        bookFailed = slot || "cr\xE9neau demand\xE9";
        return { ok: false, reason: "technical", error: "Souci technique : r\xE9servation non confirm\xE9e.", instruction: TECH_BOOK, alternatives: [] };
      }
      const minutes = Math.max(30, Number(args.duree_minutes) || 60);
      const start2 = b.start || (/* @__PURE__ */ new Date()).toISOString();
      const row = {
        artisan_id: artisanId,
        title: String(args.objet || "").trim() || "Rendez-vous",
        client,
        telephone_client: String(args.telephone || "").trim() || from || null,
        email_client: String(args.email || "").trim() || null,
        start: start2,
        end: b.end || new Date(new Date(start2).getTime() + minutes * 6e4).toISOString(),
        adresse: String(args.adresse || "").trim() || null,
        ville: String(args.ville || "").trim() || null,
        notes: [String(args.notes || "").trim(), b.cal_uid ? `cal:${b.cal_uid}` : ""].filter(Boolean).join(" ") || null
      };
      const exists = !!b.appointment_id;
      const ins = exists ? null : await sb(`/rest/v1/appointments?select=id`, { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(row) });
      const appointmentId = b.appointment_id || (Array.isArray(ins) ? ins[0]?.id : null);
      if (!appointmentId && !b.cal_uid) {
        bookFailed = slot || "cr\xE9neau demand\xE9";
        return { ok: false, reason: "technical", error: "Souci technique : r\xE9servation non enregistr\xE9e.", instruction: TECH_BOOK, alternatives: [] };
      }
      booked = { start: start2, appointmentId: appointmentId || null };
      lastBookKey = key;
      bookFailed = null;
      void akno("/api/notify", artisanId, { type: "appointment", client, when: [args.date, args.heure].filter(Boolean).join(" \xE0 ") || b.label || "Nouveau rendez-vous", appointment_id: appointmentId });
      return { ok: true, appointment_id: appointmentId, confirmation: b.confirmation || `Rendez-vous confirm\xE9 pour ${client}.` };
    };
    const p = bookQueue.then(run, run);
    bookQueue = p.catch(() => void 0);
    return p;
  }
  async function handleTool(ev) {
    let result = { ok: false, error: "Outil inconnu." };
    try {
      const args = ev.arguments ? JSON.parse(ev.arguments) : {};
      if (ev.name === "get_available_slots") {
        const b = await akno("/api/booking", artisanId, { action: "slots", ...args });
        result = b.ok ? { ok: true, slots: b.slots || [], timezone: b.timezone } : { ok: false, reason: "technical", slots: [], error: b.error || "Agenda injoignable.", instruction: TECH_SLOTS };
      } else if (ev.name === "book_appointment") result = await book(args);
      else if (ev.name === "save_call") result = await saveCall(args);
    } catch (e) {
      log("[tool]", ev.name, e);
      result = { ok: false, error: "Erreur pendant l'op\xE9ration." };
    }
    toXai({ type: "conversation.item.create", item: { type: "function_call_output", call_id: ev.call_id, output: JSON.stringify(result) } });
    toXai({ type: "response.create" });
  }
  const fallbackBuiltinVoice = (detail) => {
    if (voiceReverted) return;
    const cur = normalizeConfig(profile.reception).voice;
    if (cur === DEFAULT_VOICE) return;
    const msg = typeof detail === "string" ? detail : JSON.stringify(detail || "").slice(0, 280);
    if (!/(^|[^a-z])voice|voice[_-]?id|custom.?voice|invalid.*session|session.*invalid|unknown voice/i.test(msg)) return;
    voiceReverted = true;
    log("[voice] repli voix int\xE9gr\xE9e", String(cur).slice(0, 12), "\u2192", DEFAULT_VOICE);
    profile = { ...profile, reception: { ...normalizeConfig(profile.reception), voice: DEFAULT_VOICE } };
    if (closed || !xai || xai.readyState !== WebSocket.OPEN) return;
    if (ready) patchSession();
    else toXai({ type: "session.update", session: twilioSession(profile, slotsHintText, from) });
  };
  function onXai(raw) {
    let ev;
    try {
      ev = JSON.parse(raw.toString());
    } catch {
      return;
    }
    const type = String(ev.type || "");
    if (type === "session.updated" && !ready) {
      ready = true;
      latency("session.updated");
      toXai({ type: "conversation.item.create", item: { type: "force_message", role: "assistant", interruptible: false, content: [{ type: "output_text", text: welcomeLine(profile) }] } });
      return;
    }
    if (type === "response.output_audio.delta" || type === "response.audio.delta") {
      const d = String(ev.delta || ev.audio || "");
      if (d && streamSid) {
        if (!firstAudioLogged) {
          firstAudioLogged = true;
          latency("first audio delta");
        }
        rec.addOutbound(d);
        toTwilio({ event: "media", streamSid, media: { payload: d } });
      }
      return;
    }
    if (type === "input_audio_buffer.speech_started" && !greeting) {
      if (streamSid) toTwilio({ event: "clear", streamSid });
      rec.clearOutbound();
      return;
    }
    if (type === "conversation.item.input_audio_transcription.completed") {
      const t = String(ev.transcript || "").trim();
      if (t) lines.push({ role: "user", text: t });
      return;
    }
    if (type === "response.output_audio_transcript.delta") {
      assistantBuf += String(ev.delta || "");
      return;
    }
    if (type === "response.output_audio_transcript.done") {
      const t = String(ev.transcript || assistantBuf).trim();
      assistantBuf = "";
      if (t) lines.push({ role: "assistant", text: t });
      return;
    }
    if (type === "response.done" || type === "response.output_audio.done") {
      greeting = false;
      return;
    }
    if (type === "response.function_call_arguments.done") {
      void handleTool(ev);
      return;
    }
    if (type === "error") {
      const snippet = JSON.stringify(ev.error || ev).slice(0, 300);
      log("[xai] error", snippet);
      fallbackBuiltinVoice(snippet);
    }
  }
  const patchSession = () => {
    if (closed || !xai || xai.readyState !== WebSocket.OPEN || !ready) return;
    toXai({ type: "session.update", session: twilioSession(profile, slotsHintText, from) });
  };
  async function start(params) {
    if (!verifyToken(E.BRIDGE_SECRET || "", params)) {
      log("[call] jeton invalide, raccroche");
      tw.close();
      return;
    }
    artisanId = params.artisan_id;
    from = params.from || "";
    ringT0 = Date.now();
    latency("twilio start");
    log("[call] start", callSid, "artisan", artisanId.slice(0, 8));
    profile = profileFromCache(artisanId) || mergeProfile();
    slotsHintText = "";
    void loadProfile(artisanId).then((p) => {
      profile = p;
      if (!ready && xai?.readyState === WebSocket.OPEN) {
        toXai({ type: "session.update", session: twilioSession(profile, slotsHintText, from) });
      } else if (ready) patchSession();
    }).catch((e) => log("[call] profile", e));
    void akno("/api/booking", artisanId, { action: "slots" }).then((b) => {
      const slots = Array.isArray(b.slots) ? b.slots : [];
      slotsHintText = formatSlotsHint(slots);
      patchSession();
    }).catch(() => {
    });
    if (closed) return;
    xai = new WebSocket(XAI_URL, { headers: { Authorization: `Bearer ${E.XAI_API_KEY || ""}` } });
    xai.on("open", () => {
      latency("xai open");
      toXai({ type: "session.update", session: twilioSession(profile, slotsHintText, from) });
    });
    xai.on("message", onXai);
    xai.on("close", (c) => {
      log("[xai] close", c);
      if (!closed) tw.close();
    });
    xai.on("error", (e) => log("[xai] ws error", e.message));
    maxTimer = setTimeout(() => {
      log("[call] dur\xE9e max atteinte");
      tw.close();
    }, MAX_CALL_S * 1e3);
  }
  async function finish() {
    if (closed) return;
    closed = true;
    if (maxTimer) clearTimeout(maxTimer);
    try {
      xai?.close();
    } catch {
    }
    if (!artisanId || !callSid) return;
    const duration = Math.round((Date.now() - startedAt) / 1e3);
    try {
      await new Promise((r) => setTimeout(r, 750));
      const inferred = debriefFromTranscript(lines, from, booked);
      if (!saved && duration > 4) {
        await saveCall({ ...inferred, rdv_pris: !!booked, rappel_souhaite: !booked, type_demande: inferred.type_demande, urgence: "normal" });
      } else if (saved) {
        const patch = { transcript: transcriptText(lines) || null, duration };
        if (inferred.nom_client && inferred.nom_client !== "Appel t\xE9l\xE9phonique") patch.nom_client = inferred.nom_client;
        if (inferred.resume && lines.length > 2) patch.resume = inferred.resume;
        if (inferred.telephone_client) patch.telephone_client = inferred.telephone_client;
        if (inferred.email_client) patch.email_client = inferred.email_client;
        if (inferred.adresse) patch.adresse = inferred.adresse;
        if (inferred.motif) patch.motif = inferred.motif;
        if (booked?.start) patch.rdv_date = booked.start;
        await upsertCall(patch);
      }
      if (callId && rec.seconds > 1 && SB_URL && SB_KEY) {
        const path = `${artisanId}/${callId}.wav`;
        const r = await fetch(`${SB_URL}/storage/v1/object/recordings/${path}`, { method: "POST", headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "audio/wav", "x-upsert": "true" }, body: new Uint8Array(rec.toWav()) });
        if (r.ok) await sb(`/rest/v1/calls?id=eq.${callId}`, { method: "PATCH", body: JSON.stringify({ recording_url: path }) });
        else log("[rec] upload", r.status);
      }
    } catch (e) {
      log("[call] finish", e);
    }
    log("[call] end", callSid, `${duration}s`, `${lines.length} r\xE9pliques`);
  }
  tw.on("message", (raw) => {
    let m;
    try {
      m = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (m.event === "start") {
      streamSid = m.start?.streamSid || m.streamSid || "";
      callSid = m.start?.callSid || "";
      const params = { ...m.start?.customParameters || {} };
      if (params.call_sid && callSid && params.call_sid !== callSid) {
        tw.close();
        return;
      }
      void start(params).catch((e) => {
        log("[call] start", e);
        tw.close();
      });
    } else if (m.event === "media" && m.media?.payload) {
      rec.addInbound(m.media.payload);
      if (ready) toXai({ type: "input_audio_buffer.append", audio: m.media.payload });
    } else if (m.event === "stop") {
      tw.close();
    }
  });
  tw.on("close", () => {
    void finish();
  });
  tw.on("error", (e) => log("[twilio] ws error", e.message));
}
var server = http.createServer((req, res) => {
  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }
  res.writeHead(404);
  res.end();
});
var wss = new WebSocketServer({ noServer: true });
server.on("upgrade", (req, socket, head) => {
  if (!req.url?.startsWith("/twilio")) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => handleCall(ws));
});
server.listen(PORT, () => {
  const miss = ["XAI_API_KEY", "BRIDGE_SECRET", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].filter((k) => !E[k]);
  log(`[bridge] \xE9coute sur :${PORT}${miss.length ? ` \u2014 variables manquantes : ${miss.join(", ")}` : ""}`);
});
