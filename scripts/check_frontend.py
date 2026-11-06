"""Check both deployment entrypoints and inline/external JavaScript syntax."""
from pathlib import Path
import re
import subprocess
import tempfile
root=Path(__file__).resolve().parents[1]
html=(root/'frontend/index.html').read_text()
assert html==(root/'index.html').read_text(), 'HTML entrypoints have diverged'
with tempfile.TemporaryDirectory() as tmp:
    for i,script in enumerate(re.findall(r'<script(?:\s[^>]*)?>(.*?)</script>',html,re.S)):
        if script.strip():
            path=Path(tmp)/f'inline-{i}.js';path.write_text(script)
            subprocess.run(['node','--check',str(path)],check=True)
for name in ['design-brief.js']:
    subprocess.run(['node','--check',str(root/'frontend/js'/name)],check=True)
print('Frontend syntax and entrypoint checks passed')
