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

// ---------------------------------------------------------------------------
// Audit de cablage.
//
// Un bouton sans gestionnaire ne fait rien et ne le dit pas ; un gestionnaire
// sans bouton est du code mort ; un message envoye au natif qu il ne traite pas
// disparait en silence. Ces trois cas ne se voient pas a la relecture, mais se
// prouvent par recoupement entre le rendu, le code JS et le code Objective-C.
// ---------------------------------------------------------------------------
vm.runInContext(fs.readFileSync(`${__dirname}/../../Shared/Web/i18n.js`, "utf8"), context, { filename: "i18n.js" });
context.window.navigator = { language: "fr-FR" };

const appSource = fs.readFileSync(`${__dirname}/../../Shared/Web/app.js`, "utf8");
const nativeSource = fs.readFileSync(`${__dirname}/../../Platforms/macOS/Sources/App/main.m`, "utf8");
const problems = [];
const note = (kind, detail) => problems.push(`${kind} — ${detail}`);

// --- Surfaces : on rend tout ce qu on sait rendre ---------------------------
const iso2 = o => new Date(Date.now() + o * 86400000).toISOString();
const space2 = { id: "space-1", name: "Alpha", rootPath: "/tmp/alpha", accentHex: "6E75FF", pinned: true };
const mk = (id, status, extra = {}) => ({
  id, spaceID: "space-1", boardPresetID: "classic", title: `T${id}`, prompt: "Brief", status,
  priorityLevelID: "normal", priorityNumber: 1, labels: ["a"], subtasks: [{ id: "s", title: "s", done: false }],
  dependencies: [], categoryAssignments: {}, agentEngine: "codex", launchMode: "manual", recurrence: "none",
  runMode: "workspaceWrite", model: "gpt-5.6-sol", reasoningEffort: "medium", scheduledAt: iso2(0),
  dueDate: new Date().toLocaleDateString("en-CA"),
  lastRun: { summary: "R", startedAt: iso2(-1), finishedAt: iso2(-1), accessMode: "workspaceWrite",
             approvalMode: "manual", exitCode: 0, trigger: "manual", threadID: "th" },
  conversations: [{ id: "11111111-1111-1111-1111-111111111111", name: "C", preview: "p", cwd: "/tmp/alpha",
                    engine: "codex", role: "main", addedAt: iso2(-1), messages: [] }],
  createdAt: iso2(-5), updatedAt: iso2(-1), ...extra });

const boardWith = (cards, over = {}) => ({
  version: 18, spaces: [space2], cards, templates: [{ id: "tpl", name: "M", prompt: "P" }],
  validations: [{ id: "v1", cardID: "c4", question: "", kind: "command", params: { command: "ls" },
                  createdAt: iso2(0), agentEngine: "codex", threadID: "th", requestID: "r", mode: "workspaceWrite" }],
  settings: { maxConcurrency: 1, autoSync: true, backgroundSchedulerEnabled: false, autoArchiveCompletedDays: 0,
              defaultModel: "gpt-5.6-sol", defaultEffort: "medium", sidebarCollapsed: false, language: "fr",
              defaultBoardPreset: "classic", activePresetByScope: {},
              priorities: [{ id: "normal", name: "N", code: "N", color: "6E75FF", weight: 1 }],
              taxonomy: [{ id: "objective", name: "O", kind: "objective", multiple: false, values: [{ id: "v", name: "V" }] }],
              ...over },
  modifiedAt: iso2(0) });

const fullCards = ["backlog","ready","running","needsInput","review","done"].map((s, i) => mk(`c${i}`, s))
  .concat([mk("cc", "ready", { agentEngine: "claude-code", model: "sonnet" }),
           mk("ca", "done", { archived: true }),
           mk("cr", "ready", { boardPresetID: "routines", recurrence: "daily", launchMode: "scheduled" })]);

const rendered = [];
const snap = label => rendered.push([label, [element("#board").innerHTML, element("#modal-root").innerHTML,
  element("#sidebar-nav").innerHTML, element("#workspace-header").innerHTML,
  element("#settings-agents").outerHTML || "", element("#conversation-list").innerHTML].join("\n")]);

// 1. Robustesse : chaque vue, sur des tableaux tres differents, sans exception.
const states = [
  ["tableau complet", boardWith(fullCards)],
  ["tableau vide", boardWith([])],
  ["projet sans dossier", boardWith(fullCards.map(c => ({ ...c, spaceID: "inconnu" })))],
  ["donnees minimales", { version: 18, spaces: [space2], cards: [mk("x", "ready")], settings: {} }],
  ["cartes sans conversation", boardWith(fullCards.map(c => ({ ...c, conversations: [], lastRun: undefined })))],
  ["preset routines par defaut", boardWith(fullCards, { defaultBoardPreset: "routines" })],
  ["panneau replie", boardWith(fullCards, { sidebarCollapsed: true })],
];
const views = ["global","space-1","agendaView","reviewView","followView","doneView","settingsView"];
for (const [label, data] of states) {
  for (const view of views) {
    try { context.window.CodexBoard.load(JSON.parse(JSON.stringify(data))); click({ select: view }); snap(`${label} / ${view}`); }
    catch (error) { note("RENDU", `${label} / ${view} : ${error.message}`); }
  }
}
// Les vues d agenda ont chacune leur mise en page.
for (const mode of ["day","week","month"]) {
  try { context.window.CodexBoard.load(boardWith(fullCards, { agendaMode: mode })); click({ select: "agendaView" }); snap(`agenda ${mode}`); }
  catch (error) { note("RENDU", `agenda ${mode} : ${error.message}`); }
}

// 1 bis. Etats que seule l execution produit : sans eux, la moitie des boutons
// de la colonne « En cours » et du centre de validations ne sort jamais.
context.window.CodexBoard.load(boardWith(fullCards));
try {
  context.window.CodexBoard.runnerStarted({ cardID: "c2" });
  context.window.CodexBoard.queueUpdated({ positions: { c1: 1 } });
  context.window.CodexBoard.runnerEvent({ cardID: "c2", message: "travail" });
  context.window.CodexBoard.approvalRequested({ cardID: "c3", requestID: "r1", kind: "command",
    params: { command: "ls" }, agentEngine: "codex", mode: "workspaceWrite", threadID: "th" });
  context.window.CodexBoard.approvalRequested({ cardID: "cc", requestID: "r2", kind: "input",
    params: { question: "Continuer ?" }, agentEngine: "claude-code", mode: "readOnly", threadID: "th" });
  for (const view of ["global","reviewView","followView"]) { click({ select: view }); snap(`en execution / ${view}`); }
  click({ select: "global" }); click({ action: "edit-card", id: "c2" }); snap("editeur pendant execution");
  context.window.CodexBoard.conversationsLoaded({ cardID: "c0", conversations: [
    { id: "22222222-2222-2222-2222-222222222222", name: "C2", preview: "p", cwd: "/tmp/alpha", source: "codex" }] });
  snap("liste de conversations");
} catch (error) { note("ETAT", `execution en cours : ${error.message}`); }
// Listes repliees puis depliees.
try {
  click({ select: "global" }); click({ action: "toggle-projects" }); snap("projets deplies");
  click({ action: "toggle-sidebar" }); snap("panneau replie");
  click({ action: "toggle-sidebar" }); snap("panneau deplie");
} catch (error) { note("ETAT", `bascule des listes : ${error.message}`); }

// 1 ter. Etats de volume et de menu : la liste des projets ne propose « voir la
// suite » qu au-dela de cinq, les colonnes qu au-dela de trente cartes, et le
// menu d un projet ne sort qu une fois ouvert.
try {
  const manySpaces = Array.from({ length: 9 }, (_, i) => ({ ...space2, id: `sp${i}`, name: `P${i}`, pinned: i === 0 }));
  const manyCards = Array.from({ length: 70 }, (_, i) => mk(`m${i}`, i % 2 ? "done" : "backlog", { spaceID: "sp0" }));
  context.window.CodexBoard.load({ ...boardWith(manyCards), spaces: manySpaces });
  click({ select: "global" }); snap("beaucoup de projets et de cartes");
  click({ action: "toggle-projects" }); snap("liste des projets depliee");
  click({ action: "project-menu", id: "sp1" }); snap("menu d un projet");
  click({ surface: "flow", select: "global" }); snap("vue Flux volumineuse");
  click({ select: "doneView" }); snap("historique volumineux");
} catch (error) { note("ETAT", `volume et menus : ${error.message}`); }

// 1 quater. Tiroir de conversations et cartes en cours d execution.
try {
  context.window.CodexBoard.load(boardWith(fullCards.map(c => c.id === "c0"
    ? { ...c, conversations: [c.conversations[0], { ...c.conversations[0], id: "33333333-3333-3333-3333-333333333333", role: "extra" }] }
    : c)));
  click({ select: "global" });
  click({ action: "open-conversations", id: "c0" }); snap("tiroir de conversations");
  context.window.CodexBoard.load(boardWith([
    mk("r1", "running", { executionState: "paused" }),
    mk("r2", "running", { boardPresetID: "routines", recurrence: "daily" }),
    mk("r3", "ready", { launchMode: "scheduled", scheduleState: "paused" }),
    mk("r4", "needsInput"),
  ]));
  context.window.CodexBoard.runnerStarted({ cardID: "r1" });
  for (const view of ["global","reviewView","followView"]) { click({ select: view }); snap(`etats d execution / ${view}`); }
  click({ surface: "flow", select: "global" }); snap("Flux avec executions");
} catch (error) { note("ETAT", `tiroir et executions : ${error.message}`); }

// 2. Chaque panneau et chaque modale s ouvrent sans exception.
context.window.CodexBoard.load(boardWith(fullCards));
context.window.CodexBoard.agentStatus({ codex: true, claude: true });
context.window.CodexBoard.securityStatus({ lockEnabled: false, biometry: "Touch ID" });
const panels = [
  ["edit-card", { id: "c0" }], ["edit-card", { id: "cc" }], ["edit-card", { id: "cr" }],
  ["add-card", {}], ["quick-capture", {}], ["shortcuts", {}], ["command-palette", {}],
  ["run", { id: "c1" }], ["run", { id: "cc" }], ["confirm-delete-card", { id: "c0" }],
  ["add-space", {}], ["edit-space", { id: "space-1" }], ["settings", {}],
  ["duplicate-card", { id: "c0" }], ["pin-card", { id: "c0" }],
];
for (const [action, extra] of panels) {
  try { click({ select: "global" }); click({ action, ...extra }); snap(`panneau ${action}`); }
  catch (error) { note("PANNEAU", `${action} : ${error.message}`); }
}

// 3. Tout bouton affiche a un gestionnaire, tout gestionnaire a un bouton.
const shown = new Set();
for (const m of fs.readFileSync(`${__dirname}/../../Shared/Web/index.html`, "utf8").matchAll(/data-action="([a-z-]+)"/g)) shown.add(m[1]);
for (const [, html] of rendered)
  for (const m of html.matchAll(/data-action="([a-z-]+)"/g)) shown.add(m[1]);
const handled = new Set([...appSource.matchAll(/action\s*===\s*"([a-z-]+)"/g)].map(m => m[1]));
for (const action of [...shown].sort())
  if (!handled.has(action)) note("BOUTON MORT", `« ${action} » est affiché mais aucun gestionnaire ne le traite`);
// Deux cas tres differents : un gestionnaire dont aucun bouton n existe dans le
// code est du code mort ; un gestionnaire dont le bouton existe mais qu aucun
// etat de l audit ne fait sortir est un trou de couverture, pas un defaut.
const KEYBOARD_ONLY = new Set(["command-pick","brief-starter","restore-draft","discard-draft","close-modal","task-layout","open-project-file"]);
const MENU_ONLY = new Set(["agenda","board","flow","follow","validations"]);
const declared = new Set([...appSource.matchAll(/data-action="([a-z-]+)"/g)].map(m => m[1]));
const uncovered = [];
for (const action of [...handled].sort()) {
  if (shown.has(action) || KEYBOARD_ONLY.has(action) || MENU_ONLY.has(action)) continue;
  if (declared.has(action)) { uncovered.push(action); continue; }
  note("CODE MORT", `le gestionnaire « ${action} » n'a aucun bouton dans le code`);
}

// 4. Chaque message envoye au natif y est traite, et reciproquement.
const sent = new Set([...appSource.matchAll(/bridge\(\{\s*action\s*:\s*"([A-Za-z]+)"/g)].map(m => m[1]));
// Le natif compare l action dans son routeur de messages : on ne lit que ce bloc.
const router = nativeSource.slice(nativeSource.indexOf("didReceiveScriptMessage"),
                                  nativeSource.indexOf("didReceiveScriptMessage") + 9000);
const nativeHandled = new Set([...router.matchAll(/isEqualToString:@"([A-Za-z]+)"/g)].map(m => m[1]));
for (const action of [...sent].sort())
  if (!nativeHandled.has(action)) note("PONT", `l'interface envoie « ${action} » que le natif ne traite pas`);
const pushed = new Set([...nativeSource.matchAll(/sendFunction:@"([A-Za-z]+)"/g)].map(m => m[1]));
// Les receveurs sont les methodes de l objet window.CodexBoard.
// Un commentaire entre la virgule et le receveur cassait la detection : le
// receveur existait, l audit le declarait manquant. On retire d abord les lignes
// entierement commentees, sans toucher aux « // » internes aux chaines.
const receiverBlock = appSource.slice(appSource.indexOf("window.CodexBoard={"))
  .split("\n").filter(line => !line.trimStart().startsWith("//")).join("\n");
// Les receveurs sont ecrits en style compact, plusieurs par ligne : on ne peut
// pas s ancrer sur le debut de ligne.
const receivers = new Set([...receiverBlock.matchAll(/[{,]\s*([a-zA-Z]+)\s*\(/g)].map(m => m[1]));
for (const fn of [...pushed].sort())
  if (!receivers.has(fn)) note("PONT", `le natif appelle « ${fn} » que l'interface ne reçoit pas`);

// 5. Chaque controle nomme est relu par le gestionnaire de son formulaire.
const formHandlers = appSource.match(/function applyPreferences[\s\S]*?\n  \}/)?.[0] || "";
for (const [, html] of rendered) {
  const prefs = html.match(/<form id="preferences-form"[\s\S]*?<\/form>/)?.[0];
  if (!prefs) continue;
  for (const m of prefs.matchAll(/name="([a-zA-Z]+)"/g))
    if (!formHandlers.includes(`data.${m[1]}`))
      note("REGLAGE IGNORE", `le contrôle « ${m[1]} » est affiché mais applyPreferences ne le lit pas`);
  break;
}

// 6. Une cle de recherche ne doit jamais passer par le traducteur.
// icon("question") cherche un chemin SVG par son nom : traduire ce nom faisait
// dependre l affichage d une entree de dictionnaire, et l icone disparaissait
// des que quelqu un traduisait vraiment le mot.
for (const [nom, motif] of [["icon", /\bicon\(\s*t\(/g], ["engineKey", /\bengineKey\(\s*t\(/g], ["getCard", /\bgetCard\(\s*t\(/g]])
  for (const _ of appSource.matchAll(motif))
    note("CLE TRADUITE", `« ${nom}( t(...) ) » : une cle de recherche passe par le traducteur`);

// 7. La grille du mois se partage la hauteur disponible.
// Une hauteur fixe par cellule imposait 792px pour six semaines : les deux
// dernieres tombaient sous la ligne de flottaison d une fenetre courante.
// Verifie sur navigateur a 560, 800 et 1150px de haut.
const feuille = fs.readFileSync(`${__dirname}/../../Shared/Web/app.css`, "utf8");
const regleJour = feuille.match(/^\.agenda-month-day \{[^}]*\}/m)?.[0] || "";
const hauteurFixe = regleJour.match(/min-height:\s*(\d+)px/);
if (hauteurFixe && Number(hauteurFixe[1]) > 0)
  note("MISE EN PAGE", `.agenda-month-day impose min-height:${hauteurFixe[1]}px : six semaines ne tiennent plus dans la fenetre`);
if (!/^\.agenda-month-grid \{[^}]*grid-auto-rows:[^}]*1fr/m.test(feuille))
  note("MISE EN PAGE", ".agenda-month-grid ne partage plus la hauteur entre ses lignes (grid-auto-rows … 1fr)");
// La grille doit pouvoir grandir sans jamais etre comprimee : compressee sous
// la taille de ses lignes, le overflow:hidden de la vue mois les rendait
// inatteignables, aucun parent ne defilant.
if (!/\.agenda-shell:has\(\.agenda-month-view\) \.agenda-month-grid \{[^}]*flex:\s*1 0 auto/.test(feuille))
  note("MISE EN PAGE", "la grille du mois peut etre comprimee sous ses lignes : les dernieres semaines deviennent inatteignables");

// --- Verdict ----------------------------------------------------------------
const unique = [...new Set(problems)];
for (const line of unique) console.log("  " + line);
if (uncovered.length) console.log(`\n  couverture : ${uncovered.length} bouton(s) déclarés qu'aucun état de l'audit ne fait sortir — ${uncovered.join(", ")}`);
console.log(`\n${rendered.length} surfaces rendues · ${shown.size} actions affichées · ${sent.size} messages vers le natif`);
console.log(unique.length ? `${unique.length} problème(s) de câblage` : "aucun problème de câblage");
process.exit(unique.length ? 1 : 0);
