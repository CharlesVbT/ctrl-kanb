const fs = require("fs");
const vm = require("vm");

const elements = new Map();
const toasts = [];
const intervals = [];
function element(name) {
  if (!elements.has(name)) elements.set(name, {
    name, innerHTML: "", className: "", textContent: "", value: "", hidden: false, dataset: {}, scrollTop: 0,
    style: { setProperty() {} },
    classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
    setAttribute() {}, remove() {}, querySelector() { return null; }, querySelectorAll() { return []; },
    append(child) { if (child && typeof child.textContent === "string") toasts.push(child.textContent); },
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
  // Les minuteries etaient inertes : le planificateur, qui ne tourne que sur
  // setInterval, n etait donc jamais exerce par les tests.
  setTimeout() { return 0; }, clearTimeout() {}, requestAnimationFrame() { return 0; },
  setInterval(callback, delay) { intervals.push({callback, delay}); return intervals.length; },
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
const settings = overrides => ({maxConcurrency:1,maxConcurrencyCodex:1,maxConcurrencyClaude:1,autoSync:false,backgroundSchedulerEnabled:false,autoArchiveCompletedDays:0,defaultModel:"gpt-5.6-sol",defaultEffort:"medium",defaultEffortCodex:"medium",defaultEffortClaude:"medium",sidebarCollapsed:false,defaultBoardPreset:"classic",activePresetByScope:{},theme:"auto",themePalette:"graphite",priorities,taxonomy:[],...overrides});
const space = {id:"space-1",name:"Projet test",rootPath:"/private/tmp/projet-test",accentHex:"6E75FF",pinned:false};
const card = (id,title,status,extra={}) => ({id,spaceID:"space-1",boardPresetID:"classic",title,prompt:`Consigne ${title}`,status,priorityLevelID:extra.priorityLevelID||"normal",priorityNumber:Number(id.replace(/\D/g,""))||1,labels:[],subtasks:[],dependencies:[],categoryAssignments:{},agentEngine:"codex",launchMode:"manual",recurrence:"none",runMode:"workspaceWrite",conversations:[],createdAt:iso(-20),updatedAt:iso(-1),...extra});
// Le troisieme argument permet de tester un vault sans aucun projet, etat que
// l on rencontre a la premiere ouverture.
const load = (cards, settingOverrides={}, spaces=[space], validations=[]) => {
  bridgeMessages.length=0;
  context.window.CodexBoard.load({version:18,spaces,cards,templates:[],validations,settings:settings(settingOverrides),modifiedAt:iso(0)});
};
const target = dataset => ({dataset,checked:false,closest(selector){return selector==="[data-action],[data-select],[data-surface]"?this:null;}});
const click = dataset => listeners.click({target:target(dataset),preventDefault(){}});
const rightClickFile = dataset => listeners.contextmenu({target:{dataset,closest(selector){return selector==="[data-utility-file]"?this:null;}},clientX:1080,clientY:690,preventDefault(){}});
const body = () => element("#board").innerHTML;
const sidebar = () => element("#sidebar-nav").innerHTML;
const modal = () => element("#modal-root").innerHTML;
const saves = () => bridgeMessages.filter(message=>message.action==="save");
const lastToast = () => toasts.at(-1) || "";
// Declenche les minuteries de cette periode, comme le ferait le navigateur.
const fireInterval = delay => { for (const entry of intervals) if (entry.delay === delay) entry.callback(); };
let checks = 0;
const assert = (condition,message) => {checks += 1; if(!condition)throw new Error(message);};
const occurrences = (value,fragment) => (value.match(new RegExp(fragment,"g"))||[]).length;
const stylesheet = fs.readFileSync(`${__dirname}/../Resources/app.css`,"utf8").replace(/\r\n?/g,"\n");
const actionColor = stylesheet.match(/--action-primary:(#[0-9a-f]{6})/i)?.[1];
const actionInk = stylesheet.match(/--action-primary-ink:(#[0-9a-f]{6})/i)?.[1];
const darkThemeBlock=stylesheet.match(/:root\[data-theme="dark"\]\{([\s\S]*?)\n\}/)?.[1]||"";
const darkActionColor=darkThemeBlock.match(/--action-primary:(#[0-9a-f]{6})/i)?.[1];
const darkActionInk=darkThemeBlock.match(/--action-primary-ink:(#[0-9a-f]{6})/i)?.[1];
const relativeLuminance = hex => {
  const channels=(hex||"").slice(1).match(/../g)?.map(value=>parseInt(value,16)/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4)||[];
  return channels.length===3 ? .2126*channels[0]+.7152*channels[1]+.0722*channels[2] : 1;
};
const contrast = (first,second) => (Math.max(relativeLuminance(first),relativeLuminance(second))+.05)/(Math.min(relativeLuminance(first),relativeLuminance(second))+.05);
const actionChannels=(actionColor||"").slice(1).match(/../g)?.map(value=>parseInt(value,16))||[];
assert(actionColor&&actionColor.toLowerCase()!=="#1b1d21","L action principale du theme clair utilise encore le noir de l interface.");
assert(actionChannels.length===3&&Math.max(...actionChannels)-Math.min(...actionChannels)<=12,"L action principale du theme clair n utilise pas un gris neutre.");
assert(actionInk&&contrast(actionColor,actionInk)>=4.5,"L action principale du theme clair manque de contraste avec son texte.");
assert(stylesheet.includes('.primary:hover{\n  background:var(--action-primary-hover)'),"Le survol des actions principales n utilise pas sa teinte dediee.");
assert(stylesheet.includes('.primary:active{\n  background:var(--action-primary-pressed)'),"L appui sur une action principale n utilise pas sa teinte dediee.");
assert(darkActionColor&&darkActionInk&&contrast(darkActionColor,darkActionInk)>=4.5,"L action principale sombre manque de contraste.");
assert(relativeLuminance(darkActionColor)<.12,"L action principale sombre reste une plaque claire trop vive.");
const token=(block,name)=>block.match(new RegExp(`--${name}:(#[0-9a-f]{6})`,"i"))?.[1];
const graphiteLight=stylesheet.match(/:root\{\n  \/\* Echelle typographique[\s\S]*?\n\}/)?.[0]||"";
const lightThemeBlocks=[["graphite",graphiteLight],...["azure","midnight","ember","slate","terminal"].map(name=>[name,stylesheet.match(new RegExp(`:root\\[data-theme="light"\\]\\[data-palette="${name}"\\]\\{([\\s\\S]*?)\\n\\}`))?.[1]||""])];
for(const [name,block] of lightThemeBlocks){
  const background=token(block,"bg"),surface=token(block,"surface-2"),secondary=token(block,"ink-3"),accent=token(block,"accent")||token(block,"ink");
  assert(background&&surface&&secondary&&contrast(secondary,surface)>=4.5,`Le texte secondaire de la palette claire ${name} manque de contraste sur les surfaces nuancees.`);
  assert(background&&accent&&contrast(accent,background)>=4.5,`L accent de la palette claire ${name} manque de contraste sur le fond principal.`);
}
assert(!fs.readFileSync(`${__dirname}/../Resources/index.html`,"utf8").includes("LOCAL, PAR NATURE."),"L'ancienne signature occupe encore le bas du panneau lateral.");
context.window.CodexBoard.appInfo({version:"6.6.1"});
assert(element("[data-app-version]").textContent==="Version 6.6.1","Le panneau lateral n'affiche pas le numero de version complet.");

load([
  card("side-old","Tâche ancienne","ready",{createdAt:iso(-8),updatedAt:iso(-7)}),
  card("side-new","Tâche récente","ready",{createdAt:iso(-2),updatedAt:iso(-1)}),
  card("side-done","Tâche à archiver","done",{createdAt:iso(-4),updatedAt:iso(0),completedAt:iso(0)})
]);
click({action:"toggle-project",id:"space-1"});
assert(sidebar().indexOf("Tâche à archiver")<sidebar().indexOf("Tâche récente")&&sidebar().indexOf("Tâche récente")<sidebar().indexOf("Tâche ancienne"),"Les tâches du projet ne sont pas classées de la plus récente à la plus ancienne.");
assert(sidebar().includes('class="project-task-archive" data-action="archive-card" data-id="side-done"'),"Une tâche terminée ne peut pas être archivée directement depuis le panneau latéral.");
click({action:"archive-card",id:"side-done"});
assert(saves().at(-1).data.cards.find(item=>item.id==="side-done").archived===true&&!sidebar().includes("Tâche à archiver"),"L’archivage depuis le panneau latéral ne retire pas la tâche de la liste active.");

const adapterMessages=[];
context.window.ctrlKanbNative={postMessage(message){adapterMessages.push(structuredClone(message));}};
bridgeMessages.length=0;
click({action:"sync"});
assert(adapterMessages.length>0&&bridgeMessages.length===0,"L’adaptateur natif multiplateforme n’a pas la priorité sur le pont WebKit macOS.");
delete context.window.ctrlKanbNative;

load([
  card("c1","Livrable terminé","done",{updatedAt:iso(-8),completedAt:iso(0)}),
  card("c2","Ancienne réalisation","done",{updatedAt:iso(-7),completedAt:iso(0),archived:true,archivedAt:iso(0),archiveReason:"manual"}),
  card("c3","Priorité urgente","ready",{updatedAt:iso(-2),priorityLevelID:"urgent"}),
  card("c4","Planifiée aujourd’hui","ready",{updatedAt:iso(-3),launchMode:"scheduled",scheduledAt:iso(0),dueDate:iso(0).slice(0,10)}),
  card("c5","Travail suspendu","running",{updatedAt:iso(-4),executionState:"paused"}),
  card("c6","Résultat à revoir","review",{updatedAt:iso(-5),lastRun:{summary:"Résultat disponible"}}),
  card("c7","Prévue ensuite","ready",{updatedAt:iso(-6),launchMode:"scheduled",scheduledAt:iso(3),pinned:true}),
  card("c8","Tâche masquée","ready",{updatedAt:iso(-1)})
]);
assert(sidebar().includes('<span class="nav-label">Projet test</span>'),"Le nom du projet manque dans le panneau latéral.");
click({action:"toggle-project",id:"space-1"});
assert(sidebar().includes('m6 10 6 6 6-6'),"Le projet ouvert n’affiche pas son chevron bas.");
assert(!sidebar().includes('project-disclosure project-folder-icon'),"L’ancien dossier est encore affiché dans la ligne du projet.");
assert(!sidebar().includes('folderOpen'),"Le projet ouvert utilise encore l’ancien pictogramme de dossier ouvert.");
assert(sidebar().includes('<span class="nav-label">Projet test</span>'),"Le nom du projet disparaît quand son arborescence est ouverte.");
assert(stylesheet.includes('.project-nav-row.active .project-nav-main,.project-nav-row.menu-open .project-nav-main{color:var(--ink);background:transparent}'),"Le titre du projet actif peut encore se confondre avec le fond.");
assert(stylesheet.includes('.project-nav-group,.project-nav-group *{animation:none!important;transition:none!important}'),"Des animations restent actives dans l’arborescence des projets.");
assert(!stylesheet.includes('scrollIntoView({block:"nearest"}))}return}\n    if(action==="show-more-project-tasks")'),"L’ouverture d’un projet déclenche encore un déplacement automatique du panneau.");
assert(stylesheet.includes('.project-disclosure .ui-icon{display:block'),"Le chevron du projet est masqué.");
assert(!stylesheet.includes('.project-disclosure::before'),"Le signe plus est encore dessiné dans le panneau des projets.");
assert(sidebar().includes('data-action="open-sidebar-task" data-id="c3"'),"Les tâches du projet n’apparaissent pas sous le projet ouvert.");
assert(saves().at(-1).data.settings.expandedProjectIDs.includes("space-1"),"L’état ouvert du projet n’est pas enregistré.");
assert(occurrences(sidebar(),'class="project-task-row')===6,"La liste latérale ne se limite pas à cinq tâches ordinaires avec les épinglées visibles.");
assert(sidebar().includes('data-action="show-more-project-tasks"')&&sidebar().includes("Afficher 1 de plus"),"Le bouton pour afficher les tâches restantes manque.");
assert(sidebar().includes('project-task-row pinned')&&sidebar().includes('data-action="pin-card" data-id="c7"'),"La tâche épinglée n’est pas visible avec son action.");
click({action:"show-more-project-tasks",id:"space-1"});
assert(occurrences(sidebar(),'class="project-task-row')===7&&sidebar().includes("Réduire la liste"),"Afficher plus ne révèle pas toutes les tâches du projet.");
click({action:"show-more-project-tasks",id:"space-1"});
assert(occurrences(sidebar(),'class="project-task-row')===6,"Réduire la liste ne restaure pas la limite initiale.");
click({action:"pin-card",id:"c3"});
assert(saves().at(-1).data.cards.find(item=>item.id==="c3").pinned===true,"L’épinglage depuis le panneau latéral n’est pas sauvegardé.");
assert(occurrences(sidebar(),'project-task-row pinned')===2,"La tâche nouvellement épinglée ne remonte pas dans le projet.");
click({action:"open-sidebar-task",id:"c3"});
assert(modal().includes("Priorité urgente"),"Une tâche du panneau latéral n’ouvre pas sa fiche.");
click({action:"close-modal"});
assert(occurrences(body(),"column-help")===7,"Les 7 bulles du tableau Classique ne sont pas rendues.");
assert(body().includes('data-action="archive-card"'),"Le bouton d’archivage individuel manque.");
click({action:"archive-card",id:"c1"});
assert(saves().at(-1).data.cards.find(item=>item.id==="c1").archived===true,"L’archivage manuel n’est pas sauvegardé.");

click({select:"doneView"});
assert(body().includes("Livrable terminé")&&body().includes("Ancienne réalisation"),"Historique ne montre pas toutes les archives.");
assert(body().includes('class="history-card-header"')&&body().includes('class="history-card-result"'),"La carte d historique ne separe pas clairement son contexte et son resultat.");
assert(!body().includes('class="history-card-body"'),"L ancien panneau imbrique de l historique subsiste.");
assert(!body().includes('class="history-controlbar"'),"L historique garde la barre d explication dupliquee.");
assert(body().includes('class="ui-button history-delete-button" data-action="confirm-delete-card" data-origin="history" data-id="c2"'),"Une archive ne propose pas sa suppression directe.");
click({action:"confirm-delete-card",origin:"history",id:"c2"});
assert(modal().includes("Supprimer cette tâche ?")&&modal().includes("Les fichiers du projet"),"La suppression directe ne reutilise pas la confirmation protegee.");
assert(modal().includes('<button class="secondary" data-action="close-modal">Conserver la tâche</button>'),"Annuler depuis Historique ne revient pas directement aux archives.");
click({action:"close-modal"});
click({action:"unarchive-card",id:"c2"});
assert(saves().at(-1).data.cards.find(item=>item.id==="c2").archived===false,"La restauration d’une archive échoue.");

click({select:"agendaView"});
assert(body().includes("Livrable terminé")&&body().includes("Ancienne réalisation"),"Les tâches archivées ne restent pas dans l’Agenda.");
assert((body().match(/class="agenda-slot-target[^>]+tabindex="0"/g)||[]).length===1,"La grille hebdomadaire doit exposer un seul créneau dans l’ordre de tabulation.");
assert((body().match(/class="agenda-slot-target[^>]+tabindex="-1"/g)||[]).length===335,"Les autres créneaux de l’Agenda doivent se parcourir avec les flèches plutôt qu’avec 335 tabulations.");
assert(stylesheet.includes(".agenda-slot-target:focus-visible"),"Le créneau actif de l’Agenda n’a pas de repère de focus visible.");
assert(body().includes('class="agenda-delete-action" data-action="confirm-delete-card" data-origin="agenda" data-id="c1"'),"L’Agenda ne propose pas la suppression directe d’une tâche.");
click({action:"confirm-delete-card",origin:"agenda",id:"c1"});
assert(modal().includes("Supprimer cette tâche ?")&&modal().includes('data-action="delete-card" data-id="c1"'),"La suppression depuis l’Agenda ne demande pas confirmation.");
assert(modal().includes('<button class="secondary" data-action="close-modal">Conserver la tâche</button>'),"Annuler la suppression depuis l’Agenda ouvre encore la fiche de la tâche.");
click({action:"delete-card",id:"c1"});
assert(!saves().at(-1).data.cards.some(item=>item.id==="c1"),"La suppression confirmée depuis l’Agenda ne retire pas la tâche.");

load([card("weekly","Routine hebdomadaire","ready",{launchMode:"scheduled",scheduledAt:new Date(Date.now()+3600000).toISOString(),recurrence:"weekly",boardPresetID:"routines",recurrenceSeriesID:"weekly-series"})],{agendaMode:"week"});
click({select:"agendaView"});
click({action:"agenda-next"});
assert(body().includes('class="agenda-event scheduled projected')&&body().includes("Routine hebdomadaire")&&body().includes("Occurrence prévue"),"L’Agenda n’affiche pas l’occurrence prévue de la semaine suivante.");
assert(!body().includes('data-agenda-draggable="true"')&&!body().includes('class="agenda-delete-action"'),"Une occurrence future permet encore une action destructive réservée à la prochaine carte réelle.");

const flowCards = [
  card("f2","Résultat à revoir","review",{lastRun:{summary:"Résultat disponible"}}),
  card("f3","Créneau manqué","ready",{launchMode:"scheduled",scheduledAt:iso(-2)}),
  card("f4","Prête maintenant","ready",{priorityLevelID:"urgent"}),
  card("f5","Plus tard aujourd’hui","ready",{launchMode:"scheduled",scheduledAt:iso(0)}),
  card("f6","Prévue ensuite","ready",{launchMode:"scheduled",scheduledAt:iso(3)}),
  card("f7","Vivier urgent","backlog",{priorityLevelID:"urgent"})
];
load(flowCards);
click({surface:"flow",select:"global"});
for (const title of ["Ça bloque","Aujourd’hui","Ce qui arrive"])
  assert(body().includes(title),`Étage Flux absent : ${title}`);
assert(!body().includes("flow-board-section"),"Flux contient encore un tableau dupliqué.");
assert(!body().includes('</strong> Codex</span>')&&!body().includes('</strong> Claude</span>'),"Flux affiche encore les compteurs techniques de capacité Codex et Claude.");
assert(body().includes("Aurait déjà dû tourner"),"Flux n’expose pas les tâches en retard.");
assert(body().includes("Lancement en retard de 2 j"),"Le motif du retard n’est pas affiché.");
for (const item of flowCards)
  assert(occurrences(body(),item.title)===1,`Flux affiche « ${item.title} » ${occurrences(body(),item.title)} fois au lieu d’une seule.`);
for (const kicker of ["Décision","Retard","Action immédiate","Plus tard","Sept jours","Vivier"])
  assert(body().includes(`section-kicker">${kicker}<`),`Bloc Flux absent : ${kicker}`);
assert(occurrences(body(),"flow-dashboard-section")===6,"Un bloc Flux vide est rendu alors qu’il devrait être masqué.");

load([card("d1","Carte du projet","done",{completedAt:iso(-1)})]);
click({action:"delete-space",id:"space-1"});
assert(modal().includes("Le dossier Finder ne sera jamais supprimé")&&modal().includes("/private/tmp/projet-test"),"La confirmation de sécurité Finder est absente.");
const deleteForm = {id:"delete-space-form",dataset:{id:"space-1"},formValues:{confirm:"on"}};
listeners.submit({target:deleteForm,preventDefault(){}});
const deletionSave=saves().at(-1).data;
assert(deletionSave.spaces.length===0&&deletionSave.cards.length===0,"Le projet n’est pas retiré des données CTRL KANB.");
assert(!bridgeMessages.some(message=>["revealPath","chooseFolder"].includes(message.action)),"La suppression de projet appelle une action Finder.");

load([
  card("a1","Ancienne à archiver","done",{completedAt:iso(-8)}),
  card("a2","Récente à conserver","done",{completedAt:iso(-2)})
],{autoArchiveCompletedDays:7});
const automaticSave=saves().at(-1).data;
assert(automaticSave.cards.find(item=>item.id==="a1").archived===true,"L’archivage automatique n’archive pas l’ancienne tâche.");
assert(!automaticSave.cards.find(item=>item.id==="a2").archived,"L’archivage automatique archive une tâche trop récente.");

load(Array.from({length:55},(_,index)=>card(`h${index+1}`,`Archive ${index+1}`,"done",{completedAt:iso(-index-1),archived:true,archivedAt:iso(-index),archiveReason:"manual"})));
click({select:"doneView"});
assert(occurrences(body(),'class="history-card archived"')===50,"Historique ne limite pas le premier rendu à 50 archives.");
assert(body().includes('data-action="show-more-history"'),"Le bouton de pagination de l’historique manque.");
click({action:"show-more-history",historyKind:"archived"});
assert(occurrences(body(),'class="history-card archived"')===55,"Historique n’affiche pas le lot suivant.");

// --- Largeur du menu lateral : glissement, bornes, et fin de glissement ------
load([card("s1","Carte","ready")]);
const grip = {setPointerCapture(){},dataset:{}};
const gripTarget = {dataset:{},closest(selector){return selector==="[data-sidebar-resize]"?grip:null;}};
const startDrag = () => listeners.pointerdown({target:gripTarget,pointerId:7,preventDefault(){},stopPropagation(){}});

startDrag();
listeners.pointermove({pointerId:7,buttons:1,clientX:320});
listeners.pointerup({pointerId:7});
assert(saves().at(-1).data.settings.sidebarWidth===320,"La largeur du menu n'est pas memorisee apres glissement.");

startDrag();
listeners.pointermove({pointerId:7,buttons:1,clientX:9000});
listeners.pointerup({pointerId:7});
assert(saves().at(-1).data.settings.sidebarWidth===430,"La largeur du menu n'est pas bornee vers le haut.");

startDrag();
listeners.pointermove({pointerId:7,buttons:1,clientX:20});
listeners.pointerup({pointerId:7});
assert(saves().at(-1).data.settings.sidebarWidth===196,"La largeur du menu n'est pas bornee vers le bas.");

// Regression : un mouvement bouton relache doit clore le glissement, sinon le
// menu continue de suivre le curseur longtemps apres le relachement.
startDrag();
listeners.pointermove({pointerId:7,buttons:1,clientX:300});
listeners.pointermove({pointerId:7,buttons:0,clientX:300});
const settled = saves().length;
listeners.pointermove({pointerId:7,buttons:0,clientX:210});
listeners.pointermove({pointerId:7,buttons:0,clientX:412});
assert(saves().length===settled,"Un mouvement apres relachement continue de redimensionner le menu.");
assert(saves().at(-1).data.settings.sidebarWidth===300,"La largeur retenue apres relachement est incorrecte.");

// Un pointercancel doit rendre la main sans enregistrer une largeur partielle.
startDrag();
listeners.pointermove({pointerId:7,buttons:1,clientX:250});
listeners.pointercancel({});
const afterCancel = saves().length;
listeners.pointermove({pointerId:7,buttons:0,clientX:400});
assert(saves().length===afterCancel,"Un pointercancel laisse le glissement actif.");

// Le panneau droit se redimensionne depuis son bord gauche. La largeur est
// calculee depuis le bord droit de la fenetre, puis bornee et memorisee.
load([card("r1","Carte","ready")],{utilityPanelOpen:true,utilityPanelWidth:390});
const utilityGrip={setPointerCapture(){},dataset:{}};
const utilityGripTarget={dataset:{},closest(selector){return selector==="[data-utility-resize]"?utilityGrip:null;}};
const startUtilityDrag=()=>listeners.pointerdown({target:utilityGripTarget,pointerId:8,preventDefault(){},stopPropagation(){}});
startUtilityDrag();
listeners.pointermove({pointerId:8,buttons:1,clientX:1010});
listeners.pointerup({pointerId:8});
assert(saves().at(-1).data.settings.utilityPanelWidth===430,"La largeur du panneau droit n'est pas memorisee apres glissement.");
startUtilityDrag();
listeners.pointermove({pointerId:8,buttons:1,clientX:0});
listeners.pointerup({pointerId:8});
assert(saves().at(-1).data.settings.utilityPanelWidth===620,"La largeur du panneau droit n'est pas bornee vers le haut.");
startUtilityDrag();
listeners.pointermove({pointerId:8,buttons:1,clientX:1400});
listeners.pointerup({pointerId:8});
assert(saves().at(-1).data.settings.utilityPanelWidth===320,"La largeur du panneau droit n'est pas bornee vers le bas.");

// --- Theme : par defaut automatique, resolu et memorise ---------------------
const root = () => document.documentElement;
load([card("t1","Carte","ready")]);
assert(saves().length===0||saves().at(-1).data.settings.theme==="auto","Le theme par defaut n'est pas automatique.");
assert(root().attributes["data-theme"]==="light","En automatique sur un systeme clair, la racine doit porter data-theme=light.");
assert(root().attributes["data-palette"]==="graphite","La palette Graphite n'est pas appliquee par defaut.");
assert(root().attributes["data-font-size"]==="normal","La taille de texte normale n'est pas appliquee par defaut.");
assert(bridgeMessages.find(message=>message.action==="setAppearance")?.mode==="auto","Le mode Système est figé dans le pont natif.");

const prefs = values => ({id:"preferences-form",dataset:{},formValues:{defaultModel:"gpt-5.6-sol",defaultEffort:"medium",maxConcurrency:"1",defaultBoardPreset:"classic",autoArchiveCompletedDays:"0",...values}});
listeners.submit({target:prefs({theme:"dark",themePalette:"midnight"}),preventDefault(){}});
assert(saves().at(-1).data.settings.theme==="dark","Le theme sombre n'est pas enregistre.");
assert(saves().at(-1).data.settings.themePalette==="midnight","La palette Minuit n'est pas enregistree.");
assert(root().attributes["data-theme"]==="dark","Le theme sombre n'est pas applique a la racine.");
assert(root().attributes["data-palette"]==="midnight","La palette Minuit n'est pas appliquee a la racine.");
assert(bridgeMessages.filter(message=>message.action==="setAppearance").at(-1)?.resolvedMode==="dark","Le mode sombre résolu n'est pas transmis au natif.");

listeners.submit({target:prefs({theme:"light",themePalette:"ember"}),preventDefault(){}});
assert(saves().at(-1).data.settings.theme==="light","Le theme clair n'est pas enregistre.");
assert(saves().at(-1).data.settings.themePalette==="ember","La palette Braise n'est pas enregistree.");
assert(root().attributes["data-theme"]==="light","Le theme clair n'est pas applique a la racine.");
assert(root().attributes["data-palette"]==="ember","La palette Braise n'est pas appliquee a la racine.");

listeners.submit({target:prefs({fontSize:"xlarge"}),preventDefault(){}});
assert(saves().at(-1).data.settings.fontSize==="xlarge","La taille de texte choisie n'est pas enregistree.");
assert(root().attributes["data-font-size"]==="xlarge","La taille de texte choisie n'est pas appliquee a la racine.");

// Une valeur inconnue retombe sur automatique plutot que de casser l affichage.
listeners.submit({target:prefs({theme:"neon",themePalette:"laser",fontSize:"immense"}),preventDefault(){}});
assert(saves().at(-1).data.settings.theme==="auto","Un theme inconnu ne retombe pas sur automatique.");
assert(saves().at(-1).data.settings.themePalette==="graphite","Une palette inconnue ne retombe pas sur Graphite.");
assert(saves().at(-1).data.settings.fontSize==="normal","Une taille de texte inconnue ne retombe pas sur Normal.");

// --- Sonde de connexion des moteurs ----------------------------------------
// « Installe » ne dit que si la commande existe. Seule la sonde prouve qu un
// moteur repond : le panneau doit distinguer les deux et ne jamais les confondre.
load([card("t1","Carte","ready")]);
click({select:"settingsView"});
const agents = () => body();
context.window.CodexBoard.agentStatus({codex:true,claude:true});
assert(agents().includes("Disponible sur ce Mac"),"La disponibilite locale du moteur n'est pas distinguee de sa connexion.");
assert(agents().includes("À tester"),"Un compte jamais teste doit le dire explicitement.");
assert(agents().includes('data-action="probe-agent"'),"Le panneau Comptes n'offre pas de test de connexion.");
const codexSettings=agents().slice(agents().indexOf('id="settings-codex"'),agents().indexOf('id="settings-claude"'));
assert(codexSettings.includes("Gérer les comptes")&&!codexSettings.includes('data-action="probe-agent"'),"La connexion est encore geree a deux endroits differents.");
assert(element("#sidebar-engines").innerHTML.includes("À tester"),"Le panneau lateral confond encore moteur disponible et compte connecte.");
assert(!agents().includes(">Prêt<"),"« Installe » ne doit jamais etre presente comme « pret ».");

bridgeMessages.length=0;
click({action:"probe-agent",engine:"codex"});
const probeCall = bridgeMessages.find(message => message.action==="agentProbe");
assert(probeCall && probeCall.engine==="codex","Le bouton de test n'envoie pas la sonde au natif.");
assert(agents().includes("Test en cours"),"L'etat « test en cours » n'est pas affiche.");

context.window.CodexBoard.agentProbeResult({engine:"codex",state:"ready",detail:"pong",at:iso(0)});
assert(agents().includes("Connexion testée"),"Une sonde reussie n'affiche pas un etat de connexion clair.");
assert(!agents().includes("pong"),"La reponse technique pong est encore montree a l'utilisateur.");
assert(element("#sidebar-engines").innerHTML.includes("Connexion testée"),"Le panneau lateral n'affiche pas le resultat reel du compte actif.");
const savedProbe=saves().at(-1).data.settings.accountChecks["codex:default"];
assert(savedProbe?.state==="ready"&&savedProbe.at,"Le test reussi n'est pas enregistre avec le compte.");

// Un redemarrage doit conserver le dernier test sans pretendre qu il vient
// d avoir lieu : la date enregistree reste visible.
load([card("t1","Carte","ready")],{accountChecks:{"codex:default":savedProbe}});
context.window.CodexBoard.agentStatus({codex:true,claude:true});
click({select:"settingsView"});
assert(agents().includes("Connexion testée"),"Le dernier test disparait apres rechargement des donnees.");

context.window.CodexBoard.agentProbeResult({engine:"claude-code",state:"blocked",detail:"La connexion Claude a expiré ou a été révoquée.",at:iso(0)});
assert(agents().includes("À reconnecter"),"Une sonde en echec n'est pas signalee.");
assert(agents().includes("Réglages → Agents et modèles"),"Une connexion expirée n'indique pas comment rétablir Claude Code.");
assert(!agents().includes("révoquée"),"Le détail technique de connexion est encore exposé.");
// Le resultat d un moteur ne doit pas ecraser celui de l autre.
assert(agents().includes("Connexion testée"),"Le resultat de la sonde Codex est perdu quand Claude repond.");

// --- Connexion aux moteurs --------------------------------------------------
bridgeMessages.length=0;
click({action:"login-agent",engine:"claude-code"});
const loginCall = bridgeMessages.find(message => message.action==="agentLogin");
assert(loginCall && loginCall.engine==="claude-code","Le bouton « Se connecter » n'ouvre pas la connexion du bon moteur.");

context.window.CodexBoard.agentProbeResult({engine:"claude-code",state:"login",detail:"Terminal est ouvert sur « claude auth login ».",at:iso(0)});
assert(agents().includes("Termine la connexion dans Terminal"),"L'ouverture de la connexion n'indique pas l'etape suivante.");

// --- Verrou de l application ------------------------------------------------
load([card("t1","Carte","ready")]);
context.window.CodexBoard.conversationsSynced({conversations:[],total:1,failed:0,durationMs:1250});
assert(element("#sidebar-sync").innerHTML.includes("<strong>Codex</strong>"),"L'indicateur ne nomme pas le moteur Codex.");
assert(element("#sidebar-sync").innerHTML.includes("<small>À jour</small>"),"L'indicateur Codex ne confirme pas son etat actualise.");
assert(element("#sidebar-sync").title.includes("conversation principale Codex"),"Le detail de l'indicateur Codex ne precise pas ce qui a ete relu.");
context.window.CodexBoard.securityStatus({lockEnabled:false,biometry:"Touch ID"});
click({select:"settingsView"});
const page = () => body();
assert(page().includes("Verrouiller CTRL KANB à l’ouverture"),"La section Securite n'expose pas le verrou.");
assert(page().includes("Touch ID"),"Le geste d'authentification reel n'est pas nomme.");

bridgeMessages.length=0;
click({action:"toggle-app-lock"});
const lockCall = bridgeMessages.find(message => message.action==="setAppLock");
assert(lockCall && lockCall.enabled===true,"Activer le verrou n'envoie pas la demande au natif.");

context.window.CodexBoard.securityStatus({lockEnabled:true,biometry:"Touch ID"});
assert(page().includes("Verrouiller maintenant"),"Le verrou actif n'offre pas de verrouillage immediat.");
bridgeMessages.length=0;
click({action:"toggle-app-lock"});
assert(bridgeMessages.find(message => message.action==="setAppLock")?.enabled===false,"Desactiver le verrou n'envoie pas la demande inverse.");
// L etat vient du natif, jamais de la case : le trousseau reste la source.
assert(bridgeMessages.every(message => message.action!=="save"),"Le verrou ne doit pas etre ecrit dans board.json.");

// --- Langue -----------------------------------------------------------------
// La table de traduction est chargee comme le fait index.html.
vm.runInContext(fs.readFileSync(`${__dirname}/../Resources/i18n.js`, "utf8"), context, { filename: "i18n.js" });
context.window.navigator = { language: "fr-FR" };

load([card("t1","Carte","ready")]);
assert(saves().length===0||saves().at(-1).data.settings.language==="auto","La langue par defaut n'est pas automatique.");
assert(root().attributes["lang"]==="fr","En automatique sur un systeme francais, la racine doit porter lang=fr.");

const prefsLang = value => ({id:"preferences-form",dataset:{},formValues:{defaultModel:"gpt-5.6-sol",defaultEffort:"medium",maxConcurrency:"1",defaultBoardPreset:"classic",autoArchiveCompletedDays:"0",theme:"auto",language:value}});
listeners.submit({target:prefsLang("en"),preventDefault(){}});
assert(saves().at(-1).data.settings.language==="en","La langue anglaise n'est pas enregistree.");
assert(root().attributes["lang"]==="en","L'attribut lang de la racine ne suit pas le reglage.");
click({select:"settingsView"});
assert(body().includes("Appearance"),"L'interface ne bascule pas en anglais.");
assert(!body().includes("Apparence"),"Du francais subsiste apres bascule en anglais.");

listeners.submit({target:prefsLang("fr"),preventDefault(){}});
assert(body().includes("Apparence"),"Le retour au francais ne fonctionne pas.");

// Une valeur inconnue retombe sur automatique plutot que de casser l affichage.
listeners.submit({target:prefsLang("klingon"),preventDefault(){}});
assert(saves().at(-1).data.settings.language==="auto","Une langue inconnue ne retombe pas sur automatique.");

// Le pluriel n a pas la meme frontiere dans les deux langues.
listeners.submit({target:prefsLang("en"),preventDefault(){}});
click({select:"settingsView"});
assert(body().includes("1 session")&&body().includes("2 sessions"),"Le pluriel anglais est incorrect dans les reglages.");
listeners.submit({target:prefsLang("fr"),preventDefault(){}});
click({select:"settingsView"});
assert(body().includes("1 session")&&body().includes("2 sessions"),"Le pluriel francais est incorrect dans les reglages.");

// --- Panneau de reglages ----------------------------------------------------
load([card("t1","Carte","ready")]);
click({select:"settingsView"});

// Toute section listee dans le menu existe, et toute section existe dans le menu.
// Le menu vit desormais dans la barre laterale, qui remplace la navigation
// principale tant qu on est dans les reglages.
const settingsPage = body();
const settingsNav = element("#sidebar-nav").innerHTML;
const navTargets = [...settingsNav.matchAll(/data-action="scroll-setting" data-target="([^"]+)"/g)].map(m=>m[1]);
const sectionIDs = [...settingsPage.matchAll(/<section id="(settings-[a-z-]+)"/g)].map(m=>m[1]);
assert(navTargets.length>0,"La barre laterale n affiche pas le menu des reglages.");
assert(!settingsPage.includes('class="settings-nav"'),"La page des reglages garde une seconde colonne de navigation.");
assert(navTargets.length===sectionIDs.length,"Le menu des reglages et les sections ne se correspondent pas.");
for(const id of sectionIDs) assert(navTargets.includes(id),`La section ${id} n'a pas d'entree dans le menu.`);
for(const id of navTargets) assert(sectionIDs.includes(id),`Le menu pointe vers ${id}, qui n'existe pas.`);
const expectedSettingsOrder=["settings-appearance","settings-interface","settings-tasks","settings-calendar","settings-archives","settings-agents","settings-sync","settings-accounts","settings-engine","settings-security","settings-data","settings-about"];
assert(sectionIDs.join("|")===expectedSettingsOrder.join("|"),"L ordre des reglages ne suit plus la hierarchie Personnalisation, Travail, Agents IA et Systeme.");
assert(!settingsNav.includes(">Général<")&&!settingsPage.includes('id="settings-general"'),"L ancienne rubrique General subsiste alors qu elle ne porte plus de contenu coherent.");
const appearanceSettings=settingsPage.slice(settingsPage.indexOf('id="settings-appearance"'),settingsPage.indexOf('id="settings-interface"'));
const notificationSettings=settingsPage.slice(settingsPage.indexOf('id="settings-interface"'),settingsPage.indexOf('id="settings-tasks"'));
assert(appearanceSettings.includes('data-action="reset-sidebar"')&&appearanceSettings.includes('data-action="reset-utility-width"'),"Les largeurs de panneaux ne sont pas rangees dans Apparence.");
assert(!notificationSettings.includes('data-action="reset-sidebar"')&&!notificationSettings.includes('data-action="reset-utility-width"'),"Notifications contient encore les reglages de largeur des panneaux.");
const agentSettings=settingsPage.slice(settingsPage.indexOf('id="settings-agents"'),settingsPage.indexOf('id="settings-sync"'));
assert(agentSettings.includes('name="defaultAgentEngine"')&&agentSettings.includes('id="settings-codex"')&&agentSettings.includes('id="settings-claude"'),"L agent par defaut et les modeles ne sont pas regroupes.");

// Apparence : luminosite et palette restent deux choix independants, avec un
// apercu de toutes les variantes comme dans Hermes.
assert(occurrences(settingsPage,'name="theme"')===3,"Les trois modes de couleur ne sont pas tous proposes.");
assert(occurrences(settingsPage,'name="themePalette"')===6,"Les six palettes ne sont pas toutes proposees.");
assert(occurrences(settingsPage,'name="fontSize"')===4,"Les quatre tailles de texte ne sont pas toutes proposees.");
for(const size of ["Normale","Confort","Grande","Très grande"])
  assert(settingsPage.includes(`>${size}<`),`La taille de texte ${size} manque dans les reglages.`);
for(const palette of ["Graphite","Azur","Minuit","Braise","Ardoise","Terminal"])
  assert(settingsPage.includes(`>${palette}<`),`La palette ${palette} manque dans les reglages.`);
assert(settingsPage.includes('class="theme-palette-preview"'),"Les palettes ne possedent pas d apercu visuel.");
assert(settingsPage.includes("Dans CTRL KANB")&&settingsPage.includes("Notifications macOS"),"Les messages internes et les notifications système ne sont pas séparés.");
assert(settingsPage.includes('name="inAppNotifications"')&&settingsPage.includes('name="systemNotificationsEnabled"')&&settingsPage.includes('name="notificationWhen"'),"Les canaux ou le moment des notifications ne sont pas configurables.");
assert(!/<select name="syncIntervalSeconds"[^>]*disabled/.test(settingsPage),"La fréquence d actualisation est bloquée lorsque l actualisation automatique est coupée.");
for(const eventName of ["taskComplete","taskFailed","approval","chatReply","scheduleIssue"])
  assert(settingsPage.includes(`name="notificationEvent__${eventName}"`),`La catégorie de notification ${eventName} manque des réglages.`);
context.window.CodexBoard.notificationAuthorizationStatus({status:"denied"});
assert(body().includes("Bloquées par macOS")&&body().includes('data-action="open-notification-settings"'),"Un refus de macOS n indique pas comment rétablir les notifications.");
bridgeMessages.length=0;
click({action:"open-notification-settings"});
assert(bridgeMessages.some(message=>message.action==="openNotificationSettings"),"Le bouton d autorisation n ouvre pas les réglages de notifications macOS.");

// L organisation reste facultative : l ecran explique ce qui est actif au lieu
// de montrer des compteurs vides, puis ouvre un editeur dedie si on la configure.
assert(settingsPage.includes("Classement des tâches")&&settingsPage.includes("Simple par défaut."),"Le classement facultatif n est pas explique dans les reglages de taches.");
assert(!settingsPage.includes('class="organisation-summary"'),"Les anciens compteurs abstraits occupent encore l ecran Organisation.");
click({action:"settings"});
assert(modal().includes('id="settings-form"')&&modal().includes("La création reste simple."),"L editeur d organisation ne relie pas ses options a la creation de taches.");
assert(modal().includes("Aucune valeur : cet axe reste invisible dans les tâches."),"Un axe vide ne dit pas clairement qu il reste masque.");
click({action:"close-modal"});

// Le menu doit dire ou l on est.
const activeEntry = (html,id) => new RegExp(`class="settings-nav-item active"[^>]*data-target="${id}"`).test(html);
assert(activeEntry(settingsNav,"settings-appearance"),"Aucune entree de menu n'est marquee active.");
click({action:"scroll-setting",target:"settings-security"});
click({select:"settingsView"});
assert(activeEntry(element("#sidebar-nav").innerHTML,"settings-security"),"Le menu ne suit pas la section choisie.");

// Le menu reste complet et direct : aucune barre de recherche sans valeur.
assert(!element("#sidebar-nav").innerHTML.includes('id="settings-search"'),"La recherche inutile des reglages subsiste.");
assert(!fs.readFileSync(`${__dirname}/../Resources/index.html`,"utf8").includes('id="sidebar-command"'),"La recherche permanente inutile subsiste dans le panneau lateral.");

// Un reglage s applique au changement, sans passer par un bouton d enregistrement.
const prefsForm = values => ({id:"preferences-form",dataset:{},formValues:{defaultModel:"gpt-5.6-sol",defaultEffort:"medium",maxConcurrency:"1",defaultBoardPreset:"classic",autoArchiveCompletedDays:"0",theme:"auto",themePalette:"graphite",language:"fr",inAppNotifications:"all",systemNotificationsEnabled:"on",notificationWhen:"background",notificationEvent__taskComplete:"on",notificationEvent__taskFailed:"on",notificationEvent__approval:"on",notificationEvent__chatReply:"on",notificationEvent__scheduleIssue:"on",...values}});
const changeEvent = form => ({target:{closest:selector=>selector==="#preferences-form"?form:null}});
const savesBefore = saves().length;
listeners.change(changeEvent(prefsForm({autoSync:"",syncIntervalSeconds:"300"})));
assert(saves().at(-1).data.settings.autoSync===false&&saves().at(-1).data.settings.syncIntervalSeconds===300,"La fréquence choisie n est pas enregistrée tant que l actualisation automatique reste coupée.");
listeners.change(changeEvent(prefsForm({notificationWhen:"all",notificationEvent__chatReply:""})));
assert(saves().length>savesBefore,"Changer un reglage ne l'enregistre pas.");
assert(saves().at(-1).data.settings.notificationWhen==="all"&&saves().at(-1).data.settings.notificationEvents.chatReply===false,"Le moment ou la catégorie d’une notification macOS n'est pas retenu.");
assert(saves().at(-1).data.settings.notifications==="all","La compatibilité de l’ancien réglage de notification n’est pas maintenue.");
assert(!body().includes("Enregistrer les réglages"),"Un bouton d'enregistrement subsiste alors que tout s'applique au changement.");
listeners.change(changeEvent(prefsForm({systemNotificationsEnabled:""})));
assert(saves().at(-1).data.settings.systemNotificationsEnabled===false&&saves().at(-1).data.settings.notifications==="none","Couper le canal macOS ne coupe pas réellement l’ancien et le nouveau réglage.");
bridgeMessages.length=0;
listeners.change(changeEvent(prefsForm({systemNotificationsEnabled:"on"})));
assert(bridgeMessages.some(message=>message.action==="requestNotifications"),"Réactiver les notifications ne demande pas l’autorisation à macOS.");
listeners.change(changeEvent(prefsForm({inAppNotifications:"essential"})));
const quietToastCount=toasts.length;
click({action:"reset-sidebar"});
assert(toasts.length===quietToastCount,"Le mode Essentiels affiche encore une confirmation de routine.");
context.window.CodexBoard.nativeError({message:"Erreur importante"});
assert(lastToast()==="Erreur importante","Le mode Essentiels masque une erreur importante.");
listeners.change(changeEvent(prefsForm({fontSize:"large"})));
assert(saves().at(-1).data.settings.fontSize==="large"&&root().attributes["data-font-size"]==="large","Le changement de taille de texte ne s'applique pas immediatement.");

// Les nouveaux reglages sont normalises comme les anciens.
listeners.change(changeEvent(prefsForm({notificationWhen:"n_importe_quoi",inAppNotifications:"inconnu",agendaMode:"trimestre",syncIntervalSeconds:"7"})));
const settledSettings = saves().at(-1).data.settings;
assert(settledSettings.notificationWhen==="background"&&settledSettings.inAppNotifications==="all","Un mode de notification inconnu ne retombe pas sur une valeur sûre.");
assert(settledSettings.agendaMode==="week","Une vue d'agenda inconnue ne retombe pas sur la semaine.");
assert(settledSettings.syncIntervalSeconds===60,"Une cadence de synchronisation inconnue ne retombe pas sur 60 secondes.");

// L Agenda suit la region du Mac par defaut et accepte aussi des choix
// explicites. Les heures enregistrees restent des instants UTC.
assert(settingsPage.includes('id="settings-calendar"'),"La section de reglages de l Agenda manque.");
assert(settingsPage.includes('name="agendaTimeZone"')&&settingsPage.includes('name="agendaWeekStart"')&&settingsPage.includes('name="agendaHourCycle"'),"Les reglages regionaux de l Agenda ne sont pas tous exposes.");
listeners.change(changeEvent(prefsForm({agendaTimeZone:"Europe/Paris",agendaWeekStart:"0",agendaHourCycle:"h12",agendaMode:"day"})));
const calendarSettings=saves().at(-1).data.settings;
assert(calendarSettings.agendaTimeZone==="Europe/Paris","Le fuseau explicite de l Agenda n'est pas conserve.");
assert(calendarSettings.agendaWeekStart==="0","Le premier jour de semaine n'est pas conserve.");
assert(calendarSettings.agendaHourCycle==="h12","Le format 12 heures n'est pas conserve.");
click({select:"agendaView"});
assert(body().includes("AM")||body().includes("PM"),"La grille de l Agenda n'applique pas le format 12 heures.");

// Une ancienne heure locale est migree une seule fois vers un instant absolu.
load([card("tz1","Ancienne planification","ready",{launchMode:"scheduled",scheduledAt:"2030-05-06T09:30"})],{agendaTimeZone:"Europe/Paris",agendaWeekStart:"1",agendaHourCycle:"h23"});
assert(saves().at(-1).data.cards.find(item=>item.id==="tz1").scheduledAt==="2030-05-06T07:30:00.000Z","Une ancienne planification locale n'est pas convertie en UTC.");

// L editeur refuse une heure inexistante au passage a l heure d ete.
const cardCountBefore=saves().at(-1).data.cards.length;
listeners.submit({target:{id:"card-form",dataset:{simple:"true"},formValues:{title:"Heure impossible",prompt:"Verifier le passage a l heure d ete",spaceID:"space-1",executionType:"scheduled",scheduledAt:"2027-03-28T02:30",agentEngine:"codex",runMode:"readOnly"}},preventDefault(){}});
assert(saves().at(-1).data.cards.length===cardCountBefore,"Une heure inexistante pendant le changement d'heure a ete enregistree.");
assert(lastToast().includes("n’existe pas"),"L'editeur n'explique pas pourquoi l'heure saisonniere est refusee.");

// Une recurrence garde son heure murale meme lorsque l offset saisonnier change.
load([card("tz2","Routine saisonniere","ready",{launchMode:"scheduled",scheduledAt:"2027-03-27T08:30:00.000Z",recurrence:"daily",boardPresetID:"routines"})],{agendaTimeZone:"Europe/Paris",agendaWeekStart:"1",agendaHourCycle:"h23"});
click({action:"agenda-complete",id:"tz2"});
const seasonalCopy=saves().at(-1).data.cards.find(item=>item.id!=="tz2");
assert(seasonalCopy?.scheduledAt==="2027-03-28T07:30:00.000Z","La recurrence ne conserve pas 09:30 apres le changement d'heure.");

load([card("month-end","Routine fin de mois","ready",{launchMode:"scheduled",scheduledAt:"2027-01-31T08:30:00.000Z",recurrence:"monthly",boardPresetID:"routines",recurrenceSeriesID:"month-end-series"})],{agendaTimeZone:"Europe/Paris",agendaWeekStart:"1",agendaHourCycle:"h23"});
click({action:"agenda-complete",id:"month-end"});
const monthEndCopy=saves().at(-1).data.cards.find(item=>item.id!=="month-end");
assert(monthEndCopy?.scheduledAt==="2027-02-28T08:30:00.000Z","Une routine du dernier jour du mois saute encore le mois de février.");

// La largeur du panneau se remet a sa valeur d origine depuis les reglages.
listeners.change(changeEvent(prefsForm({})));
click({action:"reset-sidebar"});
assert(saves().at(-1).data.settings.sidebarWidth===248,"Le bouton ne retablit pas la largeur d'origine du panneau.");
click({action:"reset-utility-width"});
assert(saves().at(-1).data.settings.utilityPanelWidth===390,"Le bouton ne retablit pas la largeur d'origine du panneau droit.");

// La case du verrou reflete le trousseau, pas le clic : elle ne bascule pas seule.
context.window.CodexBoard.securityStatus({lockEnabled:false,biometry:"Touch ID"});
click({select:"settingsView"});
bridgeMessages.length=0;
click({action:"toggle-app-lock"});
assert(bridgeMessages.some(m=>m.action==="setAppLock"&&m.enabled===true),"La case du verrou n'envoie pas la demande.");
assert(!body().includes('data-action="toggle-app-lock" checked'),"La case du verrou s'est cochee avant l'accord du systeme.");

// --- Les deux moteurs sont a egalite ----------------------------------------
load([card("t1","Carte","ready")]);
click({select:"settingsView"});
const enginesPage = body();
assert(enginesPage.includes('name="defaultAgentEngine"'),"Les reglages ne permettent pas de choisir l'agent par defaut.");
assert(enginesPage.includes('name="defaultModelCodex"'),"Aucun modele Codex par defaut.");
assert(enginesPage.includes('name="defaultModelClaude"'),"Aucun modele Claude par defaut.");
assert(enginesPage.includes('id="settings-codex"')&&enginesPage.includes('id="settings-claude"'),"Codex et Claude ne sont pas separes en deux blocs.");
assert(enginesPage.includes('name="defaultEffortCodex"')&&enginesPage.includes('name="defaultEffortClaude"'),"La profondeur par defaut reste partagee.");
assert(enginesPage.includes('name="maxConcurrencyCodex"')&&enginesPage.includes('name="maxConcurrencyClaude"'),"La simultaneite reste partagee.");
assert(enginesPage.includes("Conversations différentes en parallèle")&&enginesPage.includes("Sessions différentes en parallèle"),"La capacite parallele ne distingue pas les conversations Codex des sessions Claude.");
assert(enginesPage.includes("Une même session reste séquentielle"),"La serialisation d une session Claude n est pas expliquee.");
assert(enginesPage.includes("Plusieurs sessions dans un même dossier peuvent modifier les mêmes fichiers"),"Le risque de modifier un meme dossier depuis plusieurs sessions Claude n est pas explique.");
assert(enginesPage.includes("Claude Opus")&&enginesPage.includes("Claude Sonnet")&&enginesPage.includes("Claude Haiku"),"Les modeles Claude n'apparaissent pas dans les reglages.");
assert(enginesPage.includes("Automatique (recommandé)"),"Claude ne propose pas le routage automatique compatible avec le compte.");
assert(enginesPage.includes("Automatique laisse Claude Code CLI choisir un modèle disponible pour ce compte."),"Le routage automatique Claude n'est pas explique.");
assert(enginesPage.includes("GPT-5.6 Sol"),"Les modeles Codex ont disparu des reglages.");
assert(enginesPage.includes('class="engine-logo codex-logo"')&&enginesPage.includes('class="engine-logo claude-code-logo"'),"Les icones fonctionnelles des deux moteurs manquent dans les reglages.");
assert(!enginesPage.includes('src="Brands/'),"Un logo de fournisseur est encore embarque dans les reglages.");
assert(enginesPage.includes("Connexion locale via Claude Code CLI"),"La provenance technique de l integration Claude manque dans les reglages.");
assert(!fs.existsSync(`${__dirname}/../Resources/Brands`),"Des ressources de marque tierces restent embarquees.");
assert(!enginesPage.includes("settings-acp")&&!enginesPage.includes("settings-providers"),"Les agents externes sont encore visibles.");

load([card("claude-route","Route Claude","ready",{agentEngine:"claudeCode",model:"gpt-5.6-sol"})],{defaultModelClaude:"default"});
const migratedClaude=saves().at(-1).data.cards.find(item=>item.id==="claude-route");
assert(migratedClaude.agentEngine==="claude-code"&&migratedClaude.model==="default","Une ancienne carte Claude conserve encore un modèle Codex indisponible.");
click({select:"settingsView"});

const enginePrefs = values => ({id:"preferences-form",dataset:{},formValues:{defaultAgentEngine:"claude-code",defaultModelCodex:"gpt-5.6-luna",defaultModelClaude:"opus",defaultEffortCodex:"high",defaultEffortClaude:"low",maxConcurrencyCodex:"3",maxConcurrencyClaude:"1",defaultBoardPreset:"classic",autoArchiveCompletedDays:"0",theme:"auto",language:"fr",...values}});
listeners.change({target:{closest:selector=>selector==="#preferences-form"?enginePrefs({}):null}});
const engineSettings = saves().at(-1).data.settings;
assert(engineSettings.defaultAgentEngine==="claude-code","L'agent par defaut n'est pas enregistre.");
assert(engineSettings.defaultModelClaude==="opus","Le modele Claude par defaut n'est pas enregistre.");
assert(engineSettings.defaultModelCodex==="gpt-5.6-luna","Le modele Codex par defaut n'est pas enregistre.");
assert(engineSettings.defaultEffortCodex==="high"&&engineSettings.defaultEffortClaude==="low","Les profondeurs propres a chaque agent ne sont pas enregistrees.");
assert(engineSettings.maxConcurrencyCodex===3&&engineSettings.maxConcurrencyClaude===1,"Les limites propres a chaque agent ne sont pas enregistrees.");
const concurrencyCall=bridgeMessages.findLast(message=>message.action==="setConcurrency");
assert(concurrencyCall?.codex===3&&concurrencyCall?.claude===1,"Les deux limites ne sont pas transmises au moteur natif.");

// Une nouvelle tache suit l agent par defaut, plus un moteur ecrit en dur.
click({action:"add-card"});
assert(modal().includes('value="claude-code" selected'),"L'editeur ne propose pas l'agent par defaut choisi.");
assert(!modal().includes('value="acp:'),"Un agent externe subsiste dans le choix d'une tache.");
assert(!modal().includes('name="model"')&&!modal().includes('name="reasoningEffort"')&&!modal().includes('name="launchMode"'),"L'editeur de tache n'est pas simplifie.");
assert(modal().includes('name="executionType"'),"Le type d'execution manque dans l'editeur simplifie.");
assert(modal().includes('name="notificationMode"')&&modal().includes("Suivre les réglages généraux")&&modal().includes("Rester silencieuse"),"La tâche ne peut pas hériter, forcer ou couper ses notifications.");
assert(modal().includes("Organisation avancée")&&modal().includes('name="priorityLevelID"'),"Le classement facultatif n est plus accessible depuis l editeur simplifie.");
assert(!modal().includes('name="category__objective"'),"Un axe vide alourdit encore l editeur de tache.");

// Une valeur configuree apparait dans le volet replie et sa selection est
// reellement conservee avec la priorite et les etiquettes.
load([card("org-1","Tache classee","ready")],{taxonomy:[{id:"goal",name:"Objectif",kind:"objective",multiple:false,values:[{id:"launch",name:"Lancement",color:"2F6FEB"}]}]});
click({action:"edit-card",id:"org-1"});
assert(modal().includes('name="category__goal"')&&modal().includes('value="launch"'),"Un objectif configure n apparait pas dans la tache.");
listeners.submit({target:{id:"card-form",dataset:{id:"org-1",simple:"true"},formValues:{title:"Tache classee",prompt:"Preparer le lancement",spaceID:"space-1",agentEngine:"codex",runMode:"readOnly",executionType:"manual",notificationMode:"always",priorityLevelID:"urgent",category__goal:"launch",labels:"client, documentation"}},preventDefault(){}});
const organisedCard=saves().at(-1).data.cards.find(item=>item.id==="org-1");
assert(organisedCard.priorityLevelID==="urgent","La priorite choisie dans Organisation avancee n est pas conservee.");
assert(organisedCard.categoryAssignments.goal?.[0]==="launch","L objectif choisi dans Organisation avancee n est pas conserve.");
assert(organisedCard.labels.join("|")==="client|documentation","Les etiquettes saisies dans Organisation avancee ne sont pas conservees.");
assert(organisedCard.notificationMode==="always","Le choix de notification propre à la tâche n est pas conservé.");
click({action:"edit-card",id:"org-1"});
assert(/class="simple-organisation" open/.test(modal()),"Le volet Organisation avancee ne se rouvre pas pour une tache deja classee.");
assert(modal().includes('value="always" selected'),"Le choix de notification de la tâche ne se rouvre pas correctement.");

// --- Comptes multiples ------------------------------------------------------
load([card("t1","Carte","ready")]);
click({select:"settingsView"});
assert(body().includes("settings-accounts"),"La gestion multi-compte a disparu des reglages.");
assert(body().includes("settings-tasks")&&body().includes("Classement des tâches"),"L'organisation avancee a disparu des reglages de taches.");
assert(body().includes("settings-engine"),"Le planificateur local a disparu des reglages.");

// Un lancement transmet le compte du moteur de la carte.
bridgeMessages.length=0;
click({select:"global"});
click({action:"run",id:"t1"});
listeners.submit({target:{id:"run-form",dataset:{id:"t1"},formValues:{}},preventDefault(){}});
const runMessage = bridgeMessages.find(m=>m.action==="run");
if(runMessage) assert(typeof runMessage.accountHome==="string","Le lancement ne transmet pas de compte.");

// Le registre des executions ne survit pas a un rechargement de la vue : sans le
// rappel du natif, une tache qui tourne encore reaffiche « Lancer », et un second
// lancement de la meme carte devient possible.
load([card("t1","Carte","ready")]);
click({select:"global"});
context.window.CodexBoard.runsRestored({running:["t1"],queued:[]});
const busyBoard = body();
assert(!/data-action="run" data-id="t1"/.test(busyBoard),"Une tache encore en cours propose « Lancer ».");
assert(/data-action="suspend-run" data-id="t1"/.test(busyBoard),"Une tache encore en cours n'offre pas « Suspendre ».");
assert(saves().at(-1).data.cards.find(c=>c.id==="t1").status==="running","Le statut n'est pas retabli depuis le natif.");

// Un second lancement doit etre refuse tant que la tache tourne.
const modalsBefore = element("#modal-root").innerHTML;
click({action:"run",id:"t1"});
assert(element("#modal-root").innerHTML===modalsBefore,"Un second lancement de la meme tache reste possible.");

// Au chargement, une file interrompue est volontairement rendue relancable.
load([{...card("t2","En file","queued")}]);
click({select:"global"});
assert(saves().at(-1).data.cards.find(c=>c.id==="t2").status==="ready",
       "Une file interrompue ne redevient pas relancable au chargement.");

// Mais si le natif annonce qu elle est toujours en file, elle redevient occupee.
context.window.CodexBoard.runsRestored({running:[],queued:["t2"]});
const queuedBoard = body();
assert(!/data-action="run" data-id="t2"/.test(queuedBoard),"Une tache toujours en file propose « Lancer ».");
assert(/data-action="suspend-run" data-id="t2"/.test(queuedBoard),"Une tache toujours en file n'offre pas « Suspendre ».");

// La couche ACP a ete retiree : une configuration posee par une version
// precedente ne doit ni reapparaitre dans les reglages, ni laisser une carte
// pointer vers un moteur qui n existe plus.
load([{...card("t1","Carte","ready"),agentEngine:"acp:goose",model:"gemma3:4b"}],
     {acpAgents:[{id:"goose",label:"goose",command:"/opt/homebrew/bin/goose",arguments:["acp"]}]});
const cleaned = saves().at(-1).data;
assert(cleaned.settings.acpAgents===undefined,"L'ancienne configuration ACP est conservee.");
assert(cleaned.cards[0].agentEngine==="codex","Une carte confiee a un agent retire garde un moteur inexistant.");
click({select:"settingsView"});
const legacyHTML = body();
assert(!legacyHTML.includes("settings-acp")&&!legacyHTML.includes("settings-providers"),"Une ancienne configuration ACP reaffiche ses rubriques.");
assert(!legacyHTML.includes("goose")&&!legacyHTML.includes("Ollama"),"Une ancienne configuration ACP reste visible.");
click({select:"global"});
click({action:"add-card"});
assert(!modal().includes('value="acp:'),"Une ancienne configuration ACP revient dans le choix d'agent.");

// Creer un projet depuis l editeur de tache : sans cela il faut tout fermer,
// creer le projet, puis retaper le brief.
load([]);
click({action:"add-card"});
assert(modal().includes('value="__new-space__"'),"L'editeur ne propose pas de creer un projet.");

const formulaireTache = {id:"card-form",dataset:{},formValues:{title:"Ma tache",prompt:"Un brief a ne pas perdre",spaceID:"__new-space__"}};
listeners.change({target:{name:"spaceID",value:"__new-space__",closest:selector=>selector==="form"?formulaireTache:null}});
assert(modal().includes('id="space-form"'),"Choisir « créer un projet » n'ouvre pas la fenetre projet.");

listeners.submit({target:{id:"space-form",dataset:{},formValues:{name:"Projet neuf",rootPath:"/private/tmp",accentHex:"#6E75FF"}},preventDefault(){}});
const revenu = modal();
assert(revenu.includes('id="card-form"'),"L'editeur de tache ne revient pas apres la creation du projet.");
assert(revenu.includes("Un brief a ne pas perdre"),"Le brief saisi est perdu en passant par la creation de projet.");
const projets = saves().at(-1).data.spaces;
assert(projets.some(p=>p.name==="Projet neuf"),"Le projet n'a pas ete cree.");
assert(revenu.includes(`value="${projets.at(-1).id}" selected`),"Le nouveau projet n'est pas selectionne au retour.");

// Tableau vide : repeter « aucune carte » six fois n indique pas par ou
// commencer. Le premier pas doit proposer une action reelle, et disparaitre
// des qu une tache existe.
load([]);
click({select:"global"});
const premierPas = body();
assert(premierPas.includes('data-action="add-card"'),"Un tableau vide n'offre pas de creer une tache.");
assert(!premierPas.includes("Aucune carte dans cette colonne"),"Un tableau vide affiche encore des colonnes vides.");

// Sans projet, creer une tache n a pas de sens : on oriente vers le projet.
load([], {}, []);
click({select:"global"});
const sansProjet = body();
assert(sansProjet.includes('data-action="add-space"'),"Sans projet, le premier pas ne propose pas d'en creer un.");
assert(!sansProjet.includes('data-action="add-card"'),"Sans projet, le premier pas propose quand meme une tache.");
assert(sansProjet.includes("sans exemple ni donnée imposée"),"Le premier lancement n'explique pas qu'il part de donnees vides.");
assert(!sansProjet.includes("Configurer mes espaces")&&!sansProjet.includes("Tester une tâche Codex"),"Le premier lancement montre encore de fausses taches.");
context.window.CodexBoard.agentStatus({codex:true,claude:false});
assert(body().includes("Codex · détecté")&&body().includes("Claude · introuvable"),"Le premier lancement n'explique pas les agents detectes.");

// Export et restauration restent des actions explicites. La restauration passe
// par une confirmation avant d ouvrir le selecteur de fichier natif.
load([card("t1","Carte","ready")]);
click({select:"settingsView"});
click({action:"export-data"});
assert(bridgeMessages.at(-1)?.action==="exportBoard","Le bouton Exporter n appelle pas l export natif.");
click({action:"confirm-import-data"});
assert(modal().includes('id="import-data-form"')&&modal().includes('name="confirm"'),"La restauration ne demande pas de confirmation.");
listeners.submit({target:{id:"import-data-form",dataset:{},formValues:{confirm:"on"}},preventDefault(){}});
assert(bridgeMessages.at(-1)?.action==="importBoard","La restauration confirmee n ouvre pas le selecteur natif.");
context.window.CodexBoard.boardExported({path:"/private/tmp/CTRL-KANB-backup.json"});
assert(lastToast().includes("CTRL-KANB-backup.json"),"L export reussi n est pas confirme.");

// Des qu une carte existe, le tableau reprend sa place.
load([card("t1","Carte","ready")]);
click({select:"global"});
assert(!body().includes("PREMIER PAS"),"Le premier pas survit a la creation d'une carte.");

// L etat d une connexion appartient au compte, pas au moteur : avec plusieurs
// comptes Codex, un etat partage aurait affiche le resultat du dernier teste
// sur tous les autres.
load([card("t1","Carte","ready")],{
  accounts:[{id:"codex:second",engine:"codex",label:"Compte client",home:"~/Library/Application Support/CTRL KANB/Comptes/codex/second"}],
});
context.window.CodexBoard.agentStatus({codex:true,claude:true});
click({select:"settingsView"});

bridgeMessages.length=0;
click({action:"probe-agent",engine:"codex",account:"codex:second"});
const demande = bridgeMessages.find(m=>m.action==="agentProbe");
assert(demande?.account==="codex:second","Le test ne dit pas quel compte il teste.");
assert(demande.home.includes("Comptes/codex/second"),"Le test n'utilise pas le dossier du compte choisi.");

const pendant = body();
assert(/data-account="codex:second"[^>]*disabled/.test(pendant),"Le compte teste ne signale pas son test en cours.");
assert(!/data-account="codex:default"[^>]*disabled/.test(pendant),"Tester un compte bloque les autres.");

// Un jeton unique : il ne doit pas etre montre comme un message utile, mais le
// resultat doit etre memorise uniquement sur le compte teste.
const jeton = "reponse-du-compte-client";
context.window.CodexBoard.agentProbeResult({engine:"codex",account:"codex:second",state:"ready",at:"2026-09-08T10:00:00Z",detail:jeton});
const apres = body();
assert(!apres.includes(jeton),"Le detail technique d'une sonde reussie est encore affiche.");
const sauvegardeComptes=saves().at(-1).data.settings.accountChecks;
assert(sauvegardeComptes["codex:second"]?.state==="ready","Le resultat n'est pas memorise sur le compte teste.");
assert(!sauvegardeComptes["codex:default"],"Le resultat d'un compte deteint sur un autre.");
assert(apres.includes("Utiliser ce compte"),"Le changement de compte n'a pas d'action explicite.");
click({action:"pick-account",engine:"codex",id:"codex:second"});
assert(saves().at(-1).data.settings.activeAccount.codex==="codex:second","Le compte choisi n'est pas conserve comme compte actif.");
assert(lastToast().includes("Compte client"),"La bascule de compte n'est pas confirmee clairement.");

// Les agents partagent désormais une rubrique. Le compte reste accessible
// depuis chaque carte moteur sans recréer deux entrées de navigation.
load([card("t1","Carte","ready")]);
click({select:"settingsView"});
const comptes = body().slice(body().indexOf('id="settings-accounts"'));
const titresRubriques = [...element("#sidebar-nav").innerHTML.matchAll(/<span>([^<]+)<\/span>/g)].map(m=>m[1]);
assert(titresRubriques.includes("Agents et modèles")&&titresRubriques.includes("Comptes"),"Les agents et leurs comptes ne sont pas clairement séparés dans la navigation.");
assert(!titresRubriques.includes("Codex")&&!titresRubriques.includes("Claude Code"),"Codex et Claude occupent encore deux rubriques de navigation redondantes.");
const moteurs = body().slice(body().indexOf('id="settings-agents"'),body().indexOf('id="settings-sync"'));
assert((moteurs.match(/data-target="settings-accounts"/g)||[]).length===2,"Chaque moteur ne renvoie pas vers la rubrique Comptes commune.");
assert(comptes.includes("~/.codex") && comptes.includes("~/.claude"),
       "Le bloc Comptes n'indique pas le dossier reel de chaque compte.");


// --- Lancement groupe -------------------------------------------------------
// Le bouton « Lancer les prêtes » met en file tout ce qui est visible et
// debloque. Trois choses doivent tenir : la liste proposee, la liste
// reellement envoyee, et le compte annonce.
load([
  card("b1","Prete Codex","ready"),
  card("b2","Prete Claude","ready",{agentEngine:"claude-code"}),
  card("b3","Bloquee par dependance","ready",{dependencies:["b4"]}),
  card("b4","Encore a faire","ready"),
  card("b5","Planifiee","ready",{launchMode:"scheduled",scheduledAt:iso(2)}),
  card("b6","Deja terminee","done",{completedAt:iso(0)}),
]);
click({surface:"board",select:"global"});
// L en-tete et le lancement groupe doivent compter les memes cartes : c est le
// meme mot « prêtes » sur le bouton et dans le compteur.
const pretesEnTete = element("#workspace-header").innerHTML.match(/<strong>(\d+)<\/strong>\s*prêtes/);
assert(pretesEnTete&&pretesEnTete[1]==="3",`L en-tete annonce ${pretesEnTete?pretesEnTete[1]:"?"} pretes au lieu de 3.`);
click({action:"run-ready"});
const lot = modal();
assert(occurrences(lot,"<strong>")===3,"Le lancement groupe ne propose pas le meme nombre de cartes que l en-tete.");
assert(lot.includes("Prete Codex")&&lot.includes("Prete Claude")&&lot.includes("Encore a faire"),
       "Le lancement groupe n'annonce pas toutes les cartes pretes.");
assert(!lot.includes("Bloquee par dependance"),"Une carte bloquee par une dependance est proposee au lancement groupe.");
assert(!lot.includes("Planifiee"),"Une carte planifiee est proposee au lancement groupe manuel.");
assert(!lot.includes("Deja terminee"),"Une carte terminee est proposee au lancement groupe.");

// La confirmation porte sur la liste montree. Si une carte part ailleurs entre
// l ouverture et la validation, elle ne doit pas etre relancee en douce.
const runsDemandes = () => bridgeMessages.filter(message=>message.action==="run").map(message=>message.card.id);
bridgeMessages.length=0;
listeners.submit({target:{id:"batch-form",formValues:{}},preventDefault(){}});
const partis = runsDemandes();
assert(partis.includes("b1")&&partis.includes("b2")&&partis.includes("b4"),"Le lancement groupe n'envoie pas les cartes confirmees.");
assert(!partis.includes("b3")&&!partis.includes("b5")&&!partis.includes("b6"),"Le lancement groupe envoie une carte qu'il n'avait pas proposee.");
assert(lastToast().includes("3"),`Le compte annonce ne correspond pas aux 3 envois : « ${lastToast()} »`);

// Une carte prete mais sans brief est refusee par queueCard. L annonce doit le
// dire, sinon l utilisateur croit avoir lance plus de taches qu en realite.
load([
  card("s1","Avec brief","ready"),
  card("s2","Sans brief","ready",{prompt:"   "}),
]);
click({action:"run-ready"});
bridgeMessages.length=0;
listeners.submit({target:{id:"batch-form",formValues:{}},preventDefault(){}});
assert(runsDemandes().length===1,"Une carte sans brief a quand meme ete envoyee a l agent.");
assert(lastToast().includes("1")&&/ecart|écart/i.test(lastToast()),
       `L annonce ne signale pas la carte ecartee : « ${lastToast()} »`);

// Chaque moteur a sa file : deux cartes peuvent etre « n°1 » en meme temps, donc
// la place affichee doit nommer la file pour rester lisible.
load([card("q1","File Codex","ready"),card("q2","File Claude","ready",{agentEngine:"claude-code"})]);
click({surface:"board",select:"global"});
context.window.CodexBoard.queueUpdated({items:[{cardID:"q1",position:1},{cardID:"q2",position:1}]});
// Les libelles de file passent par le dictionnaire : sans entree anglaise, la
// carte resterait en francais pour un utilisateur en anglais.
load([card("q1","File Codex","ready")],{language:"en"});
click({surface:"board",select:"global"});
context.window.CodexBoard.queueUpdated({items:[{cardID:"q1",position:2}]});
assert(body().includes("Codex queue &middot; #2")||body().includes("Codex queue · #2"),
       `La place en file n'est pas traduite en anglais : ${JSON.stringify(body().match(/(File|queue)[^<"]{0,26}/g))}`);
load([card("q1","File Codex","ready"),card("q2","File Claude","ready",{agentEngine:"claude-code"})]);
click({surface:"board",select:"global"});
context.window.CodexBoard.queueUpdated({items:[{cardID:"q1",position:1},{cardID:"q2",position:1}]});
assert(body().includes("File Codex n°1")&&body().includes("File Claude n°1"),
       `La place en file ne nomme pas le moteur concerne : ${JSON.stringify(body().match(/File[^<"]{0,24}/g))}`);
context.window.CodexBoard.queueUpdated({items:[{cardID:"q1",position:1,reason:"conversation"},{cardID:"q2",position:1,reason:"conversation"}]});
assert(body().includes("Même conversation Codex en attente")&&body().includes("Même session Claude en attente"),
       "Une attente liee a la meme conversation ou session reste presentee comme une saturation de capacite.");


// --- Planification refusee --------------------------------------------------
// Quand queueCard refuse une carte planifiee, rien ne part. La carte doit le
// dire et s arreter la : sans etat terminal, le planificateur la represente
// toutes les 30 secondes et l utilisateur recoit une alerte sans fin.
load([card("p1","Planifiee incoherente","ready",{
  launchMode:"scheduled",
  scheduledAt:iso(-1),
  // Brief vide : queueCard refuse. Un board importe ou edite a la main peut
  // parfaitement contenir ce cas, et les six refus de queueCard partagent le
  // meme defaut, quel que soit celui qui se declenche.
  prompt:"   ",
})]);
bridgeMessages.length=0;
toasts.length=0;
fireInterval(30000);
const premierEssai = bridgeMessages.filter(m=>m.action==="run").length;
const alertesApres1 = toasts.length;
fireInterval(30000);
fireInterval(30000);
assert(premierEssai===0,"Une carte planifiee incoherente a quand meme ete envoyee a l agent.");
assert(toasts.length===alertesApres1,
       `Le planificateur represente la carte a chaque tour : ${toasts.length} alertes au lieu de ${alertesApres1}.`);
const planifiee = () => saves().at(-1).data.cards.find(c=>c.id==="p1");
assert(planifiee()&&["failed","paused","skipped"].includes(planifiee().scheduleState),
       `La carte refusee reste dans l etat « ${planifiee()?.scheduleState} » et sera retentee sans fin.`);
assert((planifiee()?.scheduleNote||"").trim().length>0,"La carte refusee n explique pas pourquoi elle n est pas partie.");

// Le motif etait enregistre puis jamais affiche : la carte annoncait « echec »
// sans dire pourquoi, et le bouton Reprendre n avait aucun contexte.
click({surface:"board",select:"global"});
assert(body().includes(planifiee().scheduleNote),
       "Le motif de la programmation n'est pas affiche sur la carte.");
assert(body().includes('data-action="resume-schedule"'),
       "Une programmation en echec n'offre pas de reprise.");
// Le motif est stocke en francais et sert de cle : il doit se traduire a
// l affichage, y compris ceux enregistres avant le changement de langue.
load([card("p2","Quota","ready",{launchMode:"scheduled",scheduledAt:iso(-1),
  scheduleState:"waitingQuota",scheduleNote:"Limite d’usage détectée. Nouvel essai dans {n} min.",scheduleNoteVars:{n:30}})],{language:"en"});
click({surface:"board",select:"global"});
assert(body().includes("Usage limit reached. Retrying in 30 min."),
       `Le motif enregistre n'est ni traduit ni complete : ${JSON.stringify(body().match(/(Limite|Usage)[^<]{0,44}/g))}`);


// --- Demande d autorisation survivant a un redemarrage ----------------------
// Une demande restee « en attente » quand l app se ferme reste cliquable au
// redemarrage. Le natif, lui, n a plus de tour a qui repondre : l utilisateur
// croit avoir autorise une action alors que rien n est parti.
load([card("v1","Tache avec demande","running")],{},[space],[{
  id:"val-1", cardID:"v1", requestID:42, status:"pending", kind:"permission",
  agentEngine:"codex", spaceID:"space-1", requestedAt:iso(-1),
  params:{questions:[]}, title:"Ecrire un fichier",
}]);
context.window.CodexBoard.runsRestored({running:[],queued:[]});
click({select:"reviewView"});
const enAttente = () => {
  const m = element("#workspace-header").innerHTML.match(/<strong>(\d+)<\/strong>\s*autorisation/);
  return m ? Number(m[1]) : -1;
};
assert(enAttente()===0,
       `Une demande orpheline reste repondable apres redemarrage : ${enAttente()} autorisation(s) en attente.`);

assert(saves().at(-1).data.validations.every(v=>v.status!=="pending"&&(v.note||"").trim()),
       "Une demande close au demarrage n explique pas pourquoi.");

// Si le tour meurt sans prevenir, la demande reste en attente : l utilisateur
// repond, le natif n a plus personne a qui transmettre. Sans retour, l interface
// affichait « Action autorisee » alors que rien n etait parti.
load([card("v3","Tour disparu","running")],{},[space],[{
  id:"val-3", cardID:"v3", requestID:44, status:"pending", kind:"permission",
  agentEngine:"codex", spaceID:"space-1", requestedAt:iso(-1), params:{questions:[]},
}]);
context.window.CodexBoard.requestUnresolved({cardID:"v3",requestID:44});
const perdue = saves().at(-1).data.validations.find(v=>v.id==="val-3");
assert(perdue&&perdue.status!=="accepted",
       `Une reponse non transmise est enregistree comme acceptee (statut « ${perdue?.status} »).`);
assert((perdue?.note||"").trim().length>0,"Une reponse non transmise n est pas expliquee.");

// --- Outils natifs du projet -----------------------------------------------
load([card("u1","Carte témoin","ready")]);
context.window.CodexBoard.agentStatus({codex:true,claude:true});
// Le faux DOM ne reconstruit pas les descendants après innerHTML : repartir de
// l'état réel attendu évite de conserver le bouton d'un rendu antérieur.
element("#workspace-header .header-primary-actions").innerHTML="";
context.window.CodexBoard.menuAction({action:"toolsChat"});
const utilityPanel=()=>element("#utility-panel");
assert(utilityPanel().hidden===false,"Le menu macOS n'ouvre pas le panneau des outils.");
assert(utilityPanel().innerHTML.includes('aria-label="Dossier de travail"')&&utilityPanel().innerHTML.includes("Claude"),"Le panneau droit ne propose pas le dossier et les deux moteurs.");
assert(utilityPanel().innerHTML.includes('class="engine-logo codex-logo"')&&utilityPanel().innerHTML.includes('class="engine-logo claude-code-logo"'),"Le selecteur du chat n affiche pas les icones fonctionnelles des moteurs.");
assert(!utilityPanel().innerHTML.includes('src="Brands/'),"Le chat embarque encore un logo de fournisseur.");
assert(utilityPanel().innerHTML.includes('id="utility-chat-model"')&&utilityPanel().innerHTML.includes("GPT-5.6 Sol"),"Le chat direct ne permet pas de choisir son modèle.");
assert(utilityPanel().innerHTML.includes('data-action="choose-utility-attachments"'),"Le compositeur du chat n'affiche pas le bouton pour joindre des fichiers.");
assert(!utilityPanel().innerHTML.includes('id="utility-access-mode"')&&!utilityPanel().innerHTML.includes('class="utility-access"'),"Le chat direct affiche encore un choix d acces inutile.");
assert(stylesheet.includes(".utility-chat-toolbar")&&stylesheet.includes(".utility-compose-tools")&&stylesheet.includes(".utility-send-button"),"Le chat n'utilise pas la structure compacte du panneau professionnel.");
assert(!utilityPanel().innerHTML.includes("<h2>Panneau droit</h2>"),"Le titre Panneau droit occupe encore une ligne visible.");
assert(utilityPanel().innerHTML.includes('id="utility-chat-form"'),"Le chat direct n'affiche pas sa zone d'envoi.");
assert(utilityPanel().innerHTML.includes("data-utility-resize"),"La poignée de redimensionnement du panneau droit n'est pas rendue.");
assert(!element("#workspace-header .header-primary-actions").innerHTML.includes('data-action="toggle-utility"'),"Le bouton du panneau droit reste dans l'en-tête alors que le panneau est ouvert.");
const utilityTrigger=utilityPanel().innerHTML;
assert(utilityTrigger.includes('aria-label="Masquer le panneau droit"')&&utilityTrigger.includes('M15 4v16'),"Le panneau ouvert n'utilise pas son bouton de barre latérale dans l'angle supérieur droit.");
assert(!utilityTrigger.includes('>Outils <'),"Le bouton texte Outils est encore visible dans l'en-tête.");
click({action:"toggle-utility"});
const closedHeaderActions=element("#workspace-header .header-primary-actions").innerHTML;
assert(closedHeaderActions.includes('aria-label="Afficher le panneau droit"'),"Le bouton du panneau droit fermé ne revient pas dans l'en-tête.");
assert(closedHeaderActions.lastIndexOf('data-action="toggle-utility"')>closedHeaderActions.lastIndexOf('data-action="add-card"'),"Le bouton du panneau droit fermé n'est pas placé à l'extrémité droite.");
click({action:"toggle-utility"});

listeners.change({target:{id:"utility-chat-model",value:"gpt-5.6-luna"}});
assert(saves().at(-1).data.utilityChats[0].model==="gpt-5.6-luna","Le modèle choisi dans le chat n'est pas mémorisé.");
bridgeMessages.length=0;
click({action:"choose-utility-attachments"});
assert(bridgeMessages.some(message=>message.action==="chooseUtilityAttachments"),"Le bouton + n'ouvre pas le sélecteur de fichiers natif.");
context.window.CodexBoard.utilityAttachmentsChosen({files:[{path:"/private/tmp/brief <final>.md",name:"brief <final>.md"},{path:"/private/tmp/capture.png",name:"capture.png"}]});
assert(utilityPanel().innerHTML.includes("brief &lt;final&gt;.md")&&utilityPanel().innerHTML.includes('data-action="remove-utility-attachment"'),"Les fichiers choisis ne sont pas affichés ou leur nom n'est pas sécurisé.");
const utilityComposer={value:"Résume ce projet"};
bridgeMessages.length=0;
listeners.submit({target:{id:"utility-chat-form",dataset:{space:"space-1",engine:"codex"},formValues:{message:"Résume ce projet"},querySelector(selector){return selector==="#utility-chat-message"||selector==="textarea"?utilityComposer:null;}},preventDefault(){}});
const utilityRun=bridgeMessages.find(message=>message.action==="run");
assert(utilityRun?.utilityChat===true&&utilityRun.card.utilityChat===true,"Le chat direct n'utilise pas le runner natif partagé.");
assert(utilityRun?.space?.id==="space-1"&&utilityRun.mode==="workspaceWrite","Le chat direct ne travaille pas automatiquement dans le dossier choisi.");
assert(utilityRun.card.model==="gpt-5.6-luna","Le modèle choisi n'est pas transmis au runner natif.");
assert(utilityRun.card.prompt.includes("/private/tmp/brief <final>.md")&&utilityRun.card.prompt.includes("/private/tmp/capture.png"),"Les chemins des pièces jointes ne sont pas transmis à l'agent.");
assert(utilityComposer.value==="","Le texte envoyé reste dans le champ du chat.");
assert(!saves().at(-1).data.settings.utilityMode,"L'ancien reglage d acces du chat reste enregistre.");
assert(saves().at(-1).data.utilityChats[0].messages[0].text==="Résume ce projet","Le premier message du chat n'est pas conservé.");
assert(saves().at(-1).data.utilityChats[0].messages[0].attachments.length===2,"Les pièces jointes du message ne sont pas conservées dans la conversation.");
assert(!utilityPanel().innerHTML.includes('data-action="remove-utility-attachment"'),"Les pièces jointes déjà envoyées restent dans le prochain message.");
const chatID=utilityRun.card.id;
context.window.CodexBoard.runnerStarted({cardID:chatID});
context.window.CodexBoard.conversationAssociated({cardID:chatID,threadID:"thread-chat",name:"Chat du projet",engine:"codex",cwd:space.rootPath,created:true});
context.window.CodexBoard.runnerEvent({cardID:chatID,message:"Réponse en préparation"});
assert(utilityPanel().innerHTML.includes("Réponse en préparation"),"La progression du chat n'est pas visible.");
context.window.CodexBoard.runnerFinished({cardID:chatID,success:true,exitCode:0,threadID:"thread-chat",summary:"Voici le résumé final."});
assert(utilityPanel().innerHTML.includes("Voici le résumé final."),"La réponse finale n'apparaît pas dans le chat.");
assert(saves().at(-1).data.utilityChats[0].status==="ready","Le chat reste bloqué après la réponse.");
assert(utilityPanel().innerHTML.includes('id="utility-chat-conversation"')&&utilityPanel().innerHTML.includes('data-action="new-utility-conversation"'),"Le chat ne permet pas de changer ou de créer une conversation.");
assert(!utilityPanel().innerHTML.includes("Conversation conservée"),"L'ancien texte inutile occupe encore le bas du compositeur.");

click({action:"new-utility-conversation"});
assert(utilityPanel().innerHTML.includes("Nouvelle conversation")&&!utilityPanel().innerHTML.includes('class="utility-message '),"Nouveau chat ne nettoie pas la conversation visible.");
assert(saves().at(-1).data.utilityChats[0].conversations[0].messages.some(message=>message.text==="Voici le résumé final."),"L'ancien chat est perdu quand une nouvelle conversation est créée.");
assert(utilityPanel().innerHTML.includes('class="utility-session-list"')&&utilityPanel().innerHTML.includes('data-action="switch-utility-conversation"'),"Les anciennes conversations ne sont pas proposées dans l'écran de nouveau chat.");
click({action:"switch-utility-conversation",thread:"thread-chat"});
assert(utilityPanel().innerHTML.includes("Voici le résumé final."),"La liste de sessions ne rouvre pas la conversation choisie.");
click({action:"new-utility-conversation"});
const nextComposer={value:"Nouvelle discussion"};
bridgeMessages.length=0;
listeners.submit({target:{id:"utility-chat-form",dataset:{space:"space-1",engine:"codex"},formValues:{message:"Nouvelle discussion"},querySelector(selector){return selector==="#utility-chat-message"||selector==="textarea"?nextComposer:null;}},preventDefault(){}});
const nextRun=bridgeMessages.find(message=>message.action==="run");
assert(nextRun?.newConversation===true&&!Object.hasOwn(nextRun.card,"conversationID"),"Nouveau chat reprend encore l'ancienne conversation native.");
assert(nextRun.card.title==="Nouvelle discussion","Le premier message ne devient pas le titre du nouveau chat.");
context.window.CodexBoard.runnerStarted({cardID:chatID});
context.window.CodexBoard.conversationAssociated({cardID:chatID,threadID:"thread-chat-2",name:"Chat suivant",engine:"codex",cwd:space.rootPath,created:true});
context.window.CodexBoard.runnerFinished({cardID:chatID,success:true,exitCode:0,threadID:"thread-chat-2",summary:"Réponse du nouveau chat."});
assert(saves().at(-1).data.utilityChats[0].conversations.find(item=>item.id==="thread-chat-2")?.name==="Nouvelle discussion","Le sélecteur conserve le titre générique renvoyé par Codex.");
listeners.change({target:{id:"utility-chat-conversation",value:"thread-chat"}});
assert(utilityPanel().innerHTML.includes("Voici le résumé final.")&&!utilityPanel().innerHTML.includes("Réponse du nouveau chat."),"Le sélecteur ne restaure pas la conversation choisie.");
assert(utilityPanel().innerHTML.includes('data-action="confirm-remove-utility-conversation"'),"La conversation courante ne peut pas être supprimée directement du chat.");
const conversationsBeforeRemoval=saves().at(-1).data.utilityChats[0].conversations.length;
click({action:"confirm-remove-utility-conversation"});
assert(modal().includes("Supprimer cette conversation du chat ?")&&modal().includes("Elle restera disponible dans Codex"),"La confirmation ne précise pas la portée de la suppression.");
click({action:"remove-utility-conversation",thread:"thread-chat"});
const chatAfterRemoval=saves().at(-1).data.utilityChats[0];
assert(chatAfterRemoval.conversations.length===conversationsBeforeRemoval-1&&!chatAfterRemoval.conversations.some(item=>item.id==="thread-chat"),"La conversation supprimée reste dans le chat.");
assert(utilityPanel().innerHTML.includes("Réponse du nouveau chat."),"Le chat ne bascule pas sur une conversation restante après suppression.");
click({action:"confirm-remove-utility-conversation"});
click({action:"remove-utility-conversation",thread:"thread-chat-2"});
const emptyChat=saves().at(-1).data.utilityChats[0];
assert(emptyChat.conversations.length===0&&emptyChat.utilityNewConversation===true&&emptyChat.messages.length===0,"Supprimer la dernière conversation ne prépare pas un chat vide propre.");
assert(utilityPanel().innerHTML.includes('data-action="confirm-remove-utility-conversation"')&&utilityPanel().innerHTML.includes('data-action="confirm-remove-utility-conversation" aria-label="Supprimer cette conversation" title="Supprimer cette conversation" disabled'),"La corbeille reste active sans conversation.");

bridgeMessages.length=0;
context.window.CodexBoard.menuAction({action:"toolsTerminal"});
const terminalStart=bridgeMessages.find(message=>message.action==="startTerminal");
assert(terminalStart?.spaceID==="space-1"&&terminalStart.rootPath===space.rootPath,"Le terminal ne cible pas le dossier du projet.");
assert(utilityPanel().innerHTML.includes("Démarrage du terminal"),"L'onglet Terminal n'affiche pas son démarrage automatique.");
context.window.CodexBoard.terminalStarted({terminalID:terminalStart.terminalID,path:space.rootPath});
assert(utilityPanel().innerHTML.includes('id="utility-terminal-form"'),"Une session démarrée n'affiche pas son invite de commande.");
assert(utilityPanel().innerHTML.includes('data-action="interrupt-terminal"')&&utilityPanel().innerHTML.includes('data-action="open-system-terminal"'),"Le terminal ne propose pas l'interruption et l'ouverture dans Terminal macOS.");
bridgeMessages.length=0;
listeners.submit({target:{id:"utility-terminal-form",dataset:{space:"space-1"},formValues:{command:"pwd"}},preventDefault(){}});
assert(bridgeMessages.find(message=>message.action==="terminalCommand")?.command==="pwd","La commande du terminal n'est pas transmise au natif.");
context.window.CodexBoard.terminalOutput({terminalID:terminalStart.terminalID,text:"pwd\r\n/private/tmp/projet-test\n"});
assert(utilityPanel().innerHTML.includes("/private/tmp/projet-test"),"La sortie du terminal n'est pas restituée.");
bridgeMessages.length=0;
click({action:"interrupt-terminal"});
click({action:"open-system-terminal"});
assert(bridgeMessages.some(message=>message.action==="terminalInterrupt")&&bridgeMessages.some(message=>message.action==="openSystemTerminal"),"Les actions avancées du terminal ne sont pas transmises au natif.");

bridgeMessages.length=0;
context.window.CodexBoard.menuAction({action:"toolsFiles"});
assert(bridgeMessages.find(message=>message.action==="listProjectFiles")?.spaceID==="space-1","Le navigateur de fichiers ne charge pas le projet choisi.");
context.window.CodexBoard.projectFilesLoaded({spaceID:"space-1",relativePath:"",entries:[{name:"Sources",relativePath:"Sources",directory:true},{name:"README.md",relativePath:"README.md",directory:false,sizeLabel:"12 KB"}]});
assert(utilityPanel().innerHTML.includes("README.md")&&utilityPanel().innerHTML.includes("12 KB"),"La liste de fichiers n'affiche pas les entrées natives.");
bridgeMessages.length=0;
click({action:"open-project-file",path:"README.md"});
assert(bridgeMessages.find(message=>message.action==="openProjectFile")?.relativePath==="README.md","L'ouverture d'un fichier n'est pas transmise au natif.");

rightClickFile({utilityFile:"true",path:"README.md",name:"README.md",directory:"false"});
for(const label of ["Ouvrir dans le Finder","Ouvrir avec…","Enregistrer sous…","Copier le chemin d’accès","Ajouter au chat"])
  assert(utilityPanel().innerHTML.includes(label),`Le clic droit ne propose pas « ${label} » pour un fichier.`);
for(const [action,nativeAction] of [["open-project-file-with","openProjectFileWith"],["save-project-file-as","saveProjectFileAs"],["copy-project-file-path","copyProjectFilePath"],["add-project-file-to-chat","resolveProjectFileForChat"]]){
  bridgeMessages.length=0;
  rightClickFile({utilityFile:"true",path:"README.md",name:"README.md",directory:"false"});
  click({action,path:"README.md"});
  assert(bridgeMessages.find(message=>message.action===nativeAction)?.relativePath==="README.md",`L’action contextuelle ${nativeAction} n’est pas transmise au natif.`);
}
context.window.CodexBoard.projectFilePathCopied();
assert(lastToast()==="Chemin d’accès copié.","La copie du chemin n'est pas confirmée.");
context.window.CodexBoard.projectFileSaved({path:"/private/tmp/README copie.md"});
assert(lastToast().includes("README copie.md"),"L'enregistrement de la copie n'est pas confirmé.");
context.window.CodexBoard.utilityProjectFileAdded({spaceID:"space-1",path:"/private/tmp/projet-test/README.md",name:"README.md"});
assert(utilityPanel().innerHTML.includes('class="utility-tabs"')&&utilityPanel().innerHTML.includes('data-tab="chat" class="active"')&&utilityPanel().innerHTML.includes("README.md"),"Ajouter au chat ne joint pas le fichier au prochain message.");
context.window.CodexBoard.menuAction({action:"toolsFiles"});
rightClickFile({utilityFile:"true",path:"Sources",name:"Sources",directory:"true"});
assert(utilityPanel().innerHTML.includes("Ouvrir dans le Finder")&&utilityPanel().innerHTML.includes("Copier le chemin d’accès"),"Le clic droit d'un dossier perd ses actions utiles.");
assert(!utilityPanel().innerHTML.includes("Ouvrir avec…")&&!utilityPanel().innerHTML.includes("Enregistrer sous…")&&!utilityPanel().innerHTML.includes("Ajouter au chat"),"Le clic droit d'un dossier propose des actions réservées aux fichiers.");
listeners.keydown({key:"Escape",target:{matches(){return false;}},preventDefault(){}});
assert(!utilityPanel().innerHTML.includes('class="utility-file-context-menu"'),"Échap ne ferme pas le menu contextuel des fichiers.");

bridgeMessages.length=0;
listeners.change({target:{id:"utility-project",value:"__choose-folder__"}});
assert(bridgeMessages.some(message=>message.action==="chooseUtilityFolder"),"Le sélecteur ne propose pas un dossier libre du Mac.");
context.window.CodexBoard.utilityFolderChosen({path:"/private/tmp/dossier-libre",name:"dossier-libre"});
const customSave=saves().at(-1).data;
assert(customSave.settings.utilitySpaceID==="utility-custom"&&customSave.settings.utilityCustomPath==="/private/tmp/dossier-libre","Le dossier libre n'est pas mémorisé comme espace du panneau droit.");
assert(utilityPanel().innerHTML.includes("Dossier choisi")&&utilityPanel().innerHTML.includes("dossier-libre"),"Le dossier libre choisi n'apparaît pas dans le panneau.");
const customFiles=bridgeMessages.filter(message=>message.action==="listProjectFiles").at(-1);
assert(customFiles?.spaceID==="utility-custom"&&customFiles.rootPath==="/private/tmp/dossier-libre","Le navigateur ne suit pas le dossier libre choisi.");

const nativeSource=fs.readFileSync(`${__dirname}/../Sources/App/main.m`,"utf8");
const cliSource=fs.readFileSync(`${__dirname}/../Sources/CLI/main.m`,"utf8");
const packageScript=fs.readFileSync(`${__dirname}/package_app.sh`,"utf8");
const windowsAgentSource=fs.readFileSync(`${__dirname}/../Platforms/Windows/src-tauri/src/agents.rs`,"utf8");
const windowsConversationSource=fs.readFileSync(`${__dirname}/../Platforms/Windows/src-tauri/src/conversations.rs`,"utf8");
assert(nativeSource.includes('snapshot[@"version"] = @22;')&&nativeSource.includes('@{ @"version":@22'),"L application native ne conserve pas le schema 22 lors d une sauvegarde ou d une premiere ouverture.");
assert(cliSource.includes('board[@"version"] = @22;')&&!cliSource.includes('board[@"version"] = @19;'),"L outil en ligne de commande peut encore ramener les donnees au schema 19.");
assert(!packageScript.includes('Resources/Brands'),"Le paquet macOS copie encore des ressources de marque tierces.");
assert(nativeSource.includes('@"name":@"ctrl-kanb"')&&!nativeSource.includes('@"name":@"Codex Desktop"'),"Le client macOS ne s identifie pas correctement auprès de Codex App Server.");
assert(windowsAgentSource.includes('"name":"ctrl-kanb"')&&windowsConversationSource.includes('"name":"ctrl-kanb"')&&!windowsAgentSource.includes('"name":"Codex Desktop"')&&!windowsConversationSource.includes('"name":"Codex Desktop"'),"Le client Windows ne s identifie pas correctement auprès de Codex App Server.");
for(const title of ["Fichier", "Édition", "Affichage", "Fenêtre", "Aide"])
  assert(nativeSource.includes(`@"${title}"`),`Le menu macOS « ${title} » manque du code natif.`);
for(const action of ["setAppearance", "notificationStatus", "requestNotifications", "openNotificationSettings", "chooseUtilityFolder", "chooseUtilityAttachments", "startTerminal", "terminalCommand", "terminalInterrupt", "stopTerminal", "openSystemTerminal", "listProjectFiles", "openProjectFile", "revealProjectFile", "openProjectFileWith", "saveProjectFileAs", "copyProjectFilePath", "resolveProjectFileForChat", "syncClaudeSessions"])
  assert(nativeSource.includes(`@"${action}"`),`Le pont natif ne route pas ${action}.`);
for(const category of ["taskComplete","taskFailed","approval","chatReply","scheduleIssue"])
  assert(nativeSource.includes(`@"${category}"`),`Le moteur natif ne connaît pas la catégorie ${category}.`);
assert(nativeSource.includes("shouldDeliverNotificationCategory")&&nativeSource.includes('isEqualToString:@"mute"')&&nativeSource.includes('isEqualToString:@"always"'),"Les priorités de notification propres à la tâche ne sont pas appliquées par le moteur natif.");
assert(nativeSource.includes("ClaudeSessionSnapshot")&&nativeSource.includes("Local Claude session not found."),"La synchronisation Claude ne relit pas les journaux locaux ou ne signale pas les sessions absentes.");
assert(nativeSource.includes("panel.allowsMultipleSelection = YES")&&nativeSource.includes('sendFunction:@"utilityAttachmentsChosen"'),"Le sélecteur natif ne renvoie pas plusieurs fichiers au chat.");
assert(nativeSource.includes("projectPathForSpaceID")&&nativeSource.includes("Ce chemin sort du projet."),"Le navigateur de fichiers n'applique pas la frontière du projet.");
assert(stylesheet.includes(".utility-panel{")&&stylesheet.includes(".utility-terminal-output"),"Le panneau droit n'a pas sa mise en forme dédiée.");
assert(stylesheet.includes("width:var(--utility-panel-w,390px)")&&stylesheet.includes(".utility-resizer{"),"La largeur variable ou sa poignée manque au panneau droit.");
assert(stylesheet.includes("--terminal-bg:#f5f6f8")&&stylesheet.includes("--terminal-bg:#17191d")&&stylesheet.includes("background:var(--terminal-bg)"),"Le terminal ne suit pas les thèmes clair et sombre.");
for(const mode of ["light","dark"])
  for(const palette of ["azure","midnight","ember","slate","terminal"])
    assert(stylesheet.includes(`[data-theme="${mode}"][data-palette="${palette}"]`),`La variante ${mode}/${palette} manque dans la feuille de style.`);
assert(!stylesheet.includes("rgba(255,255,255")&&!stylesheet.includes("background:white")&&!stylesheet.includes(",white)"),"Une surface blanche fixe subsiste et casse les palettes sombres.");
assert(stylesheet.includes(".scheduler-card{\n  border-color:var(--border);background:var(--surface-2);box-shadow:none")&&stylesheet.includes(".scheduler-switch,.scheduler-state,.scheduler-facts>div,.scheduler-note{"),"Le panneau du moteur local ne suit pas entierement les surfaces du theme.");
assert(stylesheet.includes(':root[data-font-size="comfort"]{--font-size-offset:1px}')&&stylesheet.includes(':root[data-font-size="xlarge"]{--font-size-offset:3px}'),"Les niveaux d agrandissement du texte manquent dans la feuille de style.");
assert(!/font-size\s*:\s*[0-9]+(?:\.[0-9]+)?px/.test(stylesheet),"Une taille de texte fixe echappe encore au reglage global.");


console.log(JSON.stringify({ok:true,checks,version:saves().at(-1)?.data?.version||18},null,2));
