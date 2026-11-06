"""KiCad Native S-Expression Schematic Generator (.kicad_sch).

Outputs standard KiCad 6/7/8 compatible schematic files directly from
topology data, complete with component symbol instances and net wires.
"""

from __future__ import annotations

import time
import uuid
from typing import Any, Dict
from .symbol_lib import get_kicad_footprint


class KiCadSchematicGenerator:
    """Generates standard .kicad_sch S-expression files."""

    @classmethod
    def generate(cls, topology: Dict[str, Any]) -> str:
        project_name = topology.get("project", {}).get("name", "AHA_Design")
        sch_uuid = str(uuid.uuid4())
        date_str = time.strftime("%Y-%m-%d")

        lines = [
            f'(kicad_sch (version 20230121) (generator "AutonomousHardwareArchitect-AI")',
            f'  (uuid "{sch_uuid}")',
            f'  (paper "A4")',
            f'  (title_block',
            f'    (title "{project_name}")',
            f'    (date "{date_str}")',
            f'    (company "AutonomousHardwareArchitect-AI")',
            f'    (rev "1.0")',
            f'  )'
        ]

        # Place symbol instances
        components = topology.get("components", [])
        spacing_x = 35.0
        spacing_y = 30.0
        start_x = 50.0
        start_y = 50.0

        for idx, comp in enumerate(components):
            ref = comp.get("ref", f"U{idx+1}")
            val = comp.get("value", comp.get("part", "Generic"))
            pkg = comp.get("package", "Generic")
            fp = get_kicad_footprint(pkg)
            u_id = str(uuid.uuid4())

            col = idx % 4
            row = idx // 4
            pos_x = start_x + col * spacing_x
            pos_y = start_y + row * spacing_y

            lines.append(f'  (symbol (lib_id "Device:R") (at {pos_x:.2f} {pos_y:.2f} 0) (unit 1)')
            lines.append(f'    (in_bom yes) (on_board yes) (dnp no)')
            lines.append(f'    (uuid "{u_id}")')
            lines.append(f'    (property "Reference" "{ref}" (at {pos_x:.2f} {pos_y - 2.5:.2f} 0) (effects (font (size 1.27 1.27))))')
            lines.append(f'    (property "Value" "{val}" (at {pos_x:.2f} {pos_y + 2.5:.2f} 0) (effects (font (size 1.27 1.27))))')
            lines.append(f'    (property "Footprint" "{fp}" (at {pos_x:.2f} {pos_y:.2f} 0) (effects (font (size 1.27 1.27)) hide))')
            lines.append(f'  )')

        # Place Net Wires & Labels
        nets = topology.get("nets", [])
        wire_y = 180.0
        for idx, net in enumerate(nets):
            net_name = net.get("name", f"NET_{idx+1}")
            wx = 50.0 + (idx % 3) * 60.0
            wy = wire_y + (idx // 3) * 15.0

            lines.append(f'  (wire (pts (xy {wx:.2f} {wy:.2f}) (xy {wx + 20.0:.2f} {wy:.2f})))')
            lines.append(f'  (label "{net_name}" (at {wx + 10.0:.2f} {wy - 1.0:.2f} 0) (effects (font (size 1.27 1.27))))')

        lines.append(')')
        return "\n".join(lines)
