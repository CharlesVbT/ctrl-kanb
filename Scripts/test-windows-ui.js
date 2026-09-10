// Run with jsdom 26.1.0 available on NODE_PATH (test dependency only).
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {JSDOM,VirtualConsole}=require('jsdom');
const root=path.join(__dirname,'..'),messages=[],errors=[];
const consoleSink=new VirtualConsole();consoleSink.on('jsdomError',error=>errors.push(error));
const dom=new JSDOM(fs.readFileSync(path.join(root,'Resources/index.html'),'utf8'),{url:'https://ctrl-kanb.windows',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:consoleSink});
const w=dom.window,d=w.document;
w.structuredClone=structuredClone;w.setInterval=()=>0;w.setTimeout=()=>0;w.requestAnimationFrame=callback=>callback();
w.CTRL_KANB_PLATFORM='windows';
w.ctrlKanbNative={postMessage:message=>messages.push(structuredClone(message))};
w.eval(fs.readFileSync(path.join(root,'Resources/i18n.js'),'utf8'));
w.eval(fs.readFileSync(path.join(root,'Resources/app.js'),'utf8'));
const state={version:22,spaces:[{id:'project',name:'Projet Windows',rootPath:'C:\\Users\\Test\\Projet',accentHex:'527A9A'}],cards:[],utilityChats:[],templates:[],validations:[],settings:{autoSync:false,backgroundSchedulerEnabled:false,maxConcurrencyCodex:2,maxConcurrencyClaude:1,accounts:[],activeAccount:{},accountChecks:{},conversationSyncChecks:{},language:'fr'},modifiedAt:new Date().toISOString()};
w.CodexBoard.load(state);w.CodexBoard.securityStatus({lockEnabled:true,biometry:'Windows Hello'});w.CodexBoard.agentStatus({codex:true,claude:true});
const click=selector=>{const element=d.querySelector(selector);assert.ok(element,selector);element.click();};

click('[data-select="settingsView"]');
const settings=d.querySelector('#board').textContent;
for(const expected of ['Notifications Windows','Protège l’accès à la fenêtre CTRL KANB sur ce PC.','Windows Hello','%LOCALAPPDATA%\\CTRL KANB Data\\board.json','Application Windows']) assert.ok(settings.includes(expected),expected);
for(const forbidden of ['Finder','macOS','sur ce Mac','ce Mac','⌘','⌥']) assert.ok(!settings.includes(forbidden),`libellé macOS visible sous Windows: ${forbidden}`);

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
d.body.dispatchEvent(new w.KeyboardEvent('keydown',{key:'l',ctrlKey:true,bubbles:true,cancelable:true}));
assert.equal(messages.at(-1).action,'lockNow');

assert.equal(errors.length,0,errors.map(error=>error.message).join('\n'));
console.log('PASS interface, textes et raccourcis Windows');
dom.window.close();
