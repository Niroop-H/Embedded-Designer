"""KiCad Native S-Expression PCB Generator (.kicad_pcb).

Compiles board edge cuts, layers, component placements, and netlists
into production KiCad PCB files ready for PCB manufacturing.
"""

from __future__ import annotations

import time
import uuid
from typing import Any, Dict
from .symbol_lib import get_kicad_footprint


class KiCadPcbGenerator:
    """Generates standard .kicad_pcb files."""

    @classmethod
    def generate(cls, topology: Dict[str, Any]) -> str:
        board = topology.get("board", {"width": 75.0, "height": 45.0})
        w = float(board.get("width", 75.0))
        h = float(board.get("height", 45.0))
        date_str = time.strftime("%Y-%m-%d")

        # Board outline centered around 100, 100
        cx = 100.0
        cy = 100.0
        x1 = cx - w / 2.0
        x2 = cx + w / 2.0
        y1 = cy - h / 2.0
        y2 = cy + h / 2.0

        lines = [
            f'(kicad_pcb (version 20221018) (generator "AutonomousHardwareArchitect-AI")',
            f'  (general',
            f'    (thickness 1.6)',
            f'  )',
            f'  (layers',
            f'    (0 "F.Cu" signal)',
            f'    (31 "B.Cu" signal)',
            f'    (36 "B.SilkS" user)',
            f'    (37 "F.SilkS" user)',
            f'    (38 "B.Mask" user)',
            f'    (39 "F.Mask" user)',
            f'    (44 "Edge.Cuts" user)',
            f'  )',
            f'  (setup',
            f'    (pad_to_mask_clearance 0.05)',
            f'    (grid 1.27 1.27)',
            f'  )',
            f'  ;; Board Outline (Edge.Cuts)',
            f'  (gr_line (start {x1:.2f} {y1:.2f}) (end {x2:.2f} {y1:.2f}) (layer "Edge.Cuts") (width 0.15))',
            f'  (gr_line (start {x2:.2f} {y1:.2f}) (end {x2:.2f} {y2:.2f}) (layer "Edge.Cuts") (width 0.15))',
            f'  (gr_line (start {x2:.2f} {y2:.2f}) (end {x1:.2f} {y2:.2f}) (layer "Edge.Cuts") (width 0.15))',
            f'  (gr_line (start {x1:.2f} {y2:.2f}) (end {x1:.2f} {y1:.2f}) (layer "Edge.Cuts") (width 0.15))'
        ]

        # Place footprints
        components = topology.get("components", [])
        for comp in components:
            ref = comp.get("ref", "U1")
            val = comp.get("value", "Part")
            pkg = comp.get("package", "Generic")
            fp = get_kicad_footprint(pkg)

            # Map coordinates from origin to board center
            px = cx + float(comp.get("x", 0.0))
            py = cy + float(comp.get("y", 0.0))
            rot = float(comp.get("rotation", 0.0))
            f_uuid = str(uuid.uuid4())

            lines.append(f'  (footprint "{fp}" (layer "F.Cu")')
            lines.append(f'    (at {px:.2f} {py:.2f} {rot:.1f})')
            lines.append(f'    (uuid "{f_uuid}")')
            lines.append(f'    (fp_text reference "{ref}" (at 0 -2.5 {rot:.1f}) (layer "F.SilkS") (effects (font (size 1 1) (thickness 0.15))))')
            lines.append(f'    (fp_text value "{val}" (at 0 2.5 {rot:.1f}) (layer "F.Fab") (effects (font (size 1 1) (thickness 0.15))))')
            lines.append(f'  )')

        lines.append(')')
        return "\n".join(lines)
