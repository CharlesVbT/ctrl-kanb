// Accessibility regression checks for every primary view and the main dialogs.
// Run with jsdom 26.1.0 available on NODE_PATH (test dependency only).
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom');
const root=path.resolve(__dirname,'..'),errors=[],messages=[],issues=[],vc=new VirtualConsole();
vc.on('jsdomError',error=>errors.push(error));
const dom=new JSDOM(fs.readFileSync(path.join(root,'Resources/index.html'),'utf8'),{runScripts:'outside-only',url:'file:///app/index.html',pretendToBeVisual:true,virtualConsole:vc});
const w=dom.window,d=w.document;
w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
w.webkit={messageHandlers:{bridge:{postMessage(message){messages.push(structuredClone(message))}}}};
w.requestAnimationFrame=callback=>{callback();return 1};
w.eval(fs.readFileSync(path.join(root,'Resources/i18n.js'),'utf8'));
w.eval(fs.readFileSync(path.join(root,'Resources/app.js'),'utf8'));

const now=new Date().toISOString(),space={id:'project',name:'Projet accessible',rootPath:'/private/tmp/projet-accessible',accentHex:'5477A8'};
const base={version:22,spaces:[space],cards:[
  {id:'ready',spaceID:'project',boardPresetID:'classic',title:'Préparer la livraison',prompt:'Vérifier les parcours.',status:'ready',priorityLevelID:'normal',priorityNumber:1,agentEngine:'codex',runMode:'readOnly',launchMode:'manual',recurrence:'none',labels:[],subtasks:[],dependencies:[],categoryAssignments:{},conversations:[],createdAt:now,updatedAt:now,dueDate:now.slice(0,10)},
  {id:'review',spaceID:'project',boardPresetID:'classic',title:'Relire le résultat',prompt:'Relire.',status:'review',priorityLevelID:'normal',priorityNumber:2,agentEngine:'claude-code',runMode:'workspaceWrite',launchMode:'manual',recurrence:'none',labels:[],subtasks:[],dependencies:[],categoryAssignments:{},conversations:[{id:'aaaaaaaa-1234-4234-8234-123456789abc',engine:'claude-code',name:'Relecture'}],createdAt:now,updatedAt:now,lastRun:{summary:'Résultat à vérifier',finishedAt:now}},
  {id:'done',spaceID:'project',boardPresetID:'classic',title:'Tâche terminée',prompt:'Terminé.',status:'done',priorityLevelID:'normal',priorityNumber:3,agentEngine:'codex',runMode:'readOnly',launchMode:'manual',recurrence:'none',labels:[],subtasks:[],dependencies:[],categoryAssignments:{},conversations:[],createdAt:now,updatedAt:now,completedAt:now},
  {id:'scheduled',spaceID:'project',boardPresetID:'routines',title:'Routine quotidienne',prompt:'Contrôler.',status:'ready',priorityLevelID:'normal',priorityNumber:4,agentEngine:'codex',runMode:'readOnly',launchMode:'scheduled',scheduledAt:now,recurrence:'daily',recurrenceSeriesID:'series',durationMinutes:60,labels:[],subtasks:[],dependencies:[],categoryAssignments:{},conversations:[],createdAt:now,updatedAt:now}
],templates:[],validations:[{id:'validation',cardID:'ready',status:'pending',kind:'command',agentEngine:'codex',requestedAt:now,params:{command:'pwd'}}],settings:{autoSync:false,backgroundSchedulerEnabled:false,defaultModel:'gpt-5.6-sol',defaultModelCodex:'gpt-5.6-sol',defaultModelClaude:'sonnet',defaultEffort:'medium',defaultEffortCodex:'medium',defaultEffortClaude:'medium',maxConcurrency:1,maxConcurrencyCodex:1,maxConcurrencyClaude:1,defaultBoardPreset:'classic',activePresetByScope:{},theme:'auto',themePalette:'graphite',fontSize:'normal',language:'fr',agendaMode:'week',agendaTimeZone:'auto',agendaWeekStart:'auto',agendaHourCycle:'auto',accounts:[],activeAccount:{},accountChecks:{},conversationSyncChecks:{},notificationEvents:{taskComplete:true,taskFailed:true,approval:true,chatReply:true,scheduleIssue:true},systemNotificationsEnabled:true,notificationWhen:'background',inAppNotifications:'all',expandedProjectIDs:[],utilityPanelOpen:false,utilityPanelWidth:390,utilityTab:'chat',utilityAgent:'codex',utilitySpaceID:'',utilityCustomPath:''},modifiedAt:now};

function click(selector){const node=d.querySelector(selector);assert.ok(node,`Contrôle absent: ${selector}`);node.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));}
function visible(node){return !node.closest('[hidden]')&&node.getAttribute('aria-hidden')!=='true';}
function audit(name){
  const duplicateIDs=[...d.querySelectorAll('[id]')].map(node=>node.id).filter((id,index,all)=>id&&all.indexOf(id)!==index);
  if(duplicateIDs.length)issues.push(`${name}: identifiants dupliqués (${[...new Set(duplicateIDs)].join(', ')})`);
  for(const button of d.querySelectorAll('button')){
    if(!visible(button))continue;
    const label=(button.getAttribute('aria-label')||button.getAttribute('title')||button.textContent||'').trim();
    if(!label)issues.push(`${name}: bouton sans nom accessible (${button.outerHTML.slice(0,120)})`);
  }
  for(const control of d.querySelectorAll('input,select,textarea')){
    if(!visible(control)||control.type==='hidden'||control.disabled)continue;
    const labelled=control.getAttribute('aria-label')||control.getAttribute('aria-labelledby')||(control.id&&[...d.querySelectorAll('label[for]')].some(label=>label.htmlFor===control.id))||control.closest('label');
    if(!labelled)issues.push(`${name}: champ sans libellé (${control.name||control.id||control.outerHTML.slice(0,80)})`);
  }
  for(const image of d.querySelectorAll('img'))if(!image.hasAttribute('alt'))issues.push(`${name}: image sans attribut alt`);
  for(const svg of d.querySelectorAll('svg.ui-icon'))if(svg.getAttribute('aria-hidden')!=='true')issues.push(`${name}: icône décorative annoncée`);
  for(const dialog of d.querySelectorAll('#modal-root .modal')){if(dialog.getAttribute('role')!=='dialog')issues.push(`${name}: fenêtre sans rôle dialog`);if(dialog.getAttribute('aria-modal')!=='true')issues.push(`${name}: fenêtre non modale pour les aides techniques`)}
}

w.CodexBoard.load(structuredClone(base));
w.CodexBoard.agentStatus({codex:true,claude:true});
audit('Tableau');
for(const [selector,name] of [['[data-surface="flow"]','Flux'],['[data-select="agendaView"]','Agenda'],['[data-select="reviewView"]','Validations'],['[data-select="followView"]','Suivi'],['[data-select="doneView"]','Historique'],['[data-select="settingsView"]','Réglages']]){click(selector);audit(name)}
click('[data-select="global"]');
click('[data-action="add-card"]');audit('Nouvelle tâche');click('[data-action="close-modal"]');
click('[data-action="shortcuts"]');audit('Raccourcis');click('[data-action="close-modal"]');
click('[data-select="settingsView"]');click('[data-action="confirm-import-data"]');audit('Confirmation de restauration');

assert.equal(errors.length,0,errors.map(error=>error.message).join('\n'));
assert.deepEqual(issues,[],issues.join('\n'));
console.log('PASS accessibilité des vues, formulaires et fenêtres principales');
dom.window.close();
