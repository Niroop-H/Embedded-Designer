"""Evidence-aware reports. A structural check is not manufacturing certification."""
import datetime
import hashlib
import json
from .conflict_checker import ConflictChecker


class VerificationReportEngine:
    @classmethod
    def generate_report(cls, project_id, topology):
        canonical = json.dumps(topology, sort_keys=True, separators=(',', ':'), allow_nan=False)
        issues = ConflictChecker.verify(topology)
        checks = [{
            'check_id': 'STRUCTURE', 'parameter': 'Topology consistency (limited rules)',
            'status': 'FAIL' if any(i['severity'] in ('ERROR', 'CRITICAL') for i in issues) else 'INCOMPLETE',
            'measured': None, 'issues': issues,
            'requirement': 'Complete pin, voltage, geometry and datasheet evidence required',
        }]
        for code, label in [('ERC', 'KiCad electrical rules'), ('DRC', 'KiCad board rules'),
                            ('DFM', 'Fabricator constraints'), ('POWER', 'Transient simulation'),
                            ('THERMAL', 'Thermal analysis'), ('FW', 'Target firmware compilation')]:
            checks.append({'check_id': code, 'parameter': label, 'status': 'NOT_RUN',
                           'measured': None, 'requirement': 'Native tool output bound to this design revision'})
        return {
            'schema_version': 2, 'project_id': project_id,
            'timestamp_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'overall_status': 'FAIL' if checks[0]['status'] == 'FAIL' else 'INCOMPLETE',
            'manufacturing_ready': False,
            'design_sha256': hashlib.sha256(canonical.encode()).hexdigest(),
            'digest_scope': 'Canonical topology JSON; integrity digest, not a signature or certification',
            'checks': checks, 'bom_audit': topology.get('components', []),
            'pinmap_audit': topology.get('pinmap', []),
        }
