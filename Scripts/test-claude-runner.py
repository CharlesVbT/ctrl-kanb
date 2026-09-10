#!/usr/bin/env python3
import pathlib,subprocess,os,json,tempfile
p=pathlib.Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix='ctrl-kanb-native-test-') as tmp:
 binary=pathlib.Path(tmp)/'probe'
 subprocess.run(['clang','-fobjc-arc','-fmodules','-mmacosx-version-min=14.0','-framework','Cocoa','-framework','WebKit','-framework','UserNotifications','-framework','UniformTypeIdentifiers',str(p/'Tests/ClaudeRunnerTests.m'),str(p/'Sources/App/AppServerClient.m'),'-o',str(binary)],check=True)
 sync_home=pathlib.Path(tmp)/'claude-account';sync_folder=sync_home/'projects'/'-private-tmp-projet';sync_folder.mkdir(parents=True)
 sync_session='55555555-1234-4234-8234-123456789abc'
 transcript=[
  {'type':'user','sessionId':sync_session,'timestamp':'2026-09-09T11:59:00Z','cwd':'/private/tmp/projet','message':{'role':'user','content':'Question'}},
  {'type':'assistant','sessionId':sync_session,'timestamp':'2026-09-09T12:00:00Z','cwd':'/private/tmp/projet','message':{'role':'assistant','content':[{'type':'text','text':'Réponse Claude relue'}]}}
 ]
 (sync_folder/f'{sync_session}.jsonl').write_text('\n'.join(json.dumps(item,ensure_ascii=False) for item in transcript)+'\n')
 for name,session,found in [('local session sync',sync_session,True),('missing local session', '66666666-1234-4234-8234-123456789abc',False)]:
  env={**os.environ,'TEST_SYNC_HOME':str(sync_home),'TEST_SYNC_SESSION':session}
  run=subprocess.run([str(binary)],env=env,capture_output=True,text=True,timeout=10,check=True)
  result=json.loads(run.stdout);assert result['complete'],name
  assert result['result']['total']==1 and result['result']['failed']==(0 if found else 1),result
  snapshot=result['result']['sessions'][0];assert snapshot['found'] is found,result
  if found:
   assert snapshot['preview']=='Réponse Claude relue' and snapshot['cwd']=='/private/tmp/projet',snapshot
  print('PASS',name)
 project_root=pathlib.Path(tmp)/'workspace';project_root.mkdir();inside=project_root/'inside.txt';inside.write_text('inside')
 outside=pathlib.Path(tmp)/'outside.txt';outside.write_text('outside')
 board_file=pathlib.Path(tmp)/'board.json'
 board_file.write_text(json.dumps({'version':22,'spaces':[{'id':'test-space','name':'Projet test','rootPath':str(project_root)}],'cards':[],'settings':{}},ensure_ascii=False))
 cases=[('model and effort',{'TEST_MODEL':'opus','TEST_EFFORT':'xhigh'}),('account default model',{'TEST_MODEL':'default'}),('permission accept',{}),('permission refuse',{'TEST_DECISION':'decline'}),('readonly blocks write',{'TEST_MODE':'readOnly'}),('readonly allows project read',{'TEST_MODE':'readOnly','TEST_CWD':str(project_root),'TEST_READ_PATH':str(inside)}),('readonly blocks outside read',{'TEST_MODE':'readOnly','TEST_CWD':str(project_root),'TEST_READ_PATH':str(outside),'TEST_EXPECT_DENY':'1'}),('readonly blocks escaping glob',{'TEST_MODE':'readOnly','TEST_CWD':str(project_root),'TEST_GLOB_PATTERN':'../outside/**','TEST_EXPECT_DENY':'1'}),('question',{'TEST_QUESTION':'1'}),('resume',{'TEST_SESSION':'87654321-1234-4234-8234-123456789abc'}),('process failure',{'TEST_CRASH':'1'}),('cancel',{'TEST_STOP':'1'}),('bad session',{'TEST_SESSION':'invalid'})]
 for name,extra in cases:
  env={**os.environ,'CTRL_KANB_CLAUDE_PATH':str(p/'Tests/fake-claude.py'),'CTRL_KANB_DATA_FILE':str(board_file),'TEST_CWD':str(project_root),**extra}
  run=subprocess.run([str(binary)],env=env,capture_output=True,text=True,timeout=20,check=True)
  result=json.loads(run.stdout);assert result['complete'],name
  associations=[x['data'] for x in result['events'] if x['event']=='conversationAssociated']
  if name=='cancel':assert result['events'][-2]['event']=='runnerCanceled' or any(x['event']=='runnerCanceled' for x in result['events'])
  elif name in ['process failure','bad session']:assert result['result']['success'] is False,name
  else:
   assert result['result']['success'] and result['result']['summary']=='Café et tâche vérifiés.',(name,result)
   assert associations and associations[-1]['projectName']=='Projet test',name
   if name=='resume':assert associations[-1]['threadID']==extra['TEST_SESSION'],name
   else:assert len(associations[-1]['threadID'])==36,name
  if name=='readonly blocks write':assert not any(x['event']=='approvalRequested' for x in result['events'])
  print('PASS',name)
 pair_cases=[
  ('distinct Claude sessions use separate processes',{'TEST_QUEUE_PAIR':'1'},'parallel'),
  ('same Claude session stays sequential',{'TEST_QUEUE_PAIR':'1','TEST_SESSION':'87654321-1234-4234-8234-123456789abc'},'sequential'),
 ]
 for name,extra,mode in pair_cases:
  env={**os.environ,'CTRL_KANB_CLAUDE_PATH':str(p/'Tests/fake-claude.py'),'CTRL_KANB_DATA_FILE':str(board_file),'TEST_CWD':str(project_root),**extra}
  run=subprocess.run([str(binary)],env=env,capture_output=True,text=True,timeout=20,check=True)
  result=json.loads(run.stdout);assert result['complete'],name
  lifecycle=[(x['event'],x['data'].get('cardID')) for x in result['events'] if x['event'] in ['runnerStarted','runnerFinished']]
  starts=[index for index,item in enumerate(lifecycle) if item[0]=='runnerStarted']
  finishes=[index for index,item in enumerate(lifecycle) if item[0]=='runnerFinished']
  assert len(starts)==2 and len(finishes)==2,(name,lifecycle)
  if mode=='parallel':assert starts[1]<finishes[0],(name,lifecycle)
  else:assert starts[0]<finishes[0]<starts[1]<finishes[1],(name,lifecycle)
  print('PASS',name)
 print('17 native scenarios passed')
