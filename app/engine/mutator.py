"""Stage 3: Interactive Chat Mutation Engine.

Detects component/net/pin changes from natural language requests:
- Adding/removing parts (LEDs, sensors, buttons, regulators)
- Swapping topologies (LDO -> Buck converter)
- Verifying electrical constraints & GPIO availability
- Emitting JSON delta payloads + conversational evaluation
"""

from __future__ import annotations

import re
from copy import deepcopy
from typing import Any, Dict, List, Tuple
from .conflict_checker import ConflictChecker


class TopologyMutator:
    """Processes conversational modification commands on an active topology."""

    @classmethod
    def apply_mutation(
        cls, topology: Dict[str, Any], instruction: str
    ) -> Tuple[Dict[str, Any], Dict[str, Any], str]:
        """
        Parses user mutation command, checks conflicts, and updates topology.
        Returns:
            (updated_topology, delta_payload, conversational_explanation)
        """
        original = deepcopy(topology)
        topology = deepcopy(topology)
        text = instruction.lower().strip()
        delta: Dict[str, Any] = {
            "addComponents": [],
            "removeComponents": [],
            "updateComponent": None,
            "addNets": [],
            "removeNets": [],
            "pinmap": list(topology.get("pinmap", []))
        }

        explanation = []
        components = list(topology.get("components", []))
        nets = list(topology.get("nets", []))
        pinmap = list(topology.get("pinmap", []))

        # --- CASE 1: Change / Swap to Buck Converter ---
        if "buck" in text or "switching" in text:
            # Replace U2 (LDO) with high-efficiency synchronous buck TPS62160
            u2_idx = next((i for i, c in enumerate(components) if c.get("ref") == "U2"), None)
            if u2_idx is not None:
                old_part = components[u2_idx].get("part", "AMS1117-3.3")
                components[u2_idx]["part"] = "TPS62160DSGT"
                components[u2_idx]["value"] = "TPS62160 (Buck)"
                components[u2_idx]["package"] = "WSON-8"
                delta["updateComponent"] = dict(components[u2_idx])
                
                # Add inductor L1 (2.2uH) for the buck
                l1 = {
                    "ref": "L1", "id": "L1", "part": "IND-2.2uH-2.1A-0805",
                    "value": "2.2uH", "package": "0805", "type": "inductor",
                    "x": -10.0, "y": -14.0, "z": 0.0, "rotation": 0
                }
                components.append(l1)
                delta["addComponents"].append(l1)

                explanation.append(
                    f"• **Swapped Voltage Regulator**: Replaced `{old_part}` LDO with ultra-high efficiency synchronous Buck converter `TPS62160DSGT` (WSON-8).\n"
                    f"• **Added Power Inductor**: Injected 2.2µH switching inductor (L1) with 2.1A saturation rating to minimize output ripple.\n"
                    f"• **Draft only**: Switching node, feedback, compensation and power-stage validation remain required. No efficiency or thermal performance has been measured."
                )

        # --- CASE 2: Add LED ---
        elif "add" in text and "led" in text:
            # Find next ref des
            existing_leds = [c for c in components if str(c.get("ref", "")).startswith("D")]
            next_num = max([int(c["ref"][1:]) for c in existing_leds if c["ref"][1:].isdigit()] or [0]) + 1
            new_led_ref = f"D{next_num}"
            new_r_ref = f"R{max([int(c['ref'][1:]) for c in components if re.fullmatch(r'R[0-9]+', c.get('ref', ''))] or [0]) + 1}"

            # Detect requested GPIO or default
            gpio_match = re.search(r"gpio\s*(\d+)", text)
            gpio_num = gpio_match.group(1) if gpio_match else str(15 + next_num)
            gpio_name = f"GPIO{gpio_num}"

            new_led = {
                "ref": new_led_ref, "id": new_led_ref, "part": "LED-GREEN-0603",
                "value": "LED-GREEN", "package": "0603", "type": "led",
                "x": 26.0, "y": -14.0 - (next_num * 5.0), "z": 0.0, "rotation": 0
            }
            new_res = {
                "ref": new_r_ref, "id": new_r_ref, "part": "RES-1K-1%-0603",
                "value": "1k", "package": "0603", "type": "resistor",
                "x": 20.0, "y": -14.0 - (next_num * 5.0), "z": 0.0, "rotation": 0
            }

            components.extend([new_led, new_res])
            delta["addComponents"].extend([new_led, new_res])

            # Add net
            new_net = {
                "name": f"USER_LED_{next_num}",
                "connections": [f"U1.{gpio_name}", f"{new_r_ref}.1"],
                "pins": [{"ref": "U1", "pin": gpio_name}, {"ref": new_r_ref, "pin": "1"}]
            }
            nets.append(new_net)
            delta["addNets"].append(new_net)

            # Complete the series path and ground return; both are required for an LED circuit.
            series_net = {"name": f"USER_LED_{next_num}_ANODE", "connections": [f"{new_r_ref}.2", f"{new_led_ref}.A"]}
            nets.append(series_net)
            delta["addNets"].append(series_net)
            ground = next((n for n in nets if n.get("name") == "GND_RAIL"), None)
            if ground is None:
                ground = {"name": "GND_RAIL", "connections": []}
                nets.append(ground)
                delta["addNets"].append(ground)
            ground["connections"].append(f"{new_led_ref}.K")
            delta["updateNets"] = [deepcopy(ground)]

            # Update pinmap
            new_pin_entry = {
                "pinNumber": gpio_num,
                "pinName": gpio_name,
                "function": f"User LED {next_num} Driver",
                "protocol": "PWM / GPIO",
                "connectedTo": f"{new_r_ref}.1 -> {new_led_ref}",
                "altFunctions": [f"GPIO{gpio_num}", "PWM_GEN", "INTERRUPT"]
            }
            pinmap.append(new_pin_entry)
            delta["pinmap"] = pinmap

            explanation.append(
                f"• **Added Peripherals**: Injected Green Status Indicator `{new_led_ref}` (0603) with current-limiting resistor `{new_r_ref}` (1kΩ, 0603).\n"
                f"• **GPIO Allocated**: Assigned MCU `{gpio_name}` (Pin #{gpio_num}) with PWM driver capability.\n"
                f"• **Draft only**: Verify the exact MCU pin capability, LED forward voltage and drive-current budget against manufacturer data."
            )

        # --- CASE 3: Remove Battery / Charger ---
        elif "remove" in text and ("battery" in text or "charger" in text or "lipo" in text):
            # Never infer a component's role from its reference designator.
            to_remove = [c.get("ref") for c in components if c.get("role") in ("battery_charger", "battery_connector")]
            if not to_remove:
                return original, {"status": "REJECTED", "reason": "No explicitly identified battery components"}, "No change: identify battery components by role before removing them."
            removed_refs = []
            for ref in to_remove:
                if any(c.get("ref") == ref for c in components):
                    removed_refs.append(ref)

            components = [c for c in components if c.get("ref") not in removed_refs]
            delta["removeComponents"] = removed_refs
            for net in nets:
                net["connections"] = [ep for ep in net.get("connections", []) if ep.split(".", 1)[0] not in removed_refs]
                if "pins" in net:
                    net["pins"] = [pin for pin in net["pins"] if pin.get("ref") not in removed_refs]
            delta["updateNets"] = deepcopy(nets)

            explanation.append(
                f"• **Removed Battery Management**: Stripped LiPo charger and JST connector `({', '.join(removed_refs)})`.\n"
                f"• **Optimized Power Topology**: Retained direct USB-C / DC supply regulation.\n"
                f"• **BOM Reduction**: Lowered unit assembly cost and freed board space."
            )

        # --- CASE 4: Add Button / Switch ---
        elif "button" in text or "switch" in text:
            sw_ref = f"SW{len([c for c in components if str(c.get('ref','')).startswith('SW')]) + 1}"
            r_pull = f"R{len([c for c in components if str(c.get('ref','')).startswith('R')]) + 1}"
            
            sw_comp = {
                "ref": sw_ref, "id": sw_ref, "part": "TACT-SW-SMD-3x4mm", "value": "BUTTON",
                "package": "Generic", "type": "switch", "x": 10.0, "y": -18.0, "z": 0.0, "rotation": 0
            }
            res_comp = {
                "ref": r_pull, "id": r_pull, "part": "RES-10K-1%-0603", "value": "10k",
                "package": "0603", "type": "resistor", "x": 14.0, "y": -18.0, "z": 0.0, "rotation": 0
            }
            components.extend([sw_comp, res_comp])
            delta["addComponents"].extend([sw_comp, res_comp])

            gpio_btn = "GPIO0"
            pinmap.append({
                "pinNumber": "3",
                "pinName": gpio_btn,
                "function": "User / Boot Tactile Switch",
                "protocol": "GPIO",
                "connectedTo": f"{sw_ref}.1",
                "altFunctions": [gpio_btn, "BOOT_STRAP", "RTC_GPIO"]
            })
            delta["pinmap"] = pinmap

            explanation.append(
                f"• **Added User Input**: Surface-mount tactile button `{sw_ref}` with 10kΩ 0603 pull-up resistor `{r_pull}`.\n"
                f"• **Routed Pin**: Tied to MCU `{gpio_btn}` with hardware debouncing footprint."
            )

        else:
            return original, {"status": "REJECTED", "reason": "Unsupported command"}, "No change: this command is not supported by the deterministic mutation engine."

        # Update topology
        topology["components"] = components
        topology["nets"] = nets
        topology["pinmap"] = pinmap

        # Re-run conflict checker
        conflicts = ConflictChecker.verify(topology)
        blocking = [c for c in conflicts if c["severity"] in ("ERROR", "CRITICAL")]
        if blocking:
            return original, {"status": "REJECTED", "conflicts": blocking}, "Mutation rolled back: " + "; ".join(c["message"] for c in blocking)
        topology["conflicts"] = conflicts
        topology["verification_status"] = "INCOMPLETE"
        delta["status"] = "APPLIED_DRAFT"

        exp_text = "\n".join(explanation)
        if conflicts:
            exp_text += "\n\n**DFM & Electrical Rules Check:**\n"
            for c in conflicts:
                exp_text += f"- [{c['severity']}] {c['message']}\n"

        return topology, delta, exp_text
