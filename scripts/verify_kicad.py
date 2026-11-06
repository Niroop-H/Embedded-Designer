"""Usage: python scripts/verify_kicad.py board.kicad_pcb --output evidence.json"""
import argparse
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.kicad.verification import verify_artifact

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Native KiCad standalone artifact verification')
    parser.add_argument('artifact')
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    result = verify_artifact(args.artifact)
    Path(args.output).write_text(json.dumps(result, indent=2))
    print(f"{result['status']}: {result['artifact']} (KiCad {result['tool_version']})")
    sys.exit(0 if result['status'] == 'PASS' else 1)
