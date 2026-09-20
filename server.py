"""Dependency-free local AgentOS MVP. Requires Python 3.12+ and Ollama for live inference."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError
import json, sqlite3, threading, os
from datetime import datetime, timezone

ROOT=Path(__file__).parent; DB=ROOT/'agentos.db'; LOCK=threading.Lock(); CREDENTIALS={}; MCP_SERVERS={}
def now(): return datetime.now(timezone.utc).isoformat()
def db():
 c=sqlite3.connect(DB);c.row_factory=sqlite3.Row;return c
def init():
 c=db();c.executescript('CREATE TABLE IF NOT EXISTS agents(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,role TEXT NOT NULL,provider TEXT NOT NULL DEFAULT "ollama",model TEXT NOT NULL,system_prompt TEXT NOT NULL,local_only INTEGER NOT NULL DEFAULT 1,status TEXT NOT NULL DEFAULT "ready",created_at TEXT NOT NULL);CREATE TABLE IF NOT EXISTS runs(id INTEGER PRIMARY KEY AUTOINCREMENT,agent_id INTEGER NOT NULL,agent_name TEXT NOT NULL,model TEXT NOT NULL,task TEXT NOT NULL,routing TEXT,status TEXT NOT NULL,result TEXT,error TEXT,created_at TEXT NOT NULL,finished_at TEXT);')
 try:c.execute('ALTER TABLE agents ADD COLUMN provider TEXT NOT NULL DEFAULT "ollama"')
 except sqlite3.OperationalError:pass
 c.execute('UPDATE agents SET model="qwen3.5:4b" WHERE provider="ollama" AND model IN ("qwen2.5:3b","qwen4.5:4b")')
 if not c.execute('SELECT 1 FROM agents LIMIT 1').fetchone(): c.executemany('INSERT INTO agents(name,role,model,system_prompt,local_only,status,created_at) VALUES(?,?,?,?,?,?,?)',[('Scout','Researcher','qwen2.5:3b','Find reliable evidence. Cite uncertainties and sources.',1,'ready',now()),('Miller','Analyst','qwen2.5:3b','Synthesize evidence into clear reasoning.',1,'ready',now()),('Juniper','Writer','qwen2.5:3b','Write clear, useful drafts based only on supplied work.',1,'ready',now()),('Clover','Reviewer','qwen2.5:3b','Critique accuracy, gaps, and next steps.',1,'ready',now())])
 c.commit();c.close()
def query(sql,args=()):
 c=db();r=[dict(x) for x in c.execute(sql,args).fetchall()];c.close();return r
def execute(sql,args=()):
 with LOCK:
  c=db();x=c.execute(sql,args);c.commit();i=x.lastrowid;c.close();return i
def models():
 try:
  with urlopen('http://127.0.0.1:11434/api/tags',timeout=2) as r:return [x['name'] for x in json.load(r).get('models',[])],True
 except (URLError,TimeoutError,OSError):return [],False
def mcp_probe(url,token=''):
 headers={'Content-Type':'application/json','Accept':'application/json, text/event-stream'}
 if token: headers['Authorization']='Bearer '+token
 payload={'jsonrpc':'2.0','id':1,'method':'initialize','params':{'protocolVersion':'2025-06-18','capabilities':{},'clientInfo':{'name':'AgentOS','version':'1.0'}}}
 req=Request(url,data=json.dumps(payload).encode(),headers=headers,method='POST')
 with urlopen(req,timeout=12) as r:
  raw=r.read().decode(errors='replace');return {'ok':True,'status':r.status,'preview':raw[:1200]}
def invoke(run_id,a):
 execute("UPDATE agents SET status='running' WHERE id=?",(a['id'],));prompt=f"{a['system_prompt']}\n\nUser task:\n{a['task']}\n\nReturn your distinct contribution."
 try:
  if a.get('provider','ollama')=='ollama':
   req=Request('http://127.0.0.1:11434/api/generate',data=json.dumps({'model':a['model'],'prompt':prompt,'stream':False}).encode(),headers={'Content-Type':'application/json'})
   with urlopen(req,timeout=300) as r: out=json.load(r).get('response','')
  elif a['provider']=='openai':
   key=CREDENTIALS.get('openai') or os.getenv('OPENAI_API_KEY')
   if not key:raise RuntimeError('OPENAI_API_KEY is not set on the server')
   req=Request('https://api.openai.com/v1/chat/completions',data=json.dumps({'model':a['model'],'messages':[{'role':'system','content':a['system_prompt']},{'role':'user','content':a['task']}]}).encode(),headers={'Content-Type':'application/json','Authorization':'Bearer '+key})
   with urlopen(req,timeout=300) as r: out=json.load(r)['choices'][0]['message']['content']
  elif a['provider']=='anthropic':
   key=CREDENTIALS.get('anthropic') or os.getenv('ANTHROPIC_API_KEY')
   if not key:raise RuntimeError('ANTHROPIC_API_KEY is not set on the server')
   req=Request('https://api.anthropic.com/v1/messages',data=json.dumps({'model':a['model'],'max_tokens':2048,'system':a['system_prompt'],'messages':[{'role':'user','content':a['task']}]}).encode(),headers={'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01'})
   with urlopen(req,timeout=300) as r: out=json.load(r)['content'][0]['text']
  elif a['provider']=='gemini':
   key=CREDENTIALS.get('gemini') or os.getenv('GOOGLE_API_KEY')
   if not key:raise RuntimeError('GOOGLE_API_KEY is not set on the server')
   req=Request('https://generativelanguage.googleapis.com/v1beta/models/'+a['model']+':generateContent?key='+key,data=json.dumps({'system_instruction':{'parts':[{'text':a['system_prompt']}]},'contents':[{'parts':[{'text':a['task']}]}]}).encode(),headers={'Content-Type':'application/json'})
   with urlopen(req,timeout=300) as r: out=json.load(r)['candidates'][0]['content']['parts'][0]['text']
  else:raise RuntimeError('Unknown provider: '+a['provider'])
  execute("UPDATE runs SET status='completed',result=?,finished_at=? WHERE id=?",(out,now(),run_id))
 except (URLError,HTTPError,TimeoutError,OSError,json.JSONDecodeError,RuntimeError) as e:execute("UPDATE runs SET status='failed',error=?,finished_at=? WHERE id=?",(f'{a.get("provider","ollama")} execution failed: {e}',now(),run_id))
 finally:execute("UPDATE agents SET status='ready' WHERE id=?",(a['id'],))
class Handler(SimpleHTTPRequestHandler):
 def __init__(self,*a,**kw):super().__init__(*a,directory=str(ROOT),**kw)
 def send_json(self,data,status=200):
  raw=json.dumps(data).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw)
 def body(self):
  try:return json.loads(self.rfile.read(int(self.headers.get('Content-Length','0'))))
  except json.JSONDecodeError:return {}
 def do_GET(self):
  p=self.path.split('?')[0]
  if p in ('/','/index.html'):
   raw=(ROOT/'new-index.html').read_text(encoding='utf-8').replace('</head>','<link rel="stylesheet" href="/new-ui.css?v=20260830"><link rel="stylesheet" href="/immersive.css?v=20260830"><link rel="stylesheet" href="/pixel-command.css?v=20260907"><link rel="stylesheet" href="/rich-ui.css?v=20260907"><link rel="stylesheet" href="/layout-fix.css?v=20260907"><link rel="stylesheet" href="/contrast-fix.css?v=20260907"><link rel="stylesheet" href="/glitch-fix.css?v=20260907"><link rel="stylesheet" href="/theme-layer.css?v=20260907"><link rel="stylesheet" href="/paper-theme.css?v=20260907"><link rel="stylesheet" href="/soft-theme.css?v=20260907"><link rel="stylesheet" href="/clean-theme.css?v=20260907"><link rel="stylesheet" href="/polish.css?v=20260907"><link rel="stylesheet" href="/final-theme.css?v=20260907"><link rel="stylesheet" href="/gap-fix.css?v=20260907"><link rel="stylesheet" href="/space-fill.css?v=20260907"><link rel="stylesheet" href="/performance.css?v=20260907"></head>')
   data=raw.encode();self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data);return
  if p in ('/guide','/readme'):
   raw=(ROOT/'guide.html').read_text(encoding='utf-8').replace('</head>','<link rel="stylesheet" href="/guide-enhance.css?v=20260920"><link rel="stylesheet" href="/unified-theme.css?v=20260920"></head>').encode();self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw);return
  if p=='/api/agents':return self.send_json(query('SELECT * FROM agents ORDER BY id'))
  if p=='/api/runs':return self.send_json(query('SELECT * FROM runs ORDER BY id DESC LIMIT 60'))
  if p.startswith('/api/search'):
   from urllib.parse import parse_qs, urlparse
   q=parse_qs(urlparse(self.path).query).get('q',[''])[0].strip()
   if not q:return self.send_json([])
   like='%'+q+'%';return self.send_json(query('SELECT id,agent_name,model,status,result,error,created_at FROM runs WHERE task LIKE ? OR result LIKE ? OR agent_name LIKE ? ORDER BY id DESC LIMIT 12',(like,like,like)))
  if p=='/api/models':
   m,ok=models();return self.send_json({'ollama':ok,'models':m,'providers':{'openai':bool(CREDENTIALS.get('openai') or os.getenv('OPENAI_API_KEY')),'anthropic':bool(CREDENTIALS.get('anthropic') or os.getenv('ANTHROPIC_API_KEY')),'gemini':bool(CREDENTIALS.get('gemini') or os.getenv('GOOGLE_API_KEY'))}})
  if p=='/api/credentials':return self.send_json({k:bool(CREDENTIALS.get(k) or os.getenv(v)) for k,v in {'openai':'OPENAI_API_KEY','anthropic':'ANTHROPIC_API_KEY','gemini':'GOOGLE_API_KEY'}.items()})
  if p=='/api/mcp/servers':return self.send_json([{'id':k,'name':v['name'],'url':v['url'],'connected':v.get('connected',False),'tools':v.get('tools',[])} for k,v in MCP_SERVERS.items()])
  if p.startswith('/api/runs/'):
   r=query('SELECT * FROM runs WHERE id=?',(p.rsplit('/',1)[1],));return self.send_json(r[0] if r else {'detail':'Run not found'},200 if r else 404)
  return super().do_GET()
 def do_POST(self):
  p=self.path;d=self.body()
  if p=='/api/credentials':
   provider=str(d.get('provider','')).lower();key=str(d.get('key','')).strip()
   if provider not in ('openai','anthropic','gemini') or len(key)<10:return self.send_json({'detail':'Choose a supported provider and enter a valid API key.'},400)
   CREDENTIALS[provider]=key;return self.send_json({'ok':True,'provider':provider})
  if p=='/api/mcp/servers':
   sid=str(d.get('id','')).strip().lower();name=str(d.get('name',sid)).strip();url=str(d.get('url','')).strip();token=str(d.get('token','')).strip()
   if not sid or not url.startswith(('http://','https://')):return self.send_json({'detail':'Enter a server id and a valid http(s) MCP endpoint.'},400)
   try:
    result=mcp_probe(url,token); MCP_SERVERS[sid]={'name':name or sid,'url':url,'token':token,'connected':True,'tools':[]};return self.send_json({'ok':True,'id':sid,'probe':result})
   except Exception as e:
    MCP_SERVERS[sid]={'name':name or sid,'url':url,'token':token,'connected':False,'tools':[]};return self.send_json({'detail':'MCP handshake failed: '+str(e)},502)
  if p=='/api/agents':
   need=['name','role','model','system_prompt']
   if not all(str(d.get(x,'')).strip() for x in need):return self.send_json({'detail':'Name, role, model, and system instruction are required.'},400)
   i=execute('INSERT INTO agents(name,role,provider,model,system_prompt,local_only,status,created_at) VALUES(?,?,?,?,?,?,?,?)',(d['name'][:60],d['role'][:60],d.get('provider','ollama'),d['model'][:100],d['system_prompt'][:1000],int(d.get('local_only',True)),'ready',now()));return self.send_json({'id':i},201)
  if p.startswith('/api/agents/') and p.endswith('/runs'):
   task=str(d.get('task','')).strip();aid=p.split('/')[-2];rows=query('SELECT * FROM agents WHERE id=?',(aid,))
   if not task or not rows:return self.send_json({'detail':'A valid agent and task are required'},400)
   a=rows[0];i=execute('INSERT INTO runs(agent_id,agent_name,model,task,routing,status,created_at) VALUES(?,?,?,?,?,?,?)',(a['id'],a['name'],a['model'],task,'Single agent','running',now()));a['task']=task;threading.Thread(target=invoke,args=(i,a),daemon=True).start();return self.send_json({'count':1,'run_ids':[i]},202)
  if p=='/api/runs':
   task=str(d.get('task','')).strip()
   if not task:return self.send_json({'detail':'Task is required'},400)
   requested=d.get('agent_ids');group=query('SELECT * FROM agents ORDER BY id')
   if isinstance(requested,list) and requested:group=[a for a in group if a['id'] in requested]
   ids=[]
   for a in group:
    i=execute('INSERT INTO runs(agent_id,agent_name,model,task,routing,status,created_at) VALUES(?,?,?,?,?,?,?)',(a['id'],a['name'],a['model'],task,d.get('routing','Balanced service'),'running',now()));ids.append(i);a['task']=task;threading.Thread(target=invoke,args=(i,a),daemon=True).start()
   return self.send_json({'count':len(ids),'run_ids':ids},202)
  return self.send_json({'detail':'Not found'},404)
 def do_PATCH(self):
  p=self.path;d=self.body()
  if not p.startswith('/api/agents/'):return self.send_json({'detail':'Not found'},404)
  fields=['name','role','provider','model','system_prompt','local_only'];sets=[];vals=[]
  for f in fields:
   if f in d:sets.append(f+'=?');vals.append(int(d[f]) if f=='local_only' else str(d[f])[:1000])
  if not sets:return self.send_json({'detail':'No changes'},400)
  vals.append(p.rsplit('/',1)[1]);execute('UPDATE agents SET '+','.join(sets)+' WHERE id=?',vals);return self.send_json({'ok':True})
 def end_headers(self):
  self.send_header('Cache-Control','no-store')
  super().end_headers()
 def log_message(self,*a):pass
if __name__=='__main__':init();print('AgentOS Cafe running at http://localhost:8080');ThreadingHTTPServer(('127.0.0.1',8080),Handler).serve_forever()
