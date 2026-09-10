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
const applicationScript = process.argv[2] || `${__dirname}/../Resources/app.js`;
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
// Recherche d injection HTML. Le pont JS->natif peut lancer un agent en ecriture :
// toute donnee externe rendue sans echappement vaut execution de code. On empoisonne
// donc chaque champ qui vient de l exterieur — saisie, chemins, sortie d agent —
// et on verifie qu aucune vue ne recrache la charge telle quelle.
// ---------------------------------------------------------------------------
const PAYLOAD = `<img src=x onerror=INJECTION>`;
const BREAKOUT = `" onmouseover=INJECTION x="`;
const CSS_PAYLOAD = `fff;display:none`;
const poison = field => `${field}${PAYLOAD}${BREAKOUT}`;

const iso2 = offset => new Date(Date.now()+offset*86400000).toISOString();
const badSpace = {id:"space-1", name:poison("Projet"), rootPath:poison("/tmp/p"), accentHex:"6E75FF", pinned:true};
const badPriorities = [{id:"urgent",name:poison("Urgente"),code:"U",color:"E5525E",weight:0},
                       {id:"normal",name:poison("Normale"),code:"N",color:"6E75FF",weight:1}];
const badTaxonomy = [{id:"objective",name:poison("Objectif"),kind:"objective",multiple:false,
  values:[{id:"v1",name:poison("Valeur"),color:CSS_PAYLOAD}]}];

const badCard = (id,status,extra={}) => ({
  id, spaceID:"space-1", boardPresetID:"classic", title:poison("Tache"), prompt:poison("Consigne"),
  status, priorityLevelID:"normal", priorityNumber:1, labels:[poison("etiquette")], subtasks:[{id:"s1",title:poison("Sous-tache"),done:false}],
  dependencies:[], categoryAssignments:{objective:["v1"]}, agentEngine:poison("moteur"), launchMode:"manual",
  recurrence:"none", runMode:"workspaceWrite", model:"gpt-5.6-sol", reasoningEffort:"medium",
  scheduledAt:iso2(0), dueDate:new Date().toLocaleDateString("en-CA"),
  // Sortie d agent : la source la moins fiable de toutes.
  lastRun:{summary:poison("Resultat"), startedAt:iso2(-1), finishedAt:iso2(-1), accessMode:"workspaceWrite", approvalMode:"manual", exitCode:1, trigger:"manual", threadID:poison("thread")},
  conversationID:"11111111-1111-1111-1111-111111111111", conversationName:poison("Conversation"),
  conversationPreview:poison("Apercu"), conversationCwd:poison("/tmp/c"),
  conversations:[{id:"11111111-1111-1111-1111-111111111111", name:poison("Conv"), preview:poison("Apercu"),
                  cwd:poison("/tmp/c"), engine:"codex", role:"main", addedAt:iso2(-1),
                  messages:[{role:"assistant", text:poison("Message"), at:iso2(-1)}]}],
  createdAt:iso2(-5), updatedAt:iso2(-1), ...extra});

const cards = [badCard("c1","backlog"), badCard("c2","ready"), badCard("c3","running"),
               badCard("c4","needsInput"), badCard("c5","review"), badCard("c6","done"),
               badCard("c7","done",{archived:true}), badCard("c8","ready",{agentEngine:"claude-code",model:"sonnet"}), badCard("c9","ready",{agentEngine:"codex"})];

bridgeMessages.length=0;
context.window.CodexBoard.load({
  version:18, spaces:[badSpace], cards,
  templates:[{id:"t1", name:poison("Modele"), prompt:poison("Consigne modele")}],
  validations:[{id:"v1", cardID:"c5", question:poison("Question"), kind:"command",
                params:{command:poison("rm -rf"), justification:poison("Motif")}, createdAt:iso2(0),
                agentEngine:"codex", threadID:poison("thread"), requestID:"r1", mode:"workspaceWrite"}],
  settings:{maxConcurrency:1, autoSync:false, backgroundSchedulerEnabled:false, autoArchiveCompletedDays:0,
            defaultModel:"gpt-5.6-sol", defaultEffort:"medium", sidebarCollapsed:false,
            defaultBoardPreset:"classic", activePresetByScope:{}, priorities:badPriorities, taxonomy:badTaxonomy},
  modifiedAt:iso2(0)});

// Messages pousses par le natif : sortie brute d un moteur, jamais de confiance.
context.window.CodexBoard.agentProbeResult({engine:"codex", state:"blocked", detail:poison("Refus"), at:iso2(0)});
context.window.CodexBoard.securityStatus({lockEnabled:true, biometry:poison("Touch ID")});
context.window.CodexBoard.runnerEvent?.({cardID:"c3", message:poison("Evenement")});
context.window.CodexBoard.approvalRequested?.({cardID:"c3", requestID:"r2", kind:"command",
  params:{command:poison("commande"), justification:poison("motif")}, agentEngine:"codex",
  mode:"workspaceWrite", threadID:poison("thread")});
context.window.CodexBoard.conversationList?.({cardID:"c1", conversations:[
  {id:"22222222-2222-2222-2222-222222222222", name:poison("Conv distante"), preview:poison("Apercu distant"),
   cwd:poison("/tmp/d"), source:"codex"}]});

const surfaces = [];
const capture = label => surfaces.push([label,
  [element("#board").innerHTML, element("#modal-root").innerHTML, element("#sidebar-nav").innerHTML,
   element("#workspace-header").innerHTML, element("#settings-agents").outerHTML||"",
   element("#conversation-list").innerHTML].join("\n")]);

for (const view of ["global","space-1","agendaView","reviewView","followView","doneView","settingsView"]) {
  click({select:view});
  capture(`vue ${view}`);
}
click({select:"global"});
click({action:"edit-card", id:"c1"});      capture("editeur de tache");
click({action:"edit-card", id:"c8"});      capture("editeur Claude");
click({action:"run", id:"c8"});            capture("lancement Claude");
click({action:"command-palette"});         capture("palette de commandes");
click({action:"run", id:"c2"});            capture("confirmation de lancement");
click({action:"confirm-delete-card", id:"c1"}); capture("suppression de tache");
click({action:"shortcuts"});               capture("raccourcis");

let leaks = 0;
for (const [label, html] of surfaces) {
  // La charge est neutralisee si < > " sont echappes : on cherche la forme brute.
  const raw = [...html.matchAll(/<img src=x onerror=INJECTION>|" onmouseover=INJECTION x="/g)];
  if (raw.length) { leaks += raw.length; console.log(`FUITE  ${label} — ${raw.length} occurrence(s) non echappee(s)`); }
  else console.log(`ok     ${label}`);
  if (html.includes(`#${CSS_PAYLOAD}`)) { leaks += 1; console.log(`FUITE CSS  ${label} — couleur non valide injectee`); }
}
console.log(`\n${leaks} injection(s) exploitables sur ${surfaces.length} surfaces`);
process.exit(leaks ? 1 : 0);
