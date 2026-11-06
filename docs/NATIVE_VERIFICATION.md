# Native KiCad verification

Requires KiCad 9 CLI on PATH. Reference: https://docs.kicad.org/9.0/en/cli/cli.html

```
python scripts/verify_kicad.py design.kicad_sch --output erc-evidence.json
python scripts/verify_kicad.py design.kicad_pcb --output drc-evidence.json
```

The runner snapshots the artifact and records its SHA-256 digest, tool version, native exit status, logs and JSON report. Missing tools, malformed reports, parser failures and timeouts never pass. Exit 5 means rule violations. These standalone checks do not load a complete project configuration or establish schematic/PCB parity. They are not manufacturing certification.

The checked-in baseline evidence was produced with KiCad 9.0.2 against the existing Python generator, using Industrial enclosure / USB-C 5V 500mA / ESP32-S3 / BME280, LED. The schematic returned FAIL; the PCB could not be loaded (ERROR). Fixing the exporters and validating exact library symbols/footprints is a prerequisite for release. The browser preview does not currently invoke this local runner.
