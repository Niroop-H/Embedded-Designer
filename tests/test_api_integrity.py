import unittest
from fastapi.testclient import TestClient
from app.main import app

class ApiIntegrityTests(unittest.TestCase):
    def test_unknown_design_cannot_get_fabricated_evidence(self):
        client=TestClient(app)
        for route in ['verification-report','download/cpl','download/gerber']:
            self.assertEqual(client.get('/api/project/no-design-integrity-test/'+route).status_code,409)
