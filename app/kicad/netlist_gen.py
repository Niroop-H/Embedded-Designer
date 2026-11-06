"""KiCad Netlist (.net) Generator."""

from __future__ import annotations

import time
from typing import Any, Dict


class KiCadNetlistGenerator:
    """Generates standard KiCad S-expression netlist files."""

    @classmethod
    def generate(cls, topology: Dict[str, Any]) -> str:
        date_str = time.strftime("%Y-%m-%d %H:%M:%S")
        components = topology.get("components", [])
        nets = topology.get("nets", [])

        lines = [
            f'(export (version D)',
            f'  (design',
            f'    (source "AutonomousHardwareArchitect-AI")',
            f'    (date "{date_str}")',
            f'    (tool "AutonomousHardwareArchitect-AI Netlist Generator")',
            f'  )',
            f'  (components'
        ]

        for comp in components:
            ref = comp.get("ref", "U1")
            val = comp.get("value", "Part")
            pkg = comp.get("package", "Generic")
            lines.append(f'    (comp (ref {ref}) (value "{val}") (footprint "{pkg}")')
            lines.append(f'      (libsource (lib Device) (part "{val}")))')

        lines.append('  )')
        lines.append('  (nets')

        for idx, net in enumerate(nets):
            net_name = net.get("name", f"Net_{idx+1}")
            lines.append(f'    (net (code {idx+1}) (name "{net_name}")')
            for conn in net.get("connections", []):
                if "." in conn:
                    parts = conn.split(".")
                    lines.append(f'      (node (ref {parts[0]}) (pin {parts[1]}))')
            lines.append('    )')

        lines.append('  )')
        lines.append(')')
        return "\n".join(lines)
