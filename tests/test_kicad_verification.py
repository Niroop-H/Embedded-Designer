import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from app.kicad.verification import verify_artifact

class NativeVerificationTests(unittest.TestCase):
    def test_missing_tool_is_not_pass(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / 'board.kicad_pcb'; p.write_text('(kicad_pcb)')
            with patch('app.kicad.verification.shutil.which', return_value=None):
                r = verify_artifact(p)
            self.assertEqual(r['status'], 'NOT_RUN')
            self.assertFalse(r['manufacturing_ready'])
            self.assertEqual(len(r['artifact_sha256']), 64)

    def test_missing_artifact_rejected(self):
        with self.assertRaises(ValueError):
            verify_artifact('/nonexistent.kicad_pcb')

    def test_native_invalid_input_fails_closed(self):
        import shutil
        if not shutil.which('kicad-cli'):
            self.skipTest('KiCad not installed')
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / 'bad.kicad_pcb'; p.write_text('invalid pcb content')
            r = verify_artifact(p)
            self.assertEqual(r['status'], 'ERROR')
            self.assertFalse(r['manufacturing_ready'])
