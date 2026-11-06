import unittest
from app.engine.verification_report import VerificationReportEngine as Reports
from app.engine.conflict_checker import ConflictChecker

class VerificationTests(unittest.TestCase):
    def test_empty_never_passes(self):
        report = Reports.generate_report('p', {})
        self.assertFalse(report['manufacturing_ready'])
        self.assertEqual(report['overall_status'], 'INCOMPLETE')
        self.assertTrue(all(c['status'] != 'PASS' for c in report['checks']))

    def test_digest_is_content_bound(self):
        a = Reports.generate_report('p', {'components': []})
        b = Reports.generate_report('p', {'components': []})
        c = Reports.generate_report('p', {'components': [{'ref': 'U1'}]})
        self.assertEqual(a['design_sha256'], b['design_sha256'])
        self.assertNotEqual(a['design_sha256'], c['design_sha256'])

    def test_unknown_and_shorted_endpoints(self):
        top = {'components': [{'ref': 'U1'}], 'nets': [
            {'name': 'a', 'connections': ['U1.1', 'U9.1']},
            {'name': 'b', 'connections': ['U1.1']}]}
        codes = {c['code'] for c in ConflictChecker.verify(top)}
        self.assertIn('ERC_PIN_MULTINET', codes)
        self.assertIn('ERC_UNKNOWN_ENDPOINT', codes)
        self.assertEqual(Reports.generate_report('p', top)['overall_status'], 'FAIL')

    def test_resistors_are_not_decoupling(self):
        top = {'components': [{'ref': 'U1', 'type': 'ic'}, {'ref': 'R1', 'type': 'resistor', 'package': '0603'}]}
        self.assertIn('ERC_DECOUPLING_DEFICIT', {c['code'] for c in ConflictChecker.verify(top)})
