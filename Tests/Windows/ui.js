// Run with jsdom 26.1.0 available on NODE_PATH (test dependency only).
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {JSDOM,VirtualConsole}=require('jsdom');
const root=path.join(__dirname,'..','..'),messages=[],errors=[],timers=[];
const consoleSink=new VirtualConsole();consoleSink.on('jsdomError',error=>errors.push(error));
const dom=new JSDOM(fs.readFileSync(path.join(root,'Shared/Web/index.html'),'utf8'),{url:'https://ctrl-kanb.windows',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:consoleSink});
const w=dom.window,d=w.document;
w.structuredClone=structuredClone;w.setInterval=()=>0;w.setTimeout=(callback,delay)=>{timers.push({callback,delay});return timers.length};w.requestAnimationFrame=callback=>callback();
w.CTRL_KANB_PLATFORM='windows';
w.ctrlKanbNative={postMessage:message=>messages.push(structuredClone(message))};
w.eval(fs.readFileSync(path.join(root,'Shared/Web/i18n.js'),'utf8'));
w.eval(fs.readFileSync(path.join(root,'Shared/Web/app.js'),'utf8'));
const rawClaudeError=JSON.stringify({type:'error',status:401,error:{message:'OAuth access token has been revoked. Run claude auth login.'}});
const state={version:22,spaces:[{id:'project',name:'Projet Windows',rootPath:'C:\\Users\\Test\\Projet',accentHex:'527A9A'}],cards:[{id:'failed-card',spaceID:'project',boardPresetID:'classic',title:'Tâche à reprendre',prompt:'Vérifier le projet',status:'needsInput',priorityLevelID:'normal',priorityNumber:1,labels:[],subtasks:[],dependencies:[],categoryAssignments:{},agentEngine:'claude-code',launchMode:'manual',recurrence:'none',runMode:'workspaceWrite',conversations:[],lastRun:{exitCode:1,summary:'Not logged in · Please run /login'},createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}],utilityChats:[],templates:[],validations:[],settings:{autoSync:false,backgroundSchedulerEnabled:false,maxConcurrencyCodex:2,maxConcurrencyClaude:1,accounts:[],activeAccount:{},accountChecks:{'claude-code:default':{engine:'claude-code',account:'claude-code:default',state:'blocked',detail:rawClaudeError,at:new Date().toISOString()}},conversationSyncChecks:{},language:'fr'},modifiedAt:new Date().toISOString()};
state.cards.push({...structuredClone(state.cards[0]),id:'model-card',title:'Moteur à actualiser',priorityNumber:2,agentEngine:'codex',lastRun:{exitCode:1,summary:JSON.stringify({type:'error',status:400,error:{message:"The 'gpt-5.6-sol' model requires a newer version of Codex. Please upgrade to the latest app or CLI and try again."}})}});
state.cards.push({...structuredClone(state.cards[0]),id:'quota-card',title:'Quota à renouveler',priorityNumber:3,agentEngine:'codex',lastRun:{exitCode:1,summary:"You've hit your usage limit. Upgrade to Pro or try again later."}});
w.CodexBoard.load(state);w.CodexBoard.securityStatus({lockEnabled:true,biometry:'Windows Hello'});w.CodexBoard.agentStatus({codex:true,claude:true});
const click=selector=>{const element=d.querySelector(selector);assert.ok(element,selector);element.click();};

assert.ok(d.querySelector('#board').textContent.includes('Claude n’est pas connecté.'),'une erreur Claude enregistrée doit être expliquée');
assert.ok(d.querySelector('#board').textContent.includes('Mets le moteur à jour ou choisis un autre modèle.'),'une incompatibilité de modèle doit indiquer la correction');
assert.ok(d.querySelector('#board').textContent.includes('Limite d’usage atteinte pour Codex.'),'un ancien message de quota simple doit être nettoyé');
assert.ok(!d.body.textContent.includes('OAuth access token')&&!d.body.textContent.includes('{"type":"error"')&&!d.body.textContent.includes('Not logged in')&&!d.body.textContent.includes("You've hit your usage limit"),'aucune erreur technique ne doit être affichée');
w.CodexBoard.runnerFinished({cardID:'failed-card',success:false,exitCode:1,error:JSON.stringify({type:'error',status:429,error:{message:'Usage limit reached'}})});
assert.ok(d.querySelector('#board').textContent.includes('Limite d’usage atteinte pour Claude.'),'une limite d’usage doit être présentée clairement');
assert.ok(!d.querySelector('#board').textContent.includes('status')&&!d.querySelector('#board').textContent.includes('Usage limit'),'le détail technique ne doit pas rester dans la carte');
assert.equal(state.settings.accountChecks['claude-code:default'].state,'ready','une limite de quota doit confirmer que le compte est reconnu');
w.CodexBoard.runnerFinished({cardID:'failed-card',success:false,exitCode:1,error:rawClaudeError});
assert.equal(state.settings.accountChecks['claude-code:default'].state,'blocked','un refus d’authentification réel doit demander une reconnexion');

const timerStart=timers.length,past=new Date(Date.now()-60000).toISOString();
w.CodexBoard.boardImported({board:{version:22,spaces:[state.spaces[0]],cards:[{...structuredClone(state.cards[0]),id:'imported-schedule',status:'queued',launchMode:'scheduled',scheduledAt:past,scheduleState:'pending',scheduleNextAttemptAt:past,recurrence:'weekly'}],utilityChats:[{id:'imported-chat',spaceID:'project',status:'running',executionState:'active',messages:[]}],templates:[],validations:[],settings:{...state.settings,backgroundSchedulerEnabled:true}},message:''});
for(const timer of timers.slice(timerStart).filter(item=>item.delay===1000))timer.callback();
const importedSave=messages.filter(message=>message.action==='save').at(-1)?.data;
assert.equal(messages.some(message=>message.action==='run'&&message.cardID==='imported-schedule'),false,'une tâche importée ne doit jamais partir automatiquement');
assert.equal(importedSave.settings.backgroundSchedulerEnabled,false,'le moteur de fond importé doit être désactivé');
assert.equal(importedSave.cards[0].scheduleState,'paused','une programmation importée doit être mise en pause');
assert.equal(importedSave.cards[0].recurrence,'weekly','la récurrence doit être conservée pour une reprise manuelle');
assert.equal(importedSave.utilityChats[0].status,'ready','un chat importé ne doit pas rester marqué actif');

w.CodexBoard.menuAction({action:'importData'});
assert.ok(d.querySelector('#modal-root').textContent.includes('les tâches programmées seront restaurées en pause'),'la confirmation doit expliquer la neutralisation');
click('[data-action="close-modal"]');

w.CodexBoard.load(state);w.CodexBoard.securityStatus({lockEnabled:true,biometry:'Windows Hello'});w.CodexBoard.agentStatus({codex:true,claude:true});
click('[data-select="settingsView"]');
const settings=d.querySelector('#board').textContent;
for(const expected of ['Notifications Windows','Protège l’accès à la fenêtre CTRL KANB sur ce PC.','Windows Hello','%LOCALAPPDATA%\\CTRL KANB Data\\board.json','Application Windows']) assert.ok(settings.includes(expected),expected);
for(const forbidden of ['Finder','macOS','sur ce Mac','ce Mac','⌘','⌥']) assert.ok(!settings.includes(forbidden),`libellé macOS visible sous Windows: ${forbidden}`);
assert.ok(settings.includes('Claude n’est pas connecté.')&&!settings.includes('OAuth access token'),'les réglages doivent conserver un diagnostic lisible');

w.CodexBoard.menuAction({action:'newProject'});
assert.equal(d.querySelector('[name="rootPath"]').placeholder,'C:\\chemin\\du\\projet');
click('[data-action="close-modal"]');
w.CodexBoard.menuAction({action:'shortcuts'});
const shortcuts=d.querySelector('#modal-root').textContent;
for(const expected of ['Ctrl+K','Ctrl+Alt+C','Maj+N','Ctrl+↵']) assert.ok(shortcuts.includes(expected),expected);
assert.ok(!shortcuts.includes('⌘')&&!shortcuts.includes('⌥'));
click('[data-action="close-modal"]');

d.body.dispatchEvent(new w.KeyboardEvent('keydown',{key:'c',ctrlKey:true,altKey:true,bubbles:true,cancelable:true}));
assert.equal(state.settings.utilityPanelOpen,true);
assert.equal(state.settings.utilityTab,'chat');
d.querySelector('[data-action="utility-tab"][data-tab="files"]').click();
w.CodexBoard.projectFilesLoaded({spaceID:'project',entries:[{name:'exemple.txt',path:'exemple.txt',directory:false,size:12}]});
const fileRow=d.querySelector('[data-utility-file][data-name="exemple.txt"]');
assert.ok(fileRow,'le fichier de contrôle doit être visible');
fileRow.dispatchEvent(new w.MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:400,clientY:200,button:2}));
assert.ok(d.body.textContent.includes('Ouvrir dans l’Explorateur de fichiers'),'le menu contextuel Windows doit employer une formulation correcte');
assert.ok(!d.body.textContent.includes('le Explorateur'),'le menu contextuel ne doit pas conserver un article incorrect');
d.body.dispatchEvent(new w.KeyboardEvent('keydown',{key:'l',ctrlKey:true,bubbles:true,cancelable:true}));
assert.equal(messages.at(-1).action,'lockNow');

assert.equal(errors.length,0,errors.map(error=>error.message).join('\n'));
console.log('PASS interface, textes et raccourcis Windows');
dom.window.close();
