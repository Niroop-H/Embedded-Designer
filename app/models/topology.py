"""Pydantic models for topology, nets, power rails, and BOM."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from ..utils.uuid_gen import generate_uuid


class NetConnection(BaseModel):
    """Represents a single net (electrical connection) in the design."""
    net_id: str = Field(default_factory=generate_uuid)
    net_name: str                    # e.g., "+3V3", "SDA_BUS", "GND"
    net_class: str = "Default"       # "Default", "Power", "Signal"
    pins: List[Dict[str, str]] = Field(default_factory=list)
    # Each pin dict: {"instance_id": ..., "ref_des": ..., "pin": ...}

    def add_pin(self, instance_id: str, ref_des: str, pin: str) -> None:
        """Add a pin to this net."""
        self.pins.append({
            "instance_id": instance_id,
            "ref_des": ref_des,
            "pin": pin,
        })


class PowerRail(BaseModel):
    """Represents a power rail in the design."""
    rail_id: str = Field(default_factory=generate_uuid)
    name: str                        # e.g., "+3V3", "+5V", "+VIN"
    voltage: float                   # nominal voltage
    regulator_instance_id: Optional[str] = None
    regulator_ref_des: Optional[str] = None
    max_current_ma: float = 0.0      # regulator max output
    total_load_ma: float = 0.0       # sum of all consumer loads
    consumers: List[Dict[str, Any]] = Field(default_factory=list)
    # Each: {"instance_id": ..., "ref_des": ..., "current_ma": ...}

    def add_consumer(
        self, instance_id: str, ref_des: str, current_ma: float
    ) -> None:
        """Register a component as drawing from this rail."""
        self.consumers.append({
            "instance_id": instance_id,
            "ref_des": ref_des,
            "current_ma": current_ma,
        })
        self.total_load_ma += current_ma


class BOMEntry(BaseModel):
    """Bill of Materials line item."""
    ref_des: str
    quantity: int = 1
    component_id: str
    manufacturer: str = ""
    mpn: str = ""
    description: str = ""
    value: str = ""
    package: str = ""
    footprint: str = ""
    price_usd: float = 0.0
    is_auto_injected: bool = False


class Topology(BaseModel):
    """Complete design topology — the 'compiled' representation of a design."""
    topology_id: str = Field(default_factory=generate_uuid)
    project_name: str = ""
    mcu_id: Optional[str] = None
    mcu_ref_des: Optional[str] = None

    # All placed component instances
    instances: Dict[str, Dict[str, Any]] = Field(default_factory=dict)

    # Net list
    nets: Dict[str, NetConnection] = Field(default_factory=dict)

    # Power distribution
    power_rails: Dict[str, PowerRail] = Field(default_factory=dict)

    # Pin allocation map (MCU-centric)
    pinout_map: Dict[str, Any] = Field(default_factory=dict)

    # Bill of materials
    bom: List[BOMEntry] = Field(default_factory=list)

    # Design metadata
    board_width_mm: float = 50.0
    board_height_mm: float = 50.0
    layer_count: int = 2

    # Conflicts and warnings
    conflicts: List[Dict[str, Any]] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)

    def add_net(self, name: str, net_class: str = "Default") -> NetConnection:
        """Create and register a new net."""
        net = NetConnection(net_name=name, net_class=net_class)
        self.nets[name] = net
        return net

    def get_or_create_net(
        self, name: str, net_class: str = "Default"
    ) -> NetConnection:
        """Get an existing net or create a new one."""
        if name in self.nets:
            return self.nets[name]
        return self.add_net(name, net_class)

    def add_power_rail(
        self,
        name: str,
        voltage: float,
        max_current_ma: float = 0.0,
        regulator_instance_id: Optional[str] = None,
        regulator_ref_des: Optional[str] = None,
    ) -> PowerRail:
        """Create and register a power rail."""
        rail = PowerRail(
            name=name,
            voltage=voltage,
            max_current_ma=max_current_ma,
            regulator_instance_id=regulator_instance_id,
            regulator_ref_des=regulator_ref_des,
        )
        self.power_rails[name] = rail
        return rail

    def to_topology_data(self) -> Dict[str, Any]:
        """Serialize topology to the TOPOLOGY_DATA JSON format."""
        return {
            "topology_id": self.topology_id,
            "project_name": self.project_name,
            "mcu": {"id": self.mcu_id, "ref_des": self.mcu_ref_des},
            "instances": self.instances,
            "nets": {
                name: net.model_dump() for name, net in self.nets.items()
            },
            "power_rails": {
                name: rail.model_dump()
                for name, rail in self.power_rails.items()
            },
            "pinout_map": self.pinout_map,
            "bom": [entry.model_dump() for entry in self.bom],
            "board": {
                "width_mm": self.board_width_mm,
                "height_mm": self.board_height_mm,
                "layers": self.layer_count,
            },
            "conflicts": self.conflicts,
            "warnings": self.warnings,
        }
