"""Power distribution analyzer.

Calculates power budgets, thermal dissipation, battery life estimates,
and validates regulator headroom for the complete design.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from ..models.topology import Topology
from ..utils.validators import (
    validate_current_budget,
    validate_dropout_voltage,
    validate_voltage_range,
)
from ..components.database import ComponentDatabase


class PowerAnalyzer:
    """Analyze power distribution across a design topology."""

    def __init__(self) -> None:
        self.db = ComponentDatabase.get_instance()

    def analyze(self, topology: Topology) -> Dict[str, Any]:
        """Run a complete power analysis on the design.

        Returns a structured report with per-rail analysis,
        total power budget, and any violations.
        """
        report: Dict[str, Any] = {
            "rails": {},
            "total_power_mw": 0.0,
            "total_current_ma": 0.0,
            "violations": [],
            "warnings": [],
            "thermal": [],
            "battery_life": None,
        }

        for rail_name, rail in topology.power_rails.items():
            rail_report = self._analyze_rail(rail)
            report["rails"][rail_name] = rail_report
            report["total_power_mw"] += rail_report["power_mw"]
            report["total_current_ma"] += rail_report["total_load_ma"]
            report["violations"].extend(rail_report.get("violations", []))
            report["warnings"].extend(rail_report.get("warnings", []))
            if rail_report.get("thermal"):
                report["thermal"].append(rail_report["thermal"])

        return report

    def _analyze_rail(self, rail: Any) -> Dict[str, Any]:
        """Analyze a single power rail."""
        result: Dict[str, Any] = {
            "name": rail.name,
            "voltage": rail.voltage,
            "total_load_ma": rail.total_load_ma,
            "max_capacity_ma": rail.max_current_ma,
            "utilization_percent": 0.0,
            "power_mw": 0.0,
            "consumers": [],
            "violations": [],
            "warnings": [],
            "thermal": None,
        }

        # Power calculation
        result["power_mw"] = rail.voltage * rail.total_load_ma

        # Utilization
        if rail.max_current_ma > 0:
            result["utilization_percent"] = round(
                (rail.total_load_ma / rail.max_current_ma) * 100, 1
            )

        # Current budget validation
        if rail.max_current_ma > 0:
            valid, msg = validate_current_budget(
                rail.total_load_ma, rail.max_current_ma, rail.name
            )
            if not valid:
                result["violations"].append(msg)

        # Per-consumer breakdown
        for consumer in rail.consumers:
            result["consumers"].append({
                "ref_des": consumer.get("ref_des", "?"),
                "current_ma": consumer.get("current_ma", 0),
                "percentage": round(
                    consumer.get("current_ma", 0)
                    / max(rail.total_load_ma, 0.1)
                    * 100,
                    1,
                ),
            })

        # Thermal analysis for LDO regulators
        if rail.regulator_instance_id:
            thermal = self._analyze_thermal(rail)
            if thermal:
                result["thermal"] = thermal
                if thermal.get("over_temp"):
                    result["violations"].append(
                        f"{rail.name}: regulator junction temperature "
                        f"{thermal['tj_c']:.1f}°C exceeds maximum"
                    )

        # Warnings for high utilization
        if 70 < result["utilization_percent"] <= 80:
            result["warnings"].append(
                f"{rail.name}: {result['utilization_percent']}% capacity "
                f"— consider a higher-rated regulator"
            )

        return result

    def _analyze_thermal(self, rail: Any) -> Optional[Dict[str, Any]]:
        """Calculate thermal dissipation for a voltage regulator.

        Assumes the regulator has an input voltage 2V above its output
        (worst-case LDO scenario) unless more data is available.
        """
        # Estimate input voltage (assume typical LDO scenario)
        v_in_estimate = rail.voltage + 2.0  # conservative
        v_drop = v_in_estimate - rail.voltage
        power_dissipation_w = v_drop * (rail.total_load_ma / 1000.0)

        # Assume SOT-223 thermal resistance if unknown
        theta_ja = 60.0  # °C/W typical SOT-223
        t_ambient = 25.0

        tj = t_ambient + (power_dissipation_w * theta_ja)

        return {
            "v_drop": v_drop,
            "power_dissipation_mw": round(power_dissipation_w * 1000, 1),
            "theta_ja": theta_ja,
            "t_ambient_c": t_ambient,
            "tj_c": round(tj, 1),
            "over_temp": tj > 125.0,
        }

    def estimate_battery_life(
        self,
        topology: Topology,
        battery_capacity_mah: float,
        battery_voltage: float = 3.7,
        efficiency: float = 0.85,
    ) -> Dict[str, Any]:
        """Estimate battery life for a portable design.

        Args:
            topology: Design topology with power rail data.
            battery_capacity_mah: Battery capacity in milliamp-hours.
            battery_voltage: Nominal battery voltage.
            efficiency: Overall power conversion efficiency (0–1).

        Returns:
            Dict with estimated runtime in hours and days.
        """
        total_current_ma = sum(
            rail.total_load_ma for rail in topology.power_rails.values()
        )

        # Account for conversion losses
        effective_draw_ma = total_current_ma / efficiency

        if effective_draw_ma <= 0:
            return {
                "battery_capacity_mah": battery_capacity_mah,
                "total_draw_ma": 0,
                "estimated_hours": float("inf"),
                "estimated_days": float("inf"),
            }

        hours = battery_capacity_mah / effective_draw_ma
        return {
            "battery_capacity_mah": battery_capacity_mah,
            "total_draw_ma": round(effective_draw_ma, 1),
            "estimated_hours": round(hours, 1),
            "estimated_days": round(hours / 24, 1),
        }

    def validate_regulator_selection(
        self,
        regulator_id: str,
        input_voltage: float,
        output_voltage: float,
        load_current_ma: float,
    ) -> Dict[str, Any]:
        """Validate that a specific regulator can handle the requirements.

        Returns a report with pass/fail and any issues found.
        """
        comp = self.db.get(regulator_id)
        if comp is None:
            return {"valid": False, "errors": [f"Unknown regulator: {regulator_id}"]}

        errors = []
        warnings = []

        # Voltage range check
        v_in_min = comp.get("voltage_in_min", 0)
        v_in_max = comp.get("voltage_in_max", 999)
        valid, msg = validate_voltage_range(
            input_voltage, v_in_min, v_in_max, f"Input to {comp.get('mpn', regulator_id)}"
        )
        if not valid:
            errors.append(msg)

        # Current capacity
        i_max = comp.get("current_max_ma", 0)
        valid, msg = validate_current_budget(
            load_current_ma, i_max, comp.get("mpn", regulator_id)
        )
        if not valid:
            errors.append(msg)

        # Dropout check (LDOs)
        dropout = comp.get("dropout_voltage")
        if dropout is not None:
            valid, msg = validate_dropout_voltage(
                input_voltage, output_voltage, dropout, comp.get("mpn", "LDO")
            )
            if not valid:
                errors.append(msg)

        return {
            "valid": len(errors) == 0,
            "regulator": comp.get("mpn", regulator_id),
            "errors": errors,
            "warnings": warnings,
        }
