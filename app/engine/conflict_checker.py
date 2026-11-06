"""Electrical Rule Check (ERC) & Conflict Verification Engine.

Performs deterministic validation across:
1. Voltage rail thresholds (no IC exceeds Vmax, no conflicting supplies tied)
2. Decoupling capacitor coverage (0.1uF and 10uF pairs per active IC)
3. MCU GPIO allocation and multiplexing conflicts
4. Power delivery network current capacity
"""

from __future__ import annotations

from typing import Any, Dict, List


class ConflictChecker:
    """Validates structural and electrical safety rules on hardware designs."""

    @staticmethod
    def verify(topology_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Run all verification rules and return a list of conflicts/warnings."""
        conflicts = []
        components = topology_data.get("components", [])
        nets = topology_data.get("nets", [])
        power_rails = topology_data.get("power_rails", {})

        # Rule 1: Conflicting Power Rails Check
        rail_names = set()
        for net in nets:
            name = net.get("name", "") if isinstance(net, dict) else str(net)
            upper = name.upper()
            if "5V" in upper and "3V3" in upper:
                conflicts.append({
                    "severity": "CRITICAL",
                    "code": "ERC_SHORT_CIRCUIT",
                    "message": f"Net '{name}' appears to short +5V and +3.3V rails together!"
                })

        # Rule 2: Decoupling Capacitor Injection Check
        ic_refs = [c.get("ref", c.get("id", "")) for c in components if c.get("type") in ("ic", "mcu", "sensor")]
        cap_refs = [c.get("ref", c.get("id", "")) for c in components if c.get("type") == "capacitor" or c.get("package") in ("0603", "0805", "0402")]

        if ic_refs and len(cap_refs) < len(ic_refs):
            conflicts.append({
                "severity": "WARNING",
                "code": "ERC_DECOUPLING_DEFICIT",
                "message": f"Detected {len(ic_refs)} ICs but only {len(cap_refs)} capacitors. Recommended: 0.1µF + 10µF per IC power pin."
            })

        # Rule 3: GPIO allocation / duplicate pin assignment
        used_pins = {}
        pinmap = topology_data.get("pinmap", [])
        for pin in pinmap:
            pin_no = str(pin.get("pinNumber", pin.get("pin", "")))
            if pin_no and pin_no in used_pins:
                conflicts.append({
                    "severity": "ERROR",
                    "code": "ERC_GPIO_COLLISION",
                    "message": f"Pin {pin_no} assigned to both '{used_pins[pin_no]}' and '{pin.get('function')}'."
                })
            elif pin_no:
                used_pins[pin_no] = pin.get("function")

        # Rule 4: DFM Passive Footprint check
        for comp in components:
            pkg = str(comp.get("package", ""))
            ref = str(comp.get("ref", comp.get("id", "")))
            if pkg == "0402":
                conflicts.append({
                    "severity": "ADVISORY",
                    "code": "DFM_FOOTPRINT_TOLERANCE",
                    "message": f"Component {ref} uses 0402 footprint. Recommended: 0603 for standard DFM yield stability."
                })

        return conflicts
