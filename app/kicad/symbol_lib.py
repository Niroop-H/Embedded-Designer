"""KiCad Symbol Library definitions and footprint mappings."""

from __future__ import annotations

from typing import Dict, Any

FOOTPRINT_MAP = {
    "0603": "Resistor_SMD:R_0603_1608Metric",
    "0805": "Capacitor_SMD:C_0805_2012Metric",
    "1206": "Capacitor_SMD:C_1206_3216Metric",
    "SOT-23": "Package_TO_SOT_SMD:SOT-23",
    "SOT-23-5": "Package_TO_SOT_SMD:SOT-23-5",
    "SOT-223": "Package_TO_SOT_SMD:SOT-223-3_TabPin2",
    "SOIC-8": "Package_SO:SOIC-8_3.9x4.9mm_P1.27mm",
    "QFN-56": "Package_DFN_QFN:QFN-56-1EP_7x7mm_P0.4mm_EP5.6x5.6mm",
    "LQFP-64": "Package_QFP:LQFP-64_10x10mm_P0.5mm",
    "USB-C": "Connector_USB:USB_C_Receptacle_GCT_USB4085",
    "Generic": "Connector_PinHeader_2.54mm:PinHeader_1x02_P2.54mm_Vertical"
}

def get_kicad_footprint(package: str) -> str:
    return FOOTPRINT_MAP.get(package, "Package_SO:SOIC-8_3.9x4.9mm_P1.27mm")
