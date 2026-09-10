// Repeated user-level journeys across time zones and network interruptions.
// Run with jsdom 26.1.0 available on NODE_PATH (test dependency only).
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom');
const root=path.resolve(__dirname,'..'),runtimeErrors=[],bridgeMessages=[],vc=new VirtualConsole();vc.on('jsdomError',error=>runtimeErrors.push(error));
const dom=new JSDOM(fs.readFileSync(path.join(root,'Resources/index.html'),'utf8'),{runScripts:'outside-only',url:'file:///app/index.html',pretendToBeVisual:true,virtualConsole:vc});
const w=dom.window,d=w.document;
w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});w.requestAnimationFrame=callback=>{callback();return 1};
w.webkit={messageHandlers:{bridge:{postMessage(message){bridgeMessages.push(structuredClone(message))}}}};
w.eval(fs.readFileSync(path.join(root,'Resources/i18n.js'),'utf8'));w.eval(fs.readFileSync(path.join(root,'Resources/app.js'),'utf8'));

const instant='2026-10-25T01:30:00.000Z',space={id:'project',name:'Projet endurance',rootPath:'/private/tmp/ctrl-kanb-resilience',accentHex:'5477A8'};
const cards=Array.from({length:180},(_,index)=>({id:`card-${index}`,spaceID:space.id,boardPresetID:index%3?'classic':'routines',title:`Tâche ${index+1}`,prompt:'Contrôler le comportement.',status:index%7===0?'done':'ready',priorityLevelID:'normal',priorityNumber:index+1,agentEngine:index%2?'codex':'claude-code',model:index%2?'gpt-5.6-sol':'sonnet',reasoningEffort:'medium',runMode:'readOnly',launchMode:index%3?'manual':'scheduled',scheduledAt:index%3?'':instant,recurrence:index%9===0?'weekly':'none',recurrenceSource:'board',recurrenceSeriesID:index%9===0?`series-${index}`:'',scheduleState:index%3?'':'pending',durationMinutes:60,labels:[],subtasks:[],dependencies:[],categoryAssignments:{},conversations:index===1?[{id:'aaaaaaaa-1234-4234-8234-123456789abc',engine:'codex',name:'Conversation réseau'}]:[],createdAt:instant,updatedAt:instant,completedAt:index%7===0?instant:''}));
const settings={autoSync:false,backgroundSchedulerEnabled:false,autoArchiveCompletedDays:0,defaultModel:'gpt-5.6-sol',defaultModelCodex:'gpt-5.6-sol',defaultModelClaude:'sonnet',defaultEffort:'medium',defaultEffortCodex:'medium',defaultEffortClaude:'medium',maxConcurrency:2,maxConcurrencyCodex:2,maxConcurrencyClaude:1,defaultAgentEngine:'codex',defaultBoardPreset:'classic',activePresetByScope:{},theme:'auto',themePalette:'graphite',fontSize:'normal',language:'fr',agendaMode:'week',agendaTimeZone:'auto',agendaWeekStart:'auto',agendaHourCycle:'auto',accounts:[],activeAccount:{},accountChecks:{},conversationSyncChecks:{},expandedProjectIDs:[],inAppNotifications:'all',systemNotificationsEnabled:true,notificationWhen:'background',notificationEvents:{taskComplete:true,taskFailed:true,approval:true,chatReply:true,scheduleIssue:true},utilityPanelOpen:false,utilityPanelWidth:390,utilityTab:'chat',utilityAgent:'codex',utilitySpaceID:'',utilityCustomPath:''};
const state=zone=>({version:22,spaces:[space],cards,templates:[],validations:[],utilityChats:[],settings:{...settings,agendaTimeZone:zone},modifiedAt:instant});
const click=selector=>{const node=d.querySelector(selector);assert.ok(node,`Contrôle absent: ${selector}`);node.dispatchEvent(new w.MouseEvent('click',{bubbles:true}))};

for(const zone of ['auto','Europe/Paris','America/New_York','Asia/Tokyo','Pacific/Auckland']){
  for(let cycle=0;cycle<8;cycle++){
    w.CodexBoard.load(structuredClone(state(zone)));
    click('[data-select="agendaView"]');
    for(const mode of ['day','week','month']){click(`[data-action="agenda-mode"][data-mode="${mode}"]`);assert.ok(d.querySelector('.agenda-view'),`${zone}: vue Agenda perdue en mode ${mode}`)}
    const latestSave=[...bridgeMessages].reverse().find(message=>message.action==='save');
    if(latestSave){const scheduled=latestSave.data.cards.find(card=>card.id==='card-0');assert.equal(scheduled.scheduledAt,instant,`${zone}: l instant programme a derive`) }
  }
}

w.CodexBoard.load(structuredClone(state('Europe/Paris')));click('[data-select="global"]');click('[data-action="sync-all"]');
assert.ok(bridgeMessages.some(message=>message.action==='syncConversations'),"La tentative réseau ne part pas vers Codex");
w.CodexBoard.syncFailed({message:'Réseau indisponible',completed:0,total:1});w.CodexBoard.claudeSyncFailed({message:'Réseau indisponible',total:1});
assert.match(d.querySelector('#toast-root').textContent,/Réseau indisponible/,"La coupure réseau n est pas visible");
click('[data-action="sync-all"]');w.CodexBoard.conversationsSynced({conversations:[],total:1,failed:0,durationMs:20});w.CodexBoard.claudeSessionsSynced({sessions:[],total:1,failed:0,durationMs:20});
assert.equal(runtimeErrors.length,0,runtimeErrors.map(error=>error.message).join('\n'));
console.log('PASS 40 cycles multi-fuseaux et reprise après coupure réseau');
dom.window.close();
