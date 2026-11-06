"""Core Design Engine for AutonomousHardwareArchitect-AI.

Orchestrates:
- Stage 1: Natural Language Interrogation & Parameter Locking
- Stage 2: Parallel Multi-Dimensional Design Generation
- Stage 3: Live Session Chat Modifications

Outputs markdown with:
[DIALOGUE]
[PINOUT_MAP]
[TOPOLOGY_DATA]
"""

from __future__ import annotations

import json
from typing import Any, Dict, Optional

from .interrogator import Interrogator, InterrogationState
from .generator import DesignGenerator
from .mutator import TopologyMutator


class DesignSession:
    """Represents a live project session with persistent state."""

    def __init__(self, project_id: str) -> None:
        self.project_id = project_id
        self.interrogator = Interrogator()
        self.topology: Optional[Dict[str, Any]] = None
        self.is_generated = False


class DesignEngine:
    """Singleton engine managing active sessions and protocol dispatch."""

    _sessions: Dict[str, DesignSession] = {}

    @classmethod
    def get_or_create_session(cls, project_id: str) -> DesignSession:
        if project_id not in cls._sessions:
            cls._sessions[project_id] = DesignSession(project_id)
        return cls._sessions[project_id]

    @classmethod
    def handle_message(cls, project_id: str, message: str) -> Dict[str, Any]:
        session = cls.get_or_create_session(project_id)
        text = message.strip()

        # If user explicitly asks to restart or start fresh
        if "restart" in text.lower() or "reset" in text.lower():
            session.interrogator = Interrogator()
            session.topology = None
            session.is_generated = False
            q1 = session.interrogator.get_current_question()
            return {
                "project_id": project_id,
                "response": (
                    f"[DIALOGUE]\n"
                    f"Session reset. Welcome to **AutonomousHardwareArchitect-AI**.\n\n"
                    f"{q1}"
                ),
                "is_delta": False
            }

        # Stage 1: Interrogation in progress
        if not session.interrogator.state.locked:
            res = session.interrogator.process_answer(text)
            
            # If not yet locked, return the next sequential question
            if not res["locked"]:
                return {
                    "project_id": project_id,
                    "response": f"[DIALOGUE]\n{res['message']}",
                    "is_delta": False
                }

            # Requirements just got locked -> Trigger Stage 2 generation!
            session.topology = DesignGenerator.generate(session.interrogator.state)
            session.is_generated = True

            dialogue = (
                f"**System Architecture Compilation Complete!**\n\n"
                f"{res['message']}\n\n"
                f"• Selected Core: `{session.topology['project']['mcu']}`\n"
                f"• Decoupling: Injected 10µF and 0.1µF pairs across all power domains\n"
                f"• Mechanical: Positioned high-retention USB-C port on strict board perimeter\n"
                f"• DFM Yield: 0603 passive components prioritized for high production yield\n"
                f"• Next: You may now issue conversational modifications in the **Active Mutation Loop** (e.g., 'Change LDO to Buck', 'Add LED on GPIO12')."
            )

            pinout_table = cls._format_pinout_markdown(session.topology.get("pinmap", []))
            topology_json = json.dumps(session.topology, indent=2)

            full_response = (
                f"[DIALOGUE]\n{dialogue}\n\n"
                f"[PINOUT_MAP]\n{pinout_table}\n\n"
                f"[TOPOLOGY_DATA]\n```json\n{topology_json}\n```"
            )

            return {
                "project_id": project_id,
                "project_name": session.topology.get("project", {}).get("name", "Embedded Design"),
                "response": full_response,
                "topology": session.topology,
                "pinmap": session.topology.get("pinmap", []),
                "is_delta": False
            }

        # Stage 3: Active Mutation Loop
        else:
            updated_topology, delta, explanation = TopologyMutator.apply_mutation(
                session.topology, text
            )
            session.topology = updated_topology

            pinout_table = cls._format_pinout_markdown(session.topology.get("pinmap", []))
            delta_json = json.dumps(delta, indent=2)

            full_response = (
                f"[DIALOGUE]\n"
                f"**Mutation {delta.get('status', 'REVIEW')}:**\n{explanation}\n\n"
                f"[PINOUT_MAP]\n{pinout_table}\n\n"
                f"[TOPOLOGY_DATA]\n```json\n{delta_json}\n```"
            )

            return {
                "project_id": project_id,
                "project_name": session.topology.get("project", {}).get("name", "Embedded Design"),
                "response": full_response,
                "topology": delta,
                "pinmap": session.topology.get("pinmap", []),
                "is_delta": True
            }

    @staticmethod
    def _format_pinout_markdown(pinmap: list) -> str:
        lines = [
            "| Pin # | Name | Function | Protocol | Connected To |",
            "| :--- | :--- | :--- | :--- | :--- |"
        ]
        for p in pinmap:
            num = p.get("pinNumber", p.get("pin", "-"))
            name = p.get("pinName", p.get("name", "-"))
            fn = p.get("function", "-")
            proto = p.get("protocol", "GPIO")
            conn = p.get("connectedTo", p.get("net", "-"))
            lines.append(f"| {num} | {name} | {fn} | {proto} | {conn} |")
        return "\n".join(lines)
