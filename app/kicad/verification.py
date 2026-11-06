"""Run the native KiCad 9 CLI on a supplied artifact; never synthesize PASS."""
from pathlib import Path
import hashlib
import json
import shutil
import subprocess
import tempfile


def verify_artifact(path, timeout=60):
    source = Path(path).resolve()
    kinds = {'.kicad_sch': ('sch', 'erc'), '.kicad_pcb': ('pcb', 'drc')}
    if source.suffix not in kinds or not source.is_file():
        raise ValueError('A real .kicad_sch or .kicad_pcb file is required')
    data = source.read_bytes()
    result = {'status': 'NOT_RUN', 'artifact': source.name,
              'artifact_sha256': hashlib.sha256(data).hexdigest(),
              'tool': 'kicad-cli', 'tool_version': None, 'exit_code': None,
              'manufacturing_ready': False}
    executable = shutil.which('kicad-cli')
    if not executable:
        return {**result, 'reason': 'KiCad CLI is not installed'}
    try:
        version = subprocess.run([executable, 'version'], capture_output=True, text=True, timeout=10, check=True)
        result['tool_version'] = version.stdout.strip()
        with tempfile.TemporaryDirectory(prefix='eda-check-') as tmp:
            # Snapshot guarantees the digest matches exactly the checked bytes.
            snapshot = Path(tmp) / source.name
            snapshot.write_bytes(data)
            report = Path(tmp) / 'report.json'
            command = [executable, *kinds[source.suffix], '--format', 'json', '--severity-all',
                       '--exit-code-violations', '--output', str(report), str(snapshot)]
            completed = subprocess.run(command, capture_output=True, text=True, timeout=timeout, check=False)
            result.update(exit_code=completed.returncode, stdout=completed.stdout, stderr=completed.stderr,
                          command=['kicad-cli', *command[1:-3], '<report.json>', '<artifact>'])
            if completed.returncode not in (0, 5):
                return {**result, 'status': 'ERROR', 'reason': 'KiCad could not validate the artifact'}
            if not report.is_file():
                return {**result, 'status': 'ERROR', 'reason': 'KiCad did not produce a report'}
            result['report'] = json.loads(report.read_text())
            # Exit 5 indicates rule violations. Preserve report without implying certification.
            result['status'] = 'PASS' if completed.returncode == 0 else 'FAIL'
            result['scope'] = 'Standalone native rule check; project rules, schematic parity, libraries, functional validation and signoff remain required'
            return result
    except subprocess.TimeoutExpired:
        return {**result, 'status': 'ERROR', 'reason': 'KiCad timed out'}
    except (OSError, subprocess.CalledProcessError, ValueError) as exc:
        return {**result, 'status': 'ERROR', 'reason': str(exc)}
