"""UUID and reference designator generation utilities."""

import uuid
import time
from typing import Dict

# Global counters for reference designators, keyed by prefix
_ref_des_counters: Dict[str, int] = {}


def generate_uuid() -> str:
    """Generate a unique identifier for design elements.

    Returns a UUID4 string suitable for use as component instance IDs,
    net IDs, and project identifiers.
    """
    return str(uuid.uuid4())


def generate_ref_des(prefix: str) -> str:
    """Generate an auto-incrementing reference designator.

    Args:
        prefix: Component type prefix (e.g., "U" for ICs, "R" for resistors,
                "C" for capacitors, "L" for inductors, "J" for connectors,
                "D" for diodes/LEDs, "Y" for crystals, "F" for fuses).

    Returns:
        Reference designator string like "U1", "R5", "C12".
    """
    prefix = prefix.upper()
    if prefix not in _ref_des_counters:
        _ref_des_counters[prefix] = 0
    _ref_des_counters[prefix] += 1
    return f"{prefix}{_ref_des_counters[prefix]}"


def reset_ref_des_counters() -> None:
    """Reset all reference designator counters (use between projects)."""
    _ref_des_counters.clear()


def generate_timestamp_id() -> str:
    """Generate a time-based identifier for file naming.

    Returns:
        String like '20261106_154530_a1b2c3'.
    """
    ts = time.strftime("%Y%m%d_%H%M%S")
    short_uuid = uuid.uuid4().hex[:6]
    return f"{ts}_{short_uuid}"


# Map component categories to standard reference designator prefixes
CATEGORY_PREFIX_MAP: Dict[str, str] = {
    "mcu": "U",
    "sensor": "U",
    "module": "U",
    "adc": "U",
    "interface": "U",
    "memory": "U",
    "display": "U",
    "wireless": "U",
    "ldo": "U",
    "buck_converter": "U",
    "protection": "U",
    "capacitor": "C",
    "resistor": "R",
    "inductor": "L",
    "led": "D",
    "crystal": "Y",
    "connector": "J",
    "usb": "J",
    "wire_to_board": "J",
    "pin_header": "J",
    "power": "J",
    "memory_card": "J",
}


def get_ref_des_prefix(category: str, subcategory: str = "") -> str:
    """Determine the correct reference designator prefix for a component.

    Args:
        category: Primary component category (e.g., "passive", "power").
        subcategory: More specific classification.

    Returns:
        Single or double character prefix string.
    """
    # Check subcategory first for more specific match
    if subcategory and subcategory in CATEGORY_PREFIX_MAP:
        return CATEGORY_PREFIX_MAP[subcategory]
    if category in CATEGORY_PREFIX_MAP:
        return CATEGORY_PREFIX_MAP[category]
    return "U"  # Default to generic IC prefix
