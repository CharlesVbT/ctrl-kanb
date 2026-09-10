// DOM regression tests for visible Codex synchronization feedback.
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {JSDOM,VirtualConsole}=require('jsdom');
const root=path.join(__dirname,'..'),messages=[],errors=[],vc=new VirtualConsole();
vc.on('jsdomError',error=>errors.push(error));
const dom=new JSDOM(fs.readFileSync(path.join(root,'Resources/index.html'),'utf8'),{
  url:'https://ctrl-kanb.test',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc
});
const w=dom.window,d=w.document;
w.structuredClone=structuredClone;w.setInterval=()=>0;w.setTimeout=()=>0;w.requestAnimationFrame=fn=>fn();
w.webkit={messageHandlers:{bridge:{postMessage:message=>messages.push(structuredClone(message))}}};
w.eval(fs.readFileSync(path.join(root,'Resources/app.js'),'utf8'));

const mainID='11111111-1234-4234-8234-123456789abc';
const attemptID='22222222-1234-4234-8234-123456789abc';
const claudeID='33333333-1234-4234-8234-123456789abc';
const archivedID='44444444-1234-4234-8234-123456789abc';
const card={id:'codex-card',spaceID:'project',title:'Carte Codex',prompt:'Objectif',status:'review',agentEngine:'codex',conversations:[
  {id:mainID,engine:'codex',name:'Principale',role:'main'},
  {id:attemptID,engine:'codex',name:'Ancien essai',role:'attempt'}
],activeConversationID:mainID,createdAt:new Date().toISOString()};
const state={version:18,spaces:[{id:'project',name:'Projet',rootPath:'/private/tmp/projet'}],cards:[
  card,
  {id:'claude-card',spaceID:'project',title:'Claude',prompt:'',status:'review',agentEngine:'claude-code',conversations:[{id:claudeID,engine:'claude-code',role:'main'}],activeConversationID:claudeID},
  {id:'archived-card',spaceID:'project',title:'Archivée',prompt:'',status:'done',archived:true,agentEngine:'codex',conversations:[{id:archivedID,engine:'codex',role:'main'}],activeConversationID:archivedID}
],templates:[],validations:[],settings:{autoSync:false,backgroundSchedulerEnabled:false,language:'fr'},modifiedAt:new Date().toISOString()};
w.CodexBoard.load(state);
const syncButton=()=>d.querySelector('#sidebar-sync');
const claudeSyncButton=()=>d.querySelector('#sidebar-claude-sync');
const syncMessages=()=>messages.filter(message=>message.action==='syncConversations');
const claudeSyncMessages=()=>messages.filter(message=>message.action==='syncClaudeSessions');
let checks=0;const test=(label,fn)=>{fn();checks++;console.log('PASS',label)};

test('the manual control explicitly refreshes Codex and Claude Code',()=>{
  const button=d.querySelector('.header-sync-all');
  assert.ok(button);
  assert.equal(button.textContent.trim(),'');
  assert.equal(button.getAttribute('aria-label'),'Synchroniser Codex et Claude Code');
  button.click();
  assert.equal(d.querySelector('.toast')?.textContent,'Synchronisation de Codex et Claude Code en cours…');
  assert.deepEqual(syncMessages().at(-1).threadIDs,[mainID]);
  assert.deepEqual(claudeSyncMessages().at(-1).sessions.map(item=>item.sessionID),[claudeID]);
  assert.equal(d.querySelector('.header-sync-all').disabled,true);
  w.CodexBoard.conversationsSynced({conversations:[{id:mainID,name:'Principale',status:{type:'idle'},turns:[]}],total:1,failed:0,durationMs:10});
  w.CodexBoard.claudeSessionsSynced({sessions:[{sessionID:claudeID,accountID:'claude-code:default',found:true,preview:'Réponse Claude',updatedAt:'2026-09-09T12:00:00Z'}],total:1,failed:0,durationMs:10});
  assert.equal(d.querySelector('.header-sync-all').disabled,false);
});

test('only the active Codex conversation is refreshed',()=>{
  syncButton().click();
  assert.deepEqual(syncMessages().at(-1).threadIDs,[mainID]);
  assert.equal(syncButton().disabled,true);
  assert.match(syncButton().textContent,/Codex/);
});

test('progress and a slow response remain explicit',()=>{
  w.CodexBoard.syncStarted({total:1});
  w.CodexBoard.syncProgress({completed:0,total:1});
  assert.match(syncButton().textContent,/0\/1/);
  const before=syncMessages().length;
  syncButton().click();
  assert.equal(syncMessages().length,before);
  w.CodexBoard.syncSlow({completed:0,total:1});
  assert.equal(syncButton().querySelector('.sidebar-sync-state small').textContent,'Réponse lente');
  assert.match(syncButton().title,/répond toujours/);
});

test('completion reports duration and restores retry control',()=>{
  w.CodexBoard.syncProgress({completed:1,total:1});
  w.CodexBoard.conversationsSynced({conversations:[{id:mainID,name:'Principale actualisée',status:{type:'idle'},turns:[]}],total:1,failed:0,durationMs:1250});
  assert.equal(syncButton().disabled,false);
  assert.equal(syncButton().querySelector('.sidebar-sync-engine strong').textContent,'Codex');
  assert.equal(syncButton().querySelector('.sidebar-sync-state small').textContent,'À jour');
  assert.match(syncButton().title,/1 conversation principale Codex actualisée/);
  assert.equal(state.settings.conversationSyncChecks.codex.phase,'success');
});

test('a native failure is visible and immediately retryable',()=>{
  syncButton().click();
  w.CodexBoard.syncFailed({message:'Codex n’a pas répondu dans les 20 secondes.',completed:0,total:1});
  assert.equal(syncButton().disabled,false);
  assert.equal(syncButton().querySelector('.sidebar-sync-state small').textContent,'À vérifier');
  assert.equal(syncButton().title,'Codex n’a pas répondu dans les 20 secondes.');
  const beforeRetry=syncMessages().length;
  syncButton().click();
  assert.equal(syncMessages().length,beforeRetry+1);
  w.CodexBoard.syncFailed({message:'Fin du test',completed:0,total:1});
});

test('a partly refreshed Codex set is reported honestly',()=>{
  syncButton().click();
  w.CodexBoard.conversationsSynced({conversations:[{id:mainID,name:'Principale relue',status:{type:'idle'},turns:[]}],total:3,failed:1,durationMs:20});
  assert.equal(syncButton().disabled,false);
  assert.equal(syncButton().querySelector('.sidebar-sync-state small').textContent,'2/3');
  assert.match(syncButton().title,/2\/3 conversations Codex relues/);
  assert.equal(state.settings.conversationSyncChecks.codex.phase,'partial');
});

test('new Codex conversations explain their delayed appearance',()=>{
  w.CodexBoard.conversationAssociated({cardID:card.id,threadID:'55555555-1234-4234-8234-123456789abc',name:'Nouvelle conversation',engine:'codex',created:true});
  assert.match(d.querySelector('#toast-root').textContent,/apparition dans la liste peut prendre quelques secondes/);
});

test('Claude sessions are read separately and update their visible result',()=>{
  claudeSyncButton().click();
  const request=claudeSyncMessages().at(-1);
  assert.deepEqual(request.sessions.map(item=>item.sessionID),[claudeID]);
  assert.equal(request.sessions[0].accountID,'claude-code:default');
  assert.equal(claudeSyncButton().disabled,true);
  w.CodexBoard.claudeSyncStarted({total:1});
  w.CodexBoard.claudeSessionsSynced({sessions:[{sessionID:claudeID,accountID:'claude-code:default',found:true,preview:'Réponse Claude relue',cwd:'/private/tmp/projet',updatedAt:'2026-09-09T12:00:00Z'}],total:1,failed:0,durationMs:12});
  assert.equal(claudeSyncButton().disabled,false);
  assert.equal(claudeSyncButton().querySelector('.sidebar-sync-engine strong').textContent,'Claude Code');
  assert.equal(claudeSyncButton().querySelector('.sidebar-sync-state small').textContent,'À jour');
  assert.match(claudeSyncButton().title,/1 session Claude locale relue/);
  assert.equal(state.cards[1].conversations[0].preview,'Réponse Claude relue');
  assert.equal(state.cards[1].lastRun.summary,'Réponse Claude relue');
  assert.equal(state.settings.conversationSyncChecks['claude-code'].phase,'success');
});

test('a missing Claude session is never presented as up to date',()=>{
  claudeSyncButton().click();
  w.CodexBoard.claudeSyncStarted({total:1});
  w.CodexBoard.claudeSessionsSynced({sessions:[{sessionID:claudeID,accountID:'claude-code:default',found:false,error:'Session locale Claude introuvable.'}],total:1,failed:1,durationMs:3});
  assert.equal(claudeSyncButton().querySelector('.sidebar-sync-state small').textContent,'À vérifier');
  assert.match(claudeSyncButton().title,/session Claude locale est introuvable/);
});

test('a partly refreshed Claude set is reported honestly',()=>{
  claudeSyncButton().click();
  w.CodexBoard.claudeSyncStarted({total:2});
  w.CodexBoard.claudeSessionsSynced({sessions:[{sessionID:claudeID,accountID:'claude-code:default',found:true,preview:'Réponse relue'}],total:2,failed:1,durationMs:4});
  assert.equal(claudeSyncButton().querySelector('.sidebar-sync-state small').textContent,'1/2');
  assert.match(claudeSyncButton().title,/1\/2 sessions Claude relues/);
  assert.equal(state.settings.conversationSyncChecks['claude-code'].phase,'partial');
});

test('no linked Codex conversation is never presented as up to date',()=>{
  w.CodexBoard.load({...state,cards:[]});
  syncButton().click();
  assert.equal(syncButton().querySelector('.sidebar-sync-state small').textContent,'Aucune conversation');
  assert.doesNotMatch(syncButton().textContent,/à jour/i);
  assert.match(syncButton().title,/Aucune conversation principale Codex/);
  claudeSyncButton().click();
  assert.equal(claudeSyncButton().querySelector('.sidebar-sync-state small').textContent,'Aucune session');
  assert.doesNotMatch(claudeSyncButton().textContent,/à jour/i);
});

assert.equal(errors.length,0,errors.map(error=>error.message).join('\n'));
console.log(`${checks} synchronization scenarios passed`);
dom.window.close();
