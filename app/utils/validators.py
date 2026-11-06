"""Validation utilities for hardware design parameters."""

from typing import Tuple, Optional, List


def validate_voltage_range(
    voltage: float,
    rail_min: float,
    rail_max: float,
    label: str = "voltage",
) -> Tuple[bool, Optional[str]]:
    """Validate that a voltage falls within an acceptable range.

    Args:
        voltage: The voltage to validate (in volts).
        rail_min: Minimum acceptable voltage.
        rail_max: Maximum acceptable voltage.
        label: Human-readable label for error messages.

    Returns:
        Tuple of (is_valid, error_message_or_none).
    """
    if voltage < rail_min:
        return False, (
            f"{label} {voltage}V is below minimum {rail_min}V"
        )
    if voltage > rail_max:
        return False, (
            f"{label} {voltage}V exceeds maximum {rail_max}V"
        )
    return True, None


def validate_pin_count(
    requested_pins: int,
    available_pins: int,
    interface: str = "GPIO",
) -> Tuple[bool, Optional[str]]:
    """Validate that enough pins are available for the requested allocation.

    Args:
        requested_pins: Number of pins requested.
        available_pins: Number of pins available on the MCU / bus.
        interface: Name of the interface for error messages.

    Returns:
        Tuple of (is_valid, error_message_or_none).
    """
    if requested_pins > available_pins:
        return False, (
            f"Requested {requested_pins} {interface} pins but only "
            f"{available_pins} available"
        )
    return True, None


def validate_footprint(footprint: str) -> Tuple[bool, Optional[str]]:
    """Validate that a footprint identifier follows KiCad naming conventions.

    Args:
        footprint: Footprint string (e.g., "R_0402_1005Metric").

    Returns:
        Tuple of (is_valid, error_message_or_none).
    """
    if not footprint:
        return False, "Footprint string is empty"
    if len(footprint) > 128:
        return False, "Footprint string exceeds 128 characters"
    # KiCad footprints should not contain certain special characters
    forbidden = set('<>"|?*')
    bad_chars = set(footprint) & forbidden
    if bad_chars:
        return False, (
            f"Footprint contains forbidden characters: {bad_chars}"
        )
    return True, None


def validate_current_budget(
    total_draw_ma: float,
    regulator_max_ma: float,
    label: str = "power rail",
) -> Tuple[bool, Optional[str]]:
    """Validate that total current draw does not exceed regulator capacity.

    Applies a 20% safety margin by default.

    Args:
        total_draw_ma: Sum of all component current draws in milliamps.
        regulator_max_ma: Regulator maximum output current in milliamps.
        label: Name of the power rail for error messages.

    Returns:
        Tuple of (is_valid, error_message_or_none).
    """
    margin = 0.80  # 80% of max is safe operating limit
    safe_limit = regulator_max_ma * margin
    if total_draw_ma > safe_limit:
        return False, (
            f"{label}: total draw {total_draw_ma:.1f}mA exceeds safe limit "
            f"{safe_limit:.1f}mA (80% of {regulator_max_ma:.1f}mA max)"
        )
    if total_draw_ma > regulator_max_ma:
        return False, (
            f"{label}: total draw {total_draw_ma:.1f}mA exceeds absolute max "
            f"{regulator_max_ma:.1f}mA — CRITICAL"
        )
    return True, None


def validate_i2c_address_conflict(
    addresses: List[str],
) -> Tuple[bool, Optional[str]]:
    """Check for I2C address conflicts on a shared bus.

    Args:
        addresses: List of I2C addresses in hex string form (e.g., "0x68").

    Returns:
        Tuple of (is_valid, error_message_or_none).
    """
    seen: dict = {}
    for addr in addresses:
        norm = addr.strip().lower()
        if norm in seen:
            return False, (
                f"I2C address conflict: {norm} is used by multiple devices"
            )
        seen[norm] = True
    return True, None


def validate_dropout_voltage(
    v_in: float,
    v_out: float,
    dropout: float,
    label: str = "LDO",
) -> Tuple[bool, Optional[str]]:
    """Validate that input voltage provides sufficient headroom for an LDO.

    Args:
        v_in: Input voltage to the regulator.
        v_out: Required output voltage.
        dropout: Regulator dropout voltage.
        label: Regulator label for error messages.

    Returns:
        Tuple of (is_valid, error_message_or_none).
    """
    headroom = v_in - v_out
    if headroom < dropout:
        return False, (
            f"{label}: input {v_in}V → output {v_out}V gives only "
            f"{headroom:.2f}V headroom, but dropout requires {dropout}V"
        )
    return True, None
