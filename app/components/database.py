"""Component database — loads and indexes all real-world parts from JSON files.

Provides search, filtering, and recommendation capabilities across MCUs,
passives, power ICs, sensors, connectors, and modules.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

from ..models.component import Component

# Resolve the directory containing the JSON data files
_DATA_DIR = Path(__file__).parent


class ComponentDatabase:
    """In-memory component database backed by JSON files.

    On initialization, all JSON files are loaded and indexed for fast lookup
    by ID, category, subcategory, and interface.
    """

    _instance: Optional["ComponentDatabase"] = None

    def __init__(self) -> None:
        self._components: Dict[str, Dict[str, Any]] = {}
        self._by_category: Dict[str, List[str]] = {}
        self._by_subcategory: Dict[str, List[str]] = {}
        self._by_interface: Dict[str, List[str]] = {}
        self._load_all()

    # ------------------------------------------------------------------
    # Singleton accessor
    # ------------------------------------------------------------------
    @classmethod
    def get_instance(cls) -> "ComponentDatabase":
        """Return the singleton database instance (lazy-initialized)."""
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    # ------------------------------------------------------------------
    # Loading
    # ------------------------------------------------------------------
    def _load_all(self) -> None:
        """Load every JSON file in the data directory."""
        json_files = [
            "mcus.json",
            "passives.json",
            "power.json",
            "sensors.json",
            "connectors.json",
            "modules.json",
        ]
        for filename in json_files:
            filepath = _DATA_DIR / filename
            if filepath.exists():
                self._load_file(filepath)

    def _load_file(self, filepath: Path) -> None:
        """Parse a single JSON file and index its records."""
        with open(filepath, "r", encoding="utf-8") as fh:
            records = json.load(fh)
        for record in records:
            comp_id = record.get("id", "")
            if not comp_id:
                continue
            self._components[comp_id] = record
            # Index by category
            cat = record.get("category", "unknown")
            self._by_category.setdefault(cat, []).append(comp_id)
            # Index by subcategory
            subcat = record.get("subcategory", "")
            if subcat:
                self._by_subcategory.setdefault(subcat, []).append(comp_id)
            # Index by interfaces
            for iface in record.get("interfaces", []):
                self._by_interface.setdefault(iface.upper(), []).append(comp_id)

    # ------------------------------------------------------------------
    # Retrieval
    # ------------------------------------------------------------------
    def get(self, component_id: str) -> Optional[Dict[str, Any]]:
        """Look up a component by its unique ID."""
        return self._components.get(component_id)

    def get_component(self, component_id: str) -> Optional[Component]:
        """Return a typed Component model, or None."""
        raw = self.get(component_id)
        if raw is None:
            return None
        return Component.from_db_record(raw)

    def get_all(self) -> Dict[str, Dict[str, Any]]:
        """Return every component record, keyed by ID."""
        return dict(self._components)

    def list_ids(self) -> List[str]:
        """Return a list of all component IDs."""
        return list(self._components.keys())

    # ------------------------------------------------------------------
    # Filtering / search
    # ------------------------------------------------------------------
    def find_by_category(self, category: str) -> List[Dict[str, Any]]:
        """Return all components in a given category."""
        ids = self._by_category.get(category, [])
        return [self._components[i] for i in ids]

    def find_by_subcategory(self, subcategory: str) -> List[Dict[str, Any]]:
        """Return all components in a given subcategory."""
        ids = self._by_subcategory.get(subcategory, [])
        return [self._components[i] for i in ids]

    def find_by_interface(self, interface: str) -> List[Dict[str, Any]]:
        """Return all components supporting a given interface."""
        ids = self._by_interface.get(interface.upper(), [])
        return [self._components[i] for i in ids]

    def find_mcus(
        self,
        requires_wifi: Optional[bool] = None,
        requires_bluetooth: Optional[bool] = None,
        min_gpio: Optional[int] = None,
        max_price: Optional[float] = None,
    ) -> List[Dict[str, Any]]:
        """Search MCUs with optional filters."""
        results = self.find_by_category("mcu")
        if requires_wifi is not None:
            results = [r for r in results if r.get("has_wifi") == requires_wifi]
        if requires_bluetooth is not None:
            results = [
                r for r in results if r.get("has_bluetooth") == requires_bluetooth
            ]
        if min_gpio is not None:
            results = [
                r for r in results if r.get("gpio_count", 0) >= min_gpio
            ]
        if max_price is not None:
            results = [
                r for r in results if r.get("price_usd", 999) <= max_price
            ]
        return results

    def find_ldo(
        self, output_voltage: float, min_current_ma: float = 100
    ) -> List[Dict[str, Any]]:
        """Find LDO regulators matching output voltage and current requirements."""
        ldos = self.find_by_subcategory("ldo")
        results = []
        for ldo in ldos:
            v_out = ldo.get("voltage_out", 0)
            i_max = ldo.get("current_max_ma", 0)
            if abs(v_out - output_voltage) < 0.1 and i_max >= min_current_ma:
                results.append(ldo)
        return results

    def find_buck_converter(
        self,
        input_voltage: float,
        output_voltage: float,
        min_current_ma: float = 500,
    ) -> List[Dict[str, Any]]:
        """Find buck converters matching voltage/current requirements."""
        bucks = self.find_by_subcategory("buck_converter")
        results = []
        for buck in bucks:
            v_in_min = buck.get("voltage_in_min", 999)
            v_in_max = buck.get("voltage_in_max", 0)
            v_out_min = buck.get("voltage_out_min", 999)
            v_out_max = buck.get("voltage_out_max", 0)
            i_max = buck.get("current_max_ma", 0)
            if (
                v_in_min <= input_voltage <= v_in_max
                and v_out_min <= output_voltage <= v_out_max
                and i_max >= min_current_ma
            ):
                results.append(buck)
        return results

    def find_passives(
        self, subcategory: str, value: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Find passive components optionally filtered by value."""
        parts = self.find_by_subcategory(subcategory)
        if value:
            parts = [p for p in parts if p.get("value", "").lower() == value.lower()]
        return parts

    def get_decoupling_caps_for(
        self, component_id: str
    ) -> List[Dict[str, Any]]:
        """Return the recommended decoupling capacitor specs for a component."""
        comp = self.get(component_id)
        if comp is None:
            return []
        return comp.get("decoupling_caps", [])

    # ------------------------------------------------------------------
    # Recommendation engine
    # ------------------------------------------------------------------
    def recommend_mcu(
        self,
        requires_wifi: bool = False,
        requires_bluetooth: bool = False,
        min_gpio: int = 0,
        budget: str = "medium",
    ) -> Optional[Dict[str, Any]]:
        """Recommend the best-fit MCU based on requirements.

        Returns the cheapest MCU meeting all requirements, or None.
        """
        max_price = {"low": 3.0, "medium": 10.0, "high": 100.0}.get(budget, 100.0)
        candidates = self.find_mcus(
            requires_wifi=requires_wifi if requires_wifi else None,
            requires_bluetooth=requires_bluetooth if requires_bluetooth else None,
            min_gpio=min_gpio,
            max_price=max_price,
        )
        if not candidates:
            # Relax price constraint
            candidates = self.find_mcus(
                requires_wifi=requires_wifi if requires_wifi else None,
                requires_bluetooth=requires_bluetooth if requires_bluetooth else None,
                min_gpio=min_gpio,
            )
        if not candidates:
            return None
        # Sort by price ascending
        candidates.sort(key=lambda c: c.get("price_usd", 999))
        return candidates[0]

    def recommend_regulator(
        self,
        input_voltage: float,
        output_voltage: float,
        load_current_ma: float,
    ) -> Optional[Dict[str, Any]]:
        """Recommend a voltage regulator (LDO or buck) based on requirements.

        Uses an LDO if dropout is acceptable; otherwise uses a buck converter.
        """
        # Try LDO first (simpler, fewer external components)
        ldos = self.find_ldo(output_voltage, min_current_ma=load_current_ma)
        for ldo in ldos:
            dropout = ldo.get("dropout_voltage", 1.0)
            v_in_min = ldo.get("voltage_in_min", 0)
            v_in_max = ldo.get("voltage_in_max", 999)
            if (
                v_in_min <= input_voltage <= v_in_max
                and (input_voltage - output_voltage) >= dropout
            ):
                return ldo

        # Fall back to buck converter
        bucks = self.find_buck_converter(
            input_voltage, output_voltage, min_current_ma=load_current_ma
        )
        if bucks:
            bucks.sort(key=lambda b: b.get("price_usd", 999))
            return bucks[0]

        return None

    # ------------------------------------------------------------------
    # Stats
    # ------------------------------------------------------------------
    def stats(self) -> Dict[str, Any]:
        """Return summary statistics about the loaded database."""
        return {
            "total_components": len(self._components),
            "categories": {
                cat: len(ids) for cat, ids in self._by_category.items()
            },
            "subcategories": {
                sub: len(ids) for sub, ids in self._by_subcategory.items()
            },
            "interfaces": {
                iface: len(ids) for iface, ids in self._by_interface.items()
            },
        }
