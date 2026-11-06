"""Pin multiplexing analyzer for MCU GPIO allocation.

Validates that requested peripheral assignments are physically possible
given the MCU's pin-mux capabilities, detects conflicts, and suggests
optimal pin allocations.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

from ..components.database import ComponentDatabase


class PinMuxAnalyzer:
    """Analyze and allocate MCU pins for peripheral functions."""

    def __init__(self) -> None:
        self.db = ComponentDatabase.get_instance()

    def get_pin_capabilities(
        self, mcu_id: str
    ) -> Dict[str, Dict[str, Any]]:
        """Return the full pin-function map for an MCU.

        Returns:
            Dict mapping pin name → {"pin": int, "functions": [...]}
        """
        mcu = self.db.get(mcu_id)
        if mcu is None:
            return {}
        return mcu.get("pin_functions", {})

    def find_pins_for_function(
        self, mcu_id: str, function: str
    ) -> List[Dict[str, Any]]:
        """Find all pins on an MCU that support a given function.

        Args:
            mcu_id: Component ID of the MCU.
            function: Function name to search for (e.g., "I2C0_SDA", "SPI1_SCK").

        Returns:
            List of {"pin_name": ..., "pin_number": ..., "all_functions": [...]}.
        """
        pin_map = self.get_pin_capabilities(mcu_id)
        matches = []
        func_upper = function.upper()
        for pin_name, info in pin_map.items():
            funcs = [f.upper() for f in info.get("functions", [])]
            if any(func_upper in f for f in funcs):
                matches.append({
                    "pin_name": pin_name,
                    "pin_number": info.get("pin", 0),
                    "all_functions": info.get("functions", []),
                })
        return matches

    def allocate_pins(
        self,
        mcu_id: str,
        requested_functions: List[Dict[str, str]],
    ) -> Tuple[Dict[str, Dict[str, Any]], List[str]]:
        """Allocate MCU pins for a list of requested functions.

        Uses a greedy algorithm: assigns pins with the fewest alternative
        functions first to minimize future conflicts.

        Args:
            mcu_id: Component ID of the MCU.
            requested_functions: List of dicts with keys:
                - "function": e.g., "I2C0_SDA"
                - "label": e.g., "BME280_SDA" (for net naming)

        Returns:
            Tuple of:
                - allocation: Dict[label → {"pin_name", "pin_number", "function"}]
                - conflicts: List of error strings for unresolvable requests.
        """
        pin_map = self.get_pin_capabilities(mcu_id)
        allocated_pins: set = set()  # pin names already assigned
        allocation: Dict[str, Dict[str, Any]] = {}
        conflicts: List[str] = []

        # Build candidate lists and sort by number of candidates (ascending)
        candidates_per_request: List[Tuple[Dict[str, str], List[str]]] = []
        for req in requested_functions:
            func = req["function"]
            label = req.get("label", func)
            matching_pins = []
            func_upper = func.upper()
            for pin_name, info in pin_map.items():
                funcs = [f.upper() for f in info.get("functions", [])]
                if any(func_upper in f for f in funcs):
                    matching_pins.append(pin_name)
            candidates_per_request.append((req, matching_pins))

        # Sort: most constrained first
        candidates_per_request.sort(key=lambda x: len(x[1]))

        for req, candidates in candidates_per_request:
            func = req["function"]
            label = req.get("label", func)
            assigned = False
            for pin_name in candidates:
                if pin_name not in allocated_pins:
                    allocated_pins.add(pin_name)
                    info = pin_map[pin_name]
                    allocation[label] = {
                        "pin_name": pin_name,
                        "pin_number": info.get("pin", 0),
                        "function": func,
                    }
                    assigned = True
                    break
            if not assigned:
                conflicts.append(
                    f"Cannot allocate pin for {label} ({func}): "
                    f"all {len(candidates)} candidate pins are in use"
                )

        return allocation, conflicts

    def analyze_utilization(
        self, mcu_id: str, allocated: Dict[str, Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Analyze pin utilization after allocation.

        Returns:
            Dict with utilization statistics and available pin counts by function.
        """
        pin_map = self.get_pin_capabilities(mcu_id)
        mcu = self.db.get(mcu_id) or {}
        total_gpio = mcu.get("gpio_count", len(pin_map))
        used_pins = {v["pin_name"] for v in allocated.values()}
        free_pins = set(pin_map.keys()) - used_pins

        # Count available functions on free pins
        available_functions: Dict[str, int] = {}
        for pin_name in free_pins:
            for func in pin_map[pin_name].get("functions", []):
                available_functions[func] = available_functions.get(func, 0) + 1

        return {
            "total_gpio": total_gpio,
            "pins_used": len(used_pins),
            "pins_free": len(free_pins),
            "utilization_percent": round(
                len(used_pins) / max(total_gpio, 1) * 100, 1
            ),
            "free_pins": sorted(free_pins),
            "available_functions": available_functions,
        }

    def check_interface_availability(
        self, mcu_id: str, interface: str
    ) -> Dict[str, Any]:
        """Check how many instances of an interface are available.

        Args:
            mcu_id: MCU component ID.
            interface: Interface name (e.g., "I2C", "SPI", "UART").

        Returns:
            Dict with count and pin details per interface instance.
        """
        mcu = self.db.get(mcu_id) or {}
        interface_upper = interface.upper()

        count_key = f"{interface.lower()}_count"
        hw_count = mcu.get(count_key, 0)

        # Find all pins supporting this interface
        pin_map = mcu.get("pin_functions", {})
        interface_pins: Dict[str, List[str]] = {}
        for pin_name, info in pin_map.items():
            for func in info.get("functions", []):
                if interface_upper in func.upper():
                    instance = func.split("_")[0] if "_" in func else func
                    interface_pins.setdefault(instance, []).append(pin_name)

        return {
            "interface": interface,
            "hardware_instances": hw_count,
            "pin_groups": interface_pins,
        }
