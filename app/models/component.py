"""Pydantic models for components and pin assignments."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from ..utils.uuid_gen import generate_uuid


class Component(BaseModel):
    """Represents a component from the database (template)."""
    id: str
    manufacturer: str = ""
    mpn: str = ""
    description: str = ""
    category: str = ""
    subcategory: str = ""
    package: str = ""
    footprint: str = ""
    pin_count: int = 0
    voltage_min: Optional[float] = None
    voltage_typ: Optional[float] = None
    voltage_max: Optional[float] = None
    current_typ_ma: Optional[float] = None
    current_max_ma: Optional[float] = None
    price_usd: float = 0.0
    interfaces: List[str] = Field(default_factory=list)
    dimensions_mm: Dict[str, float] = Field(default_factory=dict)
    pin_functions: Dict[str, Any] = Field(default_factory=dict)
    decoupling_caps: List[Dict[str, Any]] = Field(default_factory=list)
    power_pins: Dict[str, Any] = Field(default_factory=dict)
    extra: Dict[str, Any] = Field(default_factory=dict)

    @classmethod
    def from_db_record(cls, record: Dict[str, Any]) -> "Component":
        """Create a Component from a raw database JSON record.

        Known fields are mapped directly; unknown fields go into `extra`.
        """
        known_fields = cls.model_fields.keys()
        known_data = {}
        extra_data = {}
        for k, v in record.items():
            if k in known_fields:
                known_data[k] = v
            else:
                extra_data[k] = v
        known_data["extra"] = extra_data
        return cls(**known_data)


class PinAssignment(BaseModel):
    """A single pin-to-function assignment on an MCU."""
    pin_name: str             # e.g., "GPIO21"
    pin_number: int           # physical pin
    assigned_function: str    # e.g., "I2C0_SDA"
    connected_to: str = ""    # component instance id + pin label
    net_name: str = ""        # net label for schematic


class ComponentInstance(BaseModel):
    """A placed instance of a component in the design."""
    instance_id: str = Field(default_factory=generate_uuid)
    component_id: str                    # reference to Component.id
    ref_des: str = ""                    # e.g., "U1", "R3"
    value: str = ""                      # e.g., "10k", "100nF"
    position_x_mm: float = 0.0          # PCB X coordinate
    position_y_mm: float = 0.0          # PCB Y coordinate
    rotation_deg: float = 0.0           # placement rotation
    layer: str = "F.Cu"                 # front or back copper
    is_auto_injected: bool = False       # decoupling cap / regulator
    injection_reason: str = ""           # e.g., "decoupling_U1_VDD"
    pin_assignments: List[PinAssignment] = Field(default_factory=list)
    net_connections: Dict[str, str] = Field(default_factory=dict)  # pin_label -> net_name

    def assign_pin(
        self,
        pin_name: str,
        pin_number: int,
        function: str,
        connected_to: str = "",
        net_name: str = "",
    ) -> PinAssignment:
        """Assign a function to a pin on this component instance."""
        pa = PinAssignment(
            pin_name=pin_name,
            pin_number=pin_number,
            assigned_function=function,
            connected_to=connected_to,
            net_name=net_name,
        )
        self.pin_assignments.append(pa)
        if net_name:
            self.net_connections[pin_name] = net_name
        return pa
