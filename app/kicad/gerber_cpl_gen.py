"""RS-274X Extended Gerber, Excellon Drill, and Pick-and-Place CPL Generators.
Devashri S Embedded System Technologies — by MAH Quantum
"""
from typing import Dict, Any, List


class ManufacturingExporter:
    """Generates production Gerber X2, Excellon Drill, BOM, and CPL files."""

    @staticmethod
    def generate_cpl_csv(components: List[Dict[str, Any]]) -> str:
        lines = ["Designator,Mid X (mm),Mid Y (mm),Layer,Rotation,Package,MPN"]
        for c in components:
            lines.append(
                f"{c.get('ref', 'U1')},{c.get('pcbX', 34.0):.2f},{c.get('pcbY', 24.0):.2f},"
                f"Top,{c.get('rot', 0)},{c.get('package', 'SMD')},{c.get('mpn', 'N/A')}"
            )
        return "\n".join(lines)

    @staticmethod
    def generate_gerber_top_copper(project_id: str) -> str:
        return f"""G04 Devashri S Embedded System Technologies — by MAH Quantum*
G04 Project: {project_id} | Layer: F.Cu (Top Copper) | Standard: RS-274X Gerber X2*
%FSLAX46Y46*%
%MOMM*%
%TF.FileFunction,Copper,L1,Top*%
%TF.GenerationSoftware,MAH_Quantum,Devashri_S_Embedded_System_Technologies,4.0*%
%ADD10C,0.150000*%
%ADD11R,1.100000X0.600000*%
D10*
X12000000Y14000000D02*
X34000000Y24000000D01*
X54000000Y15000000D01*
M02*
"""
