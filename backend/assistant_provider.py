"""Server-only provider configuration. No credentials leave the provider adapter."""
import json
import os
from pathlib import Path
import re
import tempfile
import httpx
from .config import ROOT

CONFIG_FILE=ROOT/'data'/'assistant-provider.secret.json'
GROQ_BASE='https://api.groq.com/openai/v1'
GROQ_MODEL='openai/gpt-oss-20b'

def configuration():
    if os.getenv('GROQ_API_KEY'):
        return {'provider':'groq','key':os.environ['GROQ_API_KEY'],'base_url':GROQ_BASE,'model':os.getenv('GROQ_MODEL',GROQ_MODEL)}
    if CONFIG_FILE.is_file():
        if CONFIG_FILE.stat().st_size>8192:raise ValueError('Invalid provider configuration size')
        data=json.loads(CONFIG_FILE.read_text(encoding='utf-8'))
        if isinstance(data,dict) and data.get('provider')=='groq' and isinstance(data.get('key'),str) and re.fullmatch(r'gsk_[A-Za-z0-9_-]{20,300}',data['key']):
            return {'provider':'groq','key':data['key'],'base_url':GROQ_BASE,'model':GROQ_MODEL}
    if os.getenv('AI_API_KEY'):
        base=os.getenv('AI_BASE_URL','https://api.openai.com/v1').rstrip('/')
        return {'provider':'groq' if base==GROQ_BASE else 'compatible','key':os.environ['AI_API_KEY'],'base_url':base,'model':os.getenv('AI_MODEL','gpt-4.1-mini')}
    return {'provider':'groq','key':'','base_url':GROQ_BASE,'model':GROQ_MODEL}

def status():
    try:config=configuration()
    except (OSError,ValueError):return {'configured':False,'provider':'groq','model':GROQ_MODEL,'mode':'evidence-only'}
    return {'configured':bool(config['key']),'provider':config['provider'],'model':config['model'],'mode':'model' if config['key'] else 'evidence-only'}

async def connect_groq(key):
    if not isinstance(key,str) or not re.fullmatch(r'gsk_[A-Za-z0-9_-]{20,300}',key):
        raise ValueError('Enter a valid Groq API key. The key was not saved.')
    try:
        async with httpx.AsyncClient(timeout=15,follow_redirects=False) as client:
            response=await client.get(GROQ_BASE+'/models',headers={'Authorization':'Bearer '+key})
            if response.status_code in (401,403):raise ValueError('Groq rejected this key. Check its permissions and try again; the key was not saved.')
            response.raise_for_status()
            models={item.get('id') for item in response.json().get('data',[])}
            if GROQ_MODEL not in models:raise ValueError('The configured Groq model is not available for this account. The key was not saved.')
    except (httpx.HTTPError,KeyError,TypeError):
        raise ValueError('Could not validate the key with Groq. Check your connection or account limits; the key was not saved.') from None
    CONFIG_FILE.parent.mkdir(parents=True,exist_ok=True)
    temporary=None
    try:
        descriptor,temporary=tempfile.mkstemp(prefix='provider-',suffix='.tmp',dir=CONFIG_FILE.parent)
        with os.fdopen(descriptor,'w',encoding='utf-8') as file:
            json.dump({'provider':'groq','key':key},file)
        Path(temporary).replace(CONFIG_FILE)
    finally:
        if temporary and Path(temporary).exists():Path(temporary).unlink()
    return status()
