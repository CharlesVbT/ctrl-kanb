#!/usr/bin/env python3
import sys,json,os,time,unicodedata
args=sys.argv[1:]
assert '--dangerously-skip-permissions' not in args
assert '--permission-prompt-tool' in args and args[args.index('--permission-prompt-tool')+1]=='stdio'
expected_model=os.environ.get('TEST_MODEL','sonnet')
if expected_model=='default': assert '--model' not in args,args
else: assert args[args.index('--model')+1]==expected_model,args
assert args[args.index('--effort')+1]==os.environ.get('TEST_EFFORT','medium'),args
if os.environ.get('TEST_MODE')=='readOnly':
 assert args[args.index('--tools')+1]=='Read,Glob,Grep'
 assert args[args.index('--setting-sources')+1]==''
else: assert '--setting-sources' not in args
expected_title=os.environ.get('TEST_TITLE','Café — test')
assert unicodedata.normalize('NFC',args[args.index('--name')+1])==unicodedata.normalize('NFC',expected_title),(args,expected_title)
if os.environ.get('TEST_SESSION'):
    assert args[args.index('--resume')+1]==os.environ['TEST_SESSION']
    assert '--session-id' not in args
else:
    sid_arg=args[args.index('--session-id')+1]
    assert len(sid_arg)==36
def send(obj):
    data=(json.dumps(obj,ensure_ascii=False)+'\n').encode()
    # Split a French accented character between separate OS writes.
    at=data.find('é'.encode())+1
    if at>0: sys.stdout.buffer.write(data[:at]);sys.stdout.buffer.flush();time.sleep(.015);data=data[at:]
    sys.stdout.buffer.write(data);sys.stdout.buffer.flush()
def receive(): return json.loads(sys.stdin.readline())
a=receive();assert a['request']['subtype']=='initialize'
send({'type':'control_response','response':{'subtype':'success','request_id':a['request_id'],'response':{}}})
b=receive();assert b['message']['content']=='Café, caractères et reprise'
if os.environ.get('TEST_STOP'): time.sleep(30);sys.exit()
if os.environ.get('TEST_CRASH'): sys.stderr.write('Diagnostic français : échec de connexion.');sys.exit(4)
sid=os.environ.get('TEST_SESSION') or sid_arg
send({'type':'system','subtype':'init','session_id':sid})
if os.environ.get('TEST_QUESTION'):
 tool='AskUserQuestion';input={'questions':[{'question':'Quelle couleur ?','header':'Palette','options':[{'label':'Sauge','description':'Vert doux'}]}]}
elif os.environ.get('TEST_READ_PATH'):
 tool='Read';input={'file_path':os.environ['TEST_READ_PATH']}
elif os.environ.get('TEST_GLOB_PATTERN'):
 tool='Glob';input={'pattern':os.environ['TEST_GLOB_PATTERN']}
else: tool='Bash';input={'command':'echo bonjour'}
send({'type':'control_request','request_id':'permission-one','request':{'subtype':'can_use_tool','tool_name':tool,'input':input}})
r=receive();assert r['response']['request_id']=='permission-one'
expected='deny' if os.environ.get('TEST_DECISION')=='decline' or os.environ.get('TEST_EXPECT_DENY') or (os.environ.get('TEST_MODE')=='readOnly' and tool not in ('Read','Glob','Grep')) else 'allow'
assert r['response']['response']['behavior']==expected
if os.environ.get('TEST_QUESTION'):assert r['response']['response']['updatedInput']['answers']['Quelle couleur ?']=='Sauge'
send({'type':'assistant','session_id':sid,'message':{'content':[{'type':'text','text':'Café et tâche vérifiés.'}]}})
send({'type':'result','subtype':'success','is_error':False,'session_id':sid,'result':'Café et tâche vérifiés.'})
# Exit immediately: the native transport must drain the final result first.
