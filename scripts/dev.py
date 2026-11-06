"""Development server accepting common preview-host arguments."""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import argparse
import uvicorn
parser = argparse.ArgumentParser()
parser.add_argument('--host', default='127.0.0.1')
parser.add_argument('--port', type=int, default=8000)
parser.add_argument('--strictPort', action='store_true')
args = parser.parse_args()
uvicorn.run('app.main:app', host=args.host, port=args.port)
