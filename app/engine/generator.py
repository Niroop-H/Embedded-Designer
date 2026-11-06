"""Stage 2: Multi-Dimensional Generation Matrix.

Synthesizes:
1. Electrical schematic topology & netlists
2. 3D spatial coordinates & physical arrangement
3. Pinout mapping & multiplexing assignments
4. Decoupling capacitors (0.1uF + 10uF pairs)
5. Power topology regulation & transient simulation specs
"""

from __future__ import annotations

import math
import uuid
from typing import Any, Dict, List
from .interrogator import InterrogationState
from .conflict_checker import ConflictChecker


class DesignGenerator:
    """Generates the full multi-dimensional embedded hardware architecture."""

    @classmethod
    def generate(cls, state: InterrogationState) -> Dict[str, Any]:
        proj_id = str(uuid.uuid4())
        mcu = cls._resolve_mcu(state)

        components = []
        nets = []
        pinmap = []

        # 1. Base MCU Placement
        mcu_comp = {
            "ref": "U1",
            "id": "U1",
            "part": mcu["part"],
            "value": mcu["part"],
            "package": mcu["package"],
            "type": "ic",
            "x": 0.0,
            "y": 0.0,
            "z": 0.0,
            "rotation": 0
        }
        components.append(mcu_comp)

        # 2. Power Regulation Topology
        power_source = state.power_source or "USB-C (5V VBUS)"
        if "LiPo" in power_source or "Battery" in power_source:
            # Charger + LDO
            components.append({
                "ref": "U2", "id": "U2", "part": "MCP73831T-2ACI/OT", "value": "MCP73831",
                "package": "SOT-23-5", "type": "ic", "x": -26.0, "y": -12.0, "z": 0.0, "rotation": 0
            })
            components.append({
                "ref": "U3", "id": "U3", "part": "AP2112K-3.3TRG1", "value": "AP2112K-3.3",
                "package": "SOT-23-5", "type": "ic", "x": -14.0, "y": -12.0, "z": 0.0, "rotation": 0
            })
            components.append({
                "ref": "J2", "id": "J2", "part": "JST-PH-2P", "value": "BATT_JST",
                "package": "Generic", "type": "connector", "x": -32.0, "y": 8.0, "z": 0.0, "rotation": 90
            })
            v_reg_out = "U3.VOUT"
        else:
            # Standard USB-C + 3.3V Low-Noise LDO (or Buck)
            components.append({
                "ref": "U2", "id": "U2", "part": "AMS1117-3.3", "value": "AMS1117-3.3",
                "package": "SOT-223", "type": "ic", "x": -18.0, "y": -10.0, "z": 0.0, "rotation": 0
            })
            v_reg_out = "U2.VOUT"

        # 3. Perimeter Connector (USB-C strictly on edge)
        components.append({
            "ref": "J1", "id": "J1", "part": "USB-C-16P", "value": "USB-C-16P",
            "package": "USB-C", "type": "connector", "x": -34.0, "y": -10.0, "z": 0.0, "rotation": 270
        })

        # 4. Mandatory Decoupling Networks (0.1uF 0603 + 10uF 0805 DFM pairs)
        # Power rail bulk & bypass
        components.append({
            "ref": "C1", "id": "C1", "part": "CAP-CER-10uF-16V-0805", "value": "10uF",
            "package": "0805", "type": "capacitor", "x": -24.0, "y": -10.0, "z": 0.0, "rotation": 0
        })
        components.append({
            "ref": "C2", "id": "C2", "part": "CAP-CER-0.1uF-50V-0603", "value": "0.1uF",
            "package": "0603", "type": "capacitor", "x": -12.0, "y": -10.0, "z": 0.0, "rotation": 0
        })
        # MCU dedicated decoupling
        components.append({
            "ref": "C3", "id": "C3", "part": "CAP-CER-10uF-10V-0805", "value": "10uF",
            "package": "0805", "type": "capacitor", "x": -6.0, "y": 6.0, "z": 0.0, "rotation": 0
        })
        components.append({
            "ref": "C4", "id": "C4", "part": "CAP-CER-0.1uF-50V-0603", "value": "0.1uF",
            "package": "0603", "type": "capacitor", "x": -6.0, "y": 9.0, "z": 0.0, "rotation": 0
        })

        # 5. Status Indicators & User Peripherals
        components.append({
            "ref": "D1", "id": "D1", "part": "LED-BLUE-0603", "value": "LED-BLUE",
            "package": "0603", "type": "led", "x": 26.0, "y": -14.0, "z": 0.0, "rotation": 0
        })
        components.append({
            "ref": "R1", "id": "R1", "part": "RES-1K-1%-0603", "value": "1k",
            "package": "0603", "type": "resistor", "x": 20.0, "y": -14.0, "z": 0.0, "rotation": 0
        })

        # 6. Environmental / Motion Sensors if requested or default
        has_sensors = any("sensor" in p.lower() or "imu" in p.lower() or "bme" in p.lower() for p in state.peripherals) or True
        if has_sensors:
            components.append({
                "ref": "U4", "id": "U4", "part": "BME280", "value": "BME280",
                "package": "Generic", "type": "sensor", "x": 20.0, "y": 10.0, "z": 0.0, "rotation": 0
            })
            # I2C Pullups (4.7k 0603)
            components.append({
                "ref": "R2", "id": "R2", "part": "RES-4.7K-1%-0603", "value": "4.7k",
                "package": "0603", "type": "resistor", "x": 14.0, "y": 14.0, "z": 0.0, "rotation": 0
            })
            components.append({
                "ref": "R3", "id": "R3", "part": "RES-4.7K-1%-0603", "value": "4.7k",
                "package": "0603", "type": "resistor", "x": 17.0, "y": 14.0, "z": 0.0, "rotation": 0
            })
            # Sensor local decoupling
            components.append({
                "ref": "C5", "id": "C5", "part": "CAP-CER-0.1uF-50V-0603", "value": "0.1uF",
                "package": "0603", "type": "capacitor", "x": 24.0, "y": 14.0, "z": 0.0, "rotation": 0
            })

        # 7. Synthesize Netlist Connections
        nets.append({
            "name": "5V_VBUS",
            "connections": ["J1.VBUS", "U2.VIN", "C1.1"],
            "pins": [{"ref": "J1", "pin": "VBUS"}, {"ref": "U2", "pin": "VIN"}, {"ref": "C1", "pin": "1"}]
        })
        nets.append({
            "name": "3V3_RAIL",
            "connections": [v_reg_out, "U1.3V3", "C2.1", "C3.1", "C4.1", "U4.VDD", "R2.1", "R3.1", "C5.1"],
            "pins": [{"ref": "U1", "pin": "3V3"}, {"ref": "C2", "pin": "1"}, {"ref": "C3", "pin": "1"}, {"ref": "U4", "pin": "VDD"}]
        })
        nets.append({
            "name": "GND_RAIL",
            "connections": ["J1.GND", "U2.GND", "U1.GND", "C1.2", "C2.2", "C3.2", "C4.2", "C5.2", "U4.GND", "D1.K"],
            "pins": [{"ref": "J1", "pin": "GND"}, {"ref": "U1", "pin": "GND"}, {"ref": "U4", "pin": "GND"}]
        })
        nets.append({
            "name": "I2C_SDA",
            "connections": [f"U1.{mcu['sda_pin']}", "U4.SDA", "R2.2"],
            "pins": [{"ref": "U1", "pin": mcu["sda_pin"]}, {"ref": "U4", "pin": "SDA"}, {"ref": "R2", "pin": "2"}]
        })
        nets.append({
            "name": "I2C_SCL",
            "connections": [f"U1.{mcu['scl_pin']}", "U4.SCL", "R3.2"],
            "pins": [{"ref": "U1", "pin": mcu["scl_pin"]}, {"ref": "U4", "pin": "SCL"}, {"ref": "R3", "pin": "2"}]
        })
        nets.append({
            "name": "STATUS_LED",
            "connections": [f"U1.{mcu['led_pin']}", "R1.1"],
            "pins": [{"ref": "U1", "pin": mcu["led_pin"]}, {"ref": "R1", "pin": "1"}]
        })
        nets.append({
            "name": "LED_ANODE",
            "connections": ["R1.2", "D1.A"],
            "pins": [{"ref": "R1", "pin": "2"}, {"ref": "D1", "pin": "A"}]
        })

        # 8. MCU Pinout Mapping with Multiplexing options
        pinmap = [
            {
                "pinNumber": mcu["sda_pin_num"],
                "pinName": mcu["sda_pin"],
                "function": "I2C0 SDA (Data)",
                "protocol": "I2C",
                "connectedTo": "U4.SDA (BME280)",
                "altFunctions": ["I2C0_SDA", "GPIO" + str(mcu["sda_pin_num"]), "ADC2_CH1", "PWM_CH1"]
            },
            {
                "pinNumber": mcu["scl_pin_num"],
                "pinName": mcu["scl_pin"],
                "function": "I2C0 SCL (Clock)",
                "protocol": "I2C",
                "connectedTo": "U4.SCL (BME280)",
                "altFunctions": ["I2C0_SCL", "GPIO" + str(mcu["scl_pin_num"]), "ADC2_CH2", "PWM_CH2"]
            },
            {
                "pinNumber": mcu["led_pin_num"],
                "pinName": mcu["led_pin"],
                "function": "Heartbeat LED PWM Driver",
                "protocol": "PWM",
                "connectedTo": "R1.1 -> D1 (BLUE)",
                "altFunctions": ["LEDC_HS_CH0", "GPIO" + str(mcu["led_pin_num"]), "SPI_CS1", "TOUCH0"]
            },
            {
                "pinNumber": "1",
                "pinName": "3V3",
                "function": "Main Digital Supply (3.3V)",
                "protocol": "Power",
                "connectedTo": "3V3_RAIL (+3.3V Regulated)",
                "altFunctions": ["VDD", "VCC"]
            },
            {
                "pinNumber": "2",
                "pinName": "GND",
                "function": "Ground Return Plane",
                "protocol": "Power",
                "connectedTo": "GND_RAIL (Plane)",
                "altFunctions": ["VSS", "GND"]
            }
        ]

        # 9. Virtual Simulation Suite Parameters
        simulation_suite = {
            "test_points": ["U2.VIN", v_reg_out, f"U1.{mcu['led_pin']}", "U4.SDA"],
            "max_load_test_mA": state.peak_current_ma or 500.0,
            "transient_analysis": {
                "step_us": 1.0,
                "duration_ms": 10.0,
                "inrush_current_limit_mA": 800.0
            }
        }

        # Build final unified topology dictionary
        data = {
            "project_metadata": {
                "id": proj_id,
                "project_name": f"{mcu['part']} Smart System",
                "base_mcu": mcu["part"],
                "environment": state.environment or "General Commercial"
            },
            "project": {
                "name": f"{mcu['part']} Smart System",
                "mcu": mcu["part"]
            },
            "board": {
                "width": 75.0,
                "height": 45.0,
                "layers": 2
            },
            "components": components,
            "nets": nets,
            "pinmap": pinmap,
            "simulation": simulation_suite
        }

        # Run ERC verification
        data["conflicts"] = ConflictChecker.verify(data)
        return data

    @classmethod
    def _resolve_mcu(cls, state: InterrogationState) -> Dict[str, Any]:
        pref = (state.mcu_preference or "").lower()
        if "stm32" in pref:
            return {
                "part": "STM32F401RET6",
                "package": "LQFP-64",
                "sda_pin": "PB9", "sda_pin_num": "58",
                "scl_pin": "PB8", "scl_pin_num": "57",
                "led_pin": "PA5", "led_pin_num": "21"
            }
        elif "rp2040" in pref:
            return {
                "part": "RP2040",
                "package": "QFN-56",
                "sda_pin": "GPIO4", "sda_pin_num": "6",
                "scl_pin": "GPIO5", "scl_pin_num": "7",
                "led_pin": "GPIO25", "led_pin_num": "25"
            }
        else:
            # Default production high-performance wireless SoC
            return {
                "part": "ESP32-S3-WROOM-1",
                "package": "QFN-56",
                "sda_pin": "GPIO8", "sda_pin_num": "11",
                "scl_pin": "GPIO9", "scl_pin_num": "12",
                "led_pin": "GPIO10", "led_pin_num": "13"
            }
