"""Stage 1: Dynamic Core Interrogation Engine.

Handles sequential discovery questions:
1. APPLICATION & FORM FACTOR (footprint, environment)
2. POWER & EFFICIENCY LIMITS (source, runtime, load requirements)
3. CORE REVENUE FOUNDATION (specific MCU or "Let AI Decide")
4. PERIPHERALS & SENSORS (interfaces: I2C, SPI, UART, PWM, etc.)
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class InterrogationState(BaseModel):
    """Tracks interrogation progress for a project session."""
    stage: int = 1  # 1 to 4, 5 means locked/ready for generation
    form_factor: Optional[str] = None
    environment: Optional[str] = None
    power_source: Optional[str] = None
    battery_runtime: Optional[str] = None
    peak_current_ma: Optional[float] = 500.0
    mcu_preference: Optional[str] = None
    peripherals: List[str] = Field(default_factory=list)
    locked: bool = False


QUESTIONS = [
    (
        "STAGE 1 — APPLICATION & FORM FACTOR:\n"
        "What is the device's physical footprint limitation and intended environment?\n"
        "(e.g., Ultra-compact wearable 25x25mm, high-vibration drone, standard DIN rail, handheld enclosure)"
    ),
    (
        "STAGE 1 — POWER & EFFICIENCY LIMITS:\n"
        "What is the primary power supply source (LiPo Battery 3.7V, USB-C 5V, DC Jack 12V)?\n"
        "What is the target runtime and expected peak load current?"
    ),
    (
        "STAGE 1 — CORE PROCESSOR SELECTION:\n"
        "Please provide a specific base microcontroller/processor (e.g., ESP32-S3, STM32F4, RP2040, MSP430)\n"
        "OR specify 'Let AI Decide' based on computation, I/O count, and wireless budget."
    ),
    (
        "STAGE 1 — PERIPHERALS & SENSORS:\n"
        "What external interfaces and sensors are required?\n"
        "(e.g., I2C BME280 IMU, SPI Flash, UART GPS, Status RGB LEDs, Buzzer, PWM Motor Drivers)"
    )
]


class Interrogator:
    """Manages the interactive requirements discovery sequence."""

    def __init__(self, state: Optional[InterrogationState] = None) -> None:
        self.state = state or InterrogationState()

    def get_current_question(self) -> Optional[str]:
        """Return prompt for current question or None if locked."""
        if self.state.locked or self.state.stage > 4:
            return None
        return QUESTIONS[self.state.stage - 1]

    def process_answer(self, user_text: str) -> Dict[str, Any]:
        """Ingests user answer, updates state, and advances stage."""
        text = user_text.strip()
        lower = text.lower()

        if self.state.stage == 1:
            self.state.form_factor = text
            self.state.environment = text
            self.state.stage = 2
            next_q = self.get_current_question()
            return {
                "advanced": True,
                "current_stage": 2,
                "message": f"Acknowledged form factor & environment: **{text}**.\n\n{next_q}",
                "locked": False
            }

        elif self.state.stage == 2:
            self.state.power_source = text
            if "lipo" in lower or "battery" in lower:
                self.state.power_source = "LiPo Battery (3.7V nominal)"
            elif "usb" in lower:
                self.state.power_source = "USB-C (5V VBUS)"
            elif "12v" in lower or "dc" in lower:
                self.state.power_source = "DC Jack (12V)"

            if "ma" in lower:
                import re
                nums = re.findall(r"(\d+)\s*ma", lower)
                if nums:
                    self.state.peak_current_ma = float(nums[0])

            self.state.stage = 3
            next_q = self.get_current_question()
            return {
                "advanced": True,
                "current_stage": 3,
                "message": f"Locked power specs: **{self.state.power_source}**.\n\n{next_q}",
                "locked": False
            }

        elif self.state.stage == 3:
            if "ai" in lower or "decide" in lower:
                self.state.mcu_preference = "AUTO_SELECT"
            elif "esp32" in lower:
                self.state.mcu_preference = "ESP32-S3-WROOM-1"
            elif "stm32" in lower:
                self.state.mcu_preference = "STM32F401RET6"
            elif "rp2040" in lower or "pico" in lower:
                self.state.mcu_preference = "RP2040"
            else:
                self.state.mcu_preference = text

            self.state.stage = 4
            next_q = self.get_current_question()
            return {
                "advanced": True,
                "current_stage": 4,
                "message": f"Selected core: **{self.state.mcu_preference}**.\n\n{next_q}",
                "locked": False
            }

        elif self.state.stage == 4:
            # Extract peripherals
            items = [item.strip() for item in text.replace(",", "\n").split("\n") if item.strip()]
            self.state.peripherals = items
            self.state.stage = 5
            self.state.locked = True

            return {
                "advanced": True,
                "current_stage": 5,
                "message": (
                    "**Requirements Locked!** Generating production-grade architecture matrix...\n"
                    "• Enforcing DFM 0603 passive guidelines\n"
                    "• Auto-injecting decoupling networks (10µF bulk + 0.1µF RF bypass)\n"
                    "• Synthesizing KiCad S-Expressions & Three.js 3D Layout Coordinates"
                ),
                "locked": True
            }

        return {
            "advanced": False,
            "current_stage": self.state.stage,
            "message": "Specifications already locked. You can now request active modifications in Stage 3.",
            "locked": True
        }
