const fs = require("fs");
const vm = require("vm");

const elements = new Map();
function element(name) {
  if (!elements.has(name)) elements.set(name, {
    name, innerHTML: "", className: "", textContent: "", value: "", hidden: false, dataset: {}, scrollTop: 0,
    style: { setProperty() {} },
    classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
    setAttribute() {}, append() {}, remove() {}, querySelector() { return null; }, querySelectorAll() { return []; },
    scrollIntoView() {}, addEventListener() {}, getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0 }; },
    // Sans cette methode, la barre d outils des vues n etait jamais inseree :
    // le harnais ne voyait donc ni son tri, ni ses boutons, ni ses libelles.
    insertAdjacentHTML(_position, markup) { this.innerHTML += markup; }
  });
  return elements.get(name);
}

const rootElement = {attributes:{}, setAttribute(k,v){this.attributes[k]=v;}, removeAttribute(k){delete this.attributes[k];}, style:{setProperty(){}}, classList:{toggle(){},add(){},remove(){}}};
const listeners = {};
const bridgeMessages = [];
const document = {
  querySelector(selector) { return element(selector); },
  querySelectorAll() { return []; },
  getElementById(id) { return element(`#${id}`); },
  createElement(tag) { return element(`created:${tag}:${Math.random()}`); },
  // Plusieurs ecouteurs peuvent partager un type : n en garder qu un masquait
  // du code reellement execute dans le navigateur.
  addEventListener(type, callback) {
    const existing = listeners[type];
    listeners[type] = existing ? event => { existing(event); callback(event); } : callback;
  },
  get body() { return element("body"); },
  documentElement: rootElement,
};
class FakeFormData {
  constructor(form) { this.values = form.formValues || {}; }
  *[Symbol.iterator]() { yield* Object.entries(this.values); }
  getAll(name) { const value=this.values[name]; return Array.isArray(value)?value:value===undefined?[]:[value]; }
}

const context = {
  console, document, FormData: FakeFormData,
  window: { webkit: { messageHandlers: { bridge: { postMessage(message) { bridgeMessages.push(structuredClone(message)); } } } },
    matchMedia: () => ({matches: false, addEventListener() {}, removeEventListener() {}}) },
  crypto, structuredClone, Date, Map, Set, Math, Number, String, Boolean, Array, Object, JSON, RegExp,
  setTimeout() { return 0; }, clearTimeout() {}, setInterval() { return 0; }, requestAnimationFrame() { return 0; },
};
context.window.document = document;
const applicationScript = process.argv[2] || `${__dirname}/../../Shared/Web/app.js`;
vm.createContext(context);
vm.runInContext(fs.readFileSync(applicationScript, "utf8"), context, { filename: applicationScript });

const iso = offsetDays => new Date(Date.now()+offsetDays*86400000).toISOString();
const priorities = [
  {id:"urgent",name:"Urgente",code:"U",color:"E5525E",weight:0},
  {id:"normal",name:"Normale",code:"N",color:"6E75FF",weight:1}
];
const settings = overrides => ({maxConcurrency:1,autoSync:false,backgroundSchedulerEnabled:false,autoArchiveCompletedDays:0,defaultModel:"gpt-5.6-sol",defaultEffort:"medium",sidebarCollapsed:false,defaultBoardPreset:"classic",activePresetByScope:{},priorities,taxonomy:[],...overrides});
const space = {id:"space-1",name:"Projet test",rootPath:"/private/tmp/projet-test",accentHex:"6E75FF",pinned:false};
const card = (id,title,status,extra={}) => ({id,spaceID:"space-1",boardPresetID:"classic",title,prompt:`Consigne ${title}`,status,priorityLevelID:extra.priorityLevelID||"normal",priorityNumber:Number(id.replace(/\D/g,""))||1,labels:[],subtasks:[],dependencies:[],categoryAssignments:{},agentEngine:"codex",launchMode:"manual",recurrence:"none",runMode:"workspaceWrite",conversations:[],createdAt:iso(-20),updatedAt:iso(-1),...extra});
const load = (cards, settingOverrides={}) => {
  bridgeMessages.length=0;
  context.window.CodexBoard.load({version:18,spaces:[space],cards,templates:[],validations:[],settings:settings(settingOverrides),modifiedAt:iso(0)});
};
const target = dataset => ({dataset,checked:false,closest(selector){return selector==="[data-action],[data-select],[data-surface]"?this:null;}});
const click = dataset => listeners.click({target:target(dataset),preventDefault(){}});
const body = () => element("#board").innerHTML;
const modal = () => element("#modal-root").innerHTML;

// ---------------------------------------------------------------------------
// Couverture des traductions, par pseudo-localisation.
//
// Chercher « du francais » dans un rendu anglais a un angle mort : « Apparence »,
// « Options », « Interface » n ont ni accent ni mot-outil et passent inapercus.
//
// On entoure donc chaque traduction de marqueurs et on rend l application dans
// cette langue truquee. Tout texte affiche SANS marqueur est, par construction,
// soit jamais passe par t(), soit passe sans entree dans la table. Aucune
// heuristique de langue n intervient.
// ---------------------------------------------------------------------------
vm.runInContext(fs.readFileSync(`${__dirname}/../../Shared/Web/i18n.js`, "utf8"), context, { filename: "i18n.js" });
const OPEN = "⟦", CLOSE = "⟧";
const real = context.window.CTRL_KANB_TRANSLATIONS.en;
context.window.CTRL_KANB_TRANSLATIONS.en = Object.fromEntries(
  Object.entries(real).map(([key, value]) => [key, OPEN + value + CLOSE]));
context.window.navigator = { language: "en-GB" };

const isoDay = offset => new Date(Date.now() + offset * 86400000).toISOString();
const neutralSpace = { id: "space-1", name: "Alpha", rootPath: "/tmp/alpha", accentHex: "6E75FF", pinned: true };
const neutralCard = (id, status, extra = {}) => ({
  id, spaceID: "space-1", boardPresetID: "classic", title: "Alpha", prompt: "Alpha",
  status, priorityLevelID: "normal", priorityNumber: 1, labels: [], subtasks: [], dependencies: [],
  categoryAssignments: {}, agentEngine: "codex", launchMode: "manual", recurrence: "none",
  runMode: "workspaceWrite", model: "gpt-5.6-sol", reasoningEffort: "medium",
  scheduledAt: isoDay(0), dueDate: new Date().toLocaleDateString("en-CA"),
  lastRun: { summary: "Alpha", startedAt: isoDay(-1), finishedAt: isoDay(-1), accessMode: "workspaceWrite",
             approvalMode: "manual", exitCode: 0, trigger: "manual", threadID: "alpha" },
  conversations: [], createdAt: isoDay(-5), updatedAt: isoDay(-1), ...extra });

const settingsFor = cards => ({
  version: 18, spaces: [neutralSpace], cards, templates: [], validations: [],
  settings: { maxConcurrency: 1, autoSync: true, backgroundSchedulerEnabled: false, autoArchiveCompletedDays: 0,
              defaultModel: "gpt-5.6-sol", defaultEffort: "medium", sidebarCollapsed: false, language: "en",
              defaultBoardPreset: "classic", activePresetByScope: {},
              priorities: [{ id: "normal", name: "Alpha", code: "N", color: "6E75FF", weight: 1 }], taxonomy: [] },
  modifiedAt: isoDay(0) });

const surfaces = [];
const grab = label => surfaces.push([label, [
  element("#board").innerHTML, element("#modal-root").innerHTML, element("#sidebar-nav").innerHTML,
  element("#workspace-header").innerHTML, element("#settings-agents").outerHTML || ""].join("\n")]);

// Les deux moteurs ont des libelles et des avertissements differents : n en
// exercer qu un laissait la moitie des textes hors du scan.
context.window.CodexBoard.load(settingsFor([
  ...["backlog","ready","running","needsInput","review","done"].map((s, i) => neutralCard(`c${i}`, s)),
  neutralCard("cc", "ready", { agentEngine: "claude-code", model: "sonnet" }),
]));
context.window.CodexBoard.agentStatus({ codex: true, claude: true });
context.window.CodexBoard.securityStatus({ lockEnabled: false, biometry: "Touch ID" });
for (const view of ["global","space-1","agendaView","reviewView","followView","doneView","settingsView"]) { click({ select: view }); grab(view); }
click({ select: "global" });
// La creation de tache est un rendu different de la modification : titre,
// bouton principal et amorces de brief ne sortent que la. L oublier laissait
// deux libelles francais visibles en anglais.
for (const [action, extra] of [["edit-card", { id: "c0" }], ["edit-card", { id: "cc" }], ["run", { id: "cc" }], ["command-palette", {}], ["run", { id: "c1" }],
                               ["confirm-delete-card", { id: "c0" }], ["shortcuts", {}], ["quick-capture", {}],
                               ["add-card", {}], ["add-space", {}], ["edit-space", { id: "space-1" }],
                               ["delete-space", { id: "space-1" }], ["run-ready", {}], ["review-decision", { id: "c4" }], ["deepen-review", { id: "c4" }],
                               ["conversation-panel", { id: "c0" }], ["link-conversation", { id: "c0" }],
                               ]) {
  click({ action, ...extra }); grab(action);
}
// add-priority / add-dimension / add-account / add-acp lisent le formulaire de
// reglages via form.elements avant d ouvrir leur fenetre : le DOM de test ne le
// simule pas. Ces quatre modales restent hors scan et sont verifiees a la main.

// Les branches « rien a afficher » ne sortent que sur un tableau vide.
context.window.CodexBoard.load(settingsFor([]));
for (const view of ["global","agendaView","reviewView","followView","doneView","settingsView"]) { click({ select: view }); grab(`${view} (vide)`); }

// Ce qui n a pas a etre traduit : noms propres, unites, symboles, donnees de test.
// Ce qui n a pas a etre traduit : noms propres, chemins, symboles, donnees de
// test, et tout ce que toLocale* a deja rendu dans la langue active — dates,
// heures, jours de la semaine, fuseaux.
const NAMES = /^(?:Alpha|alpha|Codex|Claude|Claude Code|CTRL KANB|Touch ID|Optic ID|App Server|LaunchAgent|Sol|Terra|Luna|Sonnet|Opus|Haiku|Claude Sonnet|Claude Opus|Claude Haiku|GPT[\w.\-\s]*|gpt[\w.\-]*|board\.json|Kanban|Finder|macOS|Scheduled|Anthropic|OpenAI|Library|Application Support|tmp|Français|English|Automatic)$/;
// Les libelles de touches restent tels quels dans toutes les langues.
const KEYS = /^(?:[⌘⇧⌥⌃↵↑↓←→]|Esc|esc|Tab|[⌘⇧⌥⌃]\s?\w|\w)(\s|$)/;
// Masques de saisie : ils decrivent un format, pas une phrase.
const MASKS = /^(?:HH:MM|MM\/DD\/YYYY|JJ\/MM\/AAAA|x{4,}(?:-x+)*)$/i;
const DATEISH = /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sept?|Oct|Nov|Dec|GMT[+\-−]?\d*|UTC)\b|^\d|\d{4}$|^\d{1,2}:\d{2}/;
// Les identifiants IANA sont des donnees universelles. L interface remplace
// seulement leurs underscores par des espaces pour les rendre lisibles.
const TIME_ZONE = /^[A-Za-z+\-]+(?:\/[A-Za-z0-9 +\-]+)+$/;
const exempt = value =>
  MASKS.test(value) || NAMES.test(value) || DATEISH.test(value) || TIME_ZONE.test(value) || KEYS.test(value) || value.startsWith("/") || value.startsWith("~") ||
  /^[\p{P}\p{S}\s]+$/u.test(value) || /^[A-Z]-?\d*$/.test(value) ||
  /^\(\d+\)$/.test(value) || /^[A-Z]-\d+\s*\/?$/.test(value) || value.length < 2;
const bare = new Map();
for (const [label, html] of surfaces) {
  // Les infobulles, libelles d accessibilite et textes d exemple sont lus par
  // l utilisateur autant que le contenu : les retirer avec les balises revenait
  // a ne jamais les verifier.
  const attributes = [...html.matchAll(/(?:title|aria-label|placeholder)="([^"]*)"/g)].map(m => m[1]).join("\n");
  const text = html.replace(/<[^>]*>/g, "\n").replace(/&[a-z#0-9]+;/gi, " ") + "\n" + attributes;
  for (const line of text.split("\n")) {
    // On retire les fragments correctement traduits, le reste est suspect.
    const rest = line.replace(new RegExp(`${OPEN}[^${OPEN}${CLOSE}]*${CLOSE}`, "g"), "").trim();
    if (!rest || rest.includes(OPEN) || rest.includes(CLOSE)) continue;
    // Ce qui reste peut n etre qu un assemblage de morceaux deja traduits, de
    // donnees et de separateurs : on examine chaque morceau separement.
    for (const piece of rest.split(/[·—|]+/)) {
      const value = piece.trim();
      if (!value || exempt(value)) continue;
      if (!bare.has(value)) bare.set(value, label);
    }
  }
}
// Un ${t("...")} ecrit dans une chaine simple n est jamais evalue : il arrive tel quel.
let literals = 0;
for (const [label, html] of surfaces)
  for (const m of html.matchAll(/\$\{t\([^)]*\)\}/g)) { literals++; console.log(`  LITTERAL  [${label}] ${m[0].slice(0, 90)}`); }

const rows = [...bare.entries()];
const limit = process.env.CTRL_KANB_I18N_ALL ? rows.length : 40;
for (const [phrase, label] of rows.slice(0, limit)) console.log(`  [${label}] ${phrase.slice(0, 140)}`);
if (rows.length > limit) console.log(`  … et ${rows.length - limit} autres`);
console.log(`\n${rows.length} fragment(s) affiché(s) sans passer par une traduction`);
if (literals) console.log(`${literals} appel(s) t() écrits dans une chaîne simple : ils s'affichent tels quels.`);
process.exit(rows.length || literals ? 1 : 0);
