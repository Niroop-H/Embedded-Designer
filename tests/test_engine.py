"""Unit and integration tests for AutonomousHardwareArchitect-AI engine."""

from app.engine.interrogator import Interrogator
from app.engine.generator import DesignGenerator
from app.engine.mutator import TopologyMutator
from app.engine.conflict_checker import ConflictChecker
from app.engine.design_engine import DesignEngine
from app.kicad.schematic_gen import KiCadSchematicGenerator
from app.kicad.pcb_gen import KiCadPcbGenerator


def test_stage_1_interrogation_sequence():
    """Verify progressive 4-step interrogation."""
    interrogator = Interrogator()
    assert interrogator.state.stage == 1

    # Step 1: Form factor
    res1 = interrogator.process_answer("Wearable 30x30mm outdoor watch")
    assert res1["current_stage"] == 2
    assert not res1["locked"]

    # Step 2: Power source
    res2 = interrogator.process_answer("LiPo Battery 3.7V, 300mA peak")
    assert res2["current_stage"] == 3
    assert not res2["locked"]

    # Step 3: MCU
    res3 = interrogator.process_answer("ESP32-S3")
    assert res3["current_stage"] == 4
    assert not res3["locked"]

    # Step 4: Peripherals -> Locks!
    res4 = interrogator.process_answer("BME280 IMU, Status LED")
    assert res4["current_stage"] == 5
    assert res4["locked"]


def test_stage_2_generation_matrix():
    """Verify Stage 2 multi-dimensional generation."""
    interrogator = Interrogator()
    interrogator.process_answer("Industrial Enclosure")
    interrogator.process_answer("USB-C 5V, 500mA")
    interrogator.process_answer("ESP32-S3")
    interrogator.process_answer("BME280 sensor, status LED")

    topology = DesignGenerator.generate(interrogator.state)
    assert "components" in topology
    assert "nets" in topology
    assert "pinmap" in topology
    assert "simulation" in topology

    # Verify decoupling capacitors auto-injected
    caps = [c for c in topology["components"] if c.get("type") == "capacitor"]
    assert len(caps) >= 2  # At least bulk + bypass

    # Verify USB-C connector on edge
    connectors = [c for c in topology["components"] if c.get("type") == "connector"]
    assert len(connectors) >= 1

    # Verify pinout map populated
    assert len(topology["pinmap"]) > 0


def test_conflict_checker():
    """Verify conflict checker flags electrical issues."""
    safe_topology = {
        "components": [
            {"ref": "U1", "type": "ic", "package": "QFN-56"},
            {"ref": "C1", "type": "capacitor", "package": "0603"},
            {"ref": "C2", "type": "capacitor", "package": "0805"}
        ],
        "nets": [{"name": "3V3_RAIL"}],
        "pinmap": [{"pinNumber": "1", "function": "VCC"}]
    }
    conflicts = ConflictChecker.verify(safe_topology)
    assert len([c for c in conflicts if c["severity"] == "CRITICAL"]) == 0

    # Test short circuit detection
    bad_topology = {
        "components": [],
        "nets": [{"name": "SHORT_5V_3V3_RAIL"}],
        "pinmap": []
    }
    bad_conflicts = ConflictChecker.verify(bad_topology)
    assert any(c["code"] == "ERC_SHORT_CIRCUIT" for c in bad_conflicts)


def test_stage_3_mutation_loop():
    """Verify live mutations update topology and produce valid deltas."""
    interrogator = Interrogator()
    interrogator.process_answer("Handheld")
    interrogator.process_answer("USB-C 5V")
    interrogator.process_answer("RP2040")
    interrogator.process_answer("LED")

    topology = DesignGenerator.generate(interrogator.state)

    # Mutation 1: Change to buck converter
    top2, delta1, exp1 = TopologyMutator.apply_mutation(topology, "Change LDO to high-efficiency buck converter")
    assert any("TPS62160" in str(c.get("part")) for c in top2["components"])
    assert "TPS62160" in exp1

    # Mutation 2: Add LED on GPIO5
    top3, delta2, exp2 = TopologyMutator.apply_mutation(top2, "Add another status LED on GPIO5")
    # RP2040 GPIO5 is already the I2C clock: a valid engine must reject it.
    assert delta2["status"] == "REJECTED"
    assert top3 == top2
    top4, delta3, _ = TopologyMutator.apply_mutation(top2, "Add another status LED on GPIO12")
    assert delta3["status"] == "APPLIED_DRAFT"
    assert len([c for c in top4["components"] if c.get("type") == "led"]) >= 2


def test_kicad_exporters():
    """Verify KiCad schematic and PCB generator S-expressions."""
    interrogator = Interrogator()
    interrogator.process_answer("Enclosure")
    interrogator.process_answer("USB-C")
    interrogator.process_answer("STM32F4")
    interrogator.process_answer("LED")

    topology = DesignGenerator.generate(interrogator.state)

    sch_str = KiCadSchematicGenerator.generate(topology)
    assert "(kicad_sch" in sch_str
    assert "(symbol" in sch_str

    pcb_str = KiCadPcbGenerator.generate(topology)
    assert "(kicad_pcb" in pcb_str
    assert "(footprint" in pcb_str
    assert "Edge.Cuts" in pcb_str
