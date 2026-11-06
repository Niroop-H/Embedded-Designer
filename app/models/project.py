"""Pydantic models for projects and design sessions."""

from __future__ import annotations

import enum
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from ..utils.uuid_gen import generate_uuid


class DesignStage(str, enum.Enum):
    """Three-stage design protocol phases."""
    INTERROGATION = "interrogation"
    GENERATION = "generation"
    MUTATION = "mutation"


class DesignRequirements(BaseModel):
    """Captured requirements from the interrogation phase."""
    application_type: Optional[str] = None
    application_description: Optional[str] = None
    power_source: Optional[str] = None            # "usb", "battery", "dc_adapter", "solar"
    input_voltage: Optional[float] = None          # volts
    battery_type: Optional[str] = None             # "lipo_3v7", "18650", "coin_cell", "aa"
    mcu_preference: Optional[str] = None           # component id
    requires_wifi: Optional[bool] = None
    requires_bluetooth: Optional[bool] = None
    requires_usb: Optional[bool] = None
    peripherals: List[str] = Field(default_factory=list)  # sensor/module ids
    interfaces_needed: List[str] = Field(default_factory=list)  # "I2C", "SPI", etc.
    gpio_count_needed: Optional[int] = None
    target_size: Optional[str] = None              # "tiny", "small", "medium", "large"
    target_cost: Optional[str] = None              # "low", "medium", "high"
    additional_notes: Optional[str] = None
    custom_voltages: List[float] = Field(default_factory=list)


class DesignSession(BaseModel):
    """State container for an active design session."""
    session_id: str = Field(default_factory=generate_uuid)
    stage: DesignStage = DesignStage.INTERROGATION
    current_question_index: int = 0
    requirements: DesignRequirements = Field(default_factory=DesignRequirements)
    answers: Dict[str, Any] = Field(default_factory=dict)
    topology_data: Optional[Dict[str, Any]] = None
    pinout_map: Optional[Dict[str, Any]] = None
    bom: Optional[List[Dict[str, Any]]] = None
    generated_files: Dict[str, str] = Field(default_factory=dict)  # filename -> path
    mutation_history: List[Dict[str, Any]] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    def advance_stage(self) -> None:
        """Move the session to the next stage."""
        if self.stage == DesignStage.INTERROGATION:
            self.stage = DesignStage.GENERATION
        elif self.stage == DesignStage.GENERATION:
            self.stage = DesignStage.MUTATION
        self.updated_at = datetime.utcnow()


class Project(BaseModel):
    """Top-level project container."""
    project_id: str = Field(default_factory=generate_uuid)
    name: str = "Untitled Hardware Project"
    description: str = ""
    sessions: Dict[str, DesignSession] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    def create_session(self) -> DesignSession:
        """Create and register a new design session."""
        session = DesignSession()
        self.sessions[session.session_id] = session
        self.updated_at = datetime.utcnow()
        return session

    def get_session(self, session_id: str) -> Optional[DesignSession]:
        """Retrieve a session by ID."""
        return self.sessions.get(session_id)
