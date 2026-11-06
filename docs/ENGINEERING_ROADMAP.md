# Engineering roadmap and release boundary

The requested product is a guided embedded-system design workspace: progressive requirements discovery, explicit requirement locking, component/pin/net topology, KiCad artifacts, interactive mechanical views, simulation and firmware, and transactional conversational modifications.

## Current baseline audit

The original browser page duplicated root and frontend HTML and displayed hard-coded compliance, thermal, compiler and manufacturing results. Its independent Python backend also returned unconditional passes. These results were not engineering evidence. Preview geometry is not a routed, validated board. Existing exporters require native KiCad validation and library-backed pin/footprint mapping.

## Delivery sequence

1. Evidence integrity: remove fabricated passes, hashes and build logs; block placeholder Gerbers; test structural validation.
2. Workspace: spacious viewport, focus/fullscreen controls, coherent typography, inspectable mechanical preview, readable review status.
3. Native KiCad runner: execute ERC/DRC, retain tool version, input digest, exit status and raw results; fail closed if unavailable.
4. Guided requirements: one step at a time, review and explicit lock, durable draft persistence.
5. Verified component library: exact orderable part/package/pin mapping, manufacturer references and revision provenance; no generic module-to-QFN substitutions.
6. Canonical topology and atomic mutations: one state across every view; voltage, pin capability, regulator circuit and current checks with rollback.
7. Sandboxed compiler and ngspice workers: pinned toolchains, real artifacts/logs, circuit-specific models and regression fixtures.
8. Manufacturing pipeline: native schematic/PCB parity, routed connectivity, stackup-specific rules, complete Gerber/drill/BOM/CPL package and independent engineering review.

## Release policy

NOT_RUN, INCOMPLETE, ERROR, FAIL and stale evidence all block manufacturing release. A hash proves content identity only, not authenticity or engineering validity. Passing ERC/DRC alone does not establish functional, regulatory, environmental, or defence qualification. No defence or manufacturer qualification is currently claimed.

Each completed development is tested and committed separately. Existing Vercel deployment remains the deployment target.

## Implemented workspace milestone

- Focus mode hides both side panels; fullscreen uses the browser API.
- Guided brief captures application, size/environment, input range, continuous/peak load, runtime, processor selection, computation and interfaces; requires an explicit lock and supports unlock/export. This browser-local brief is not yet wired to the Python generator.
- 3D preview supports pointer rotation, wheel zoom, component rotations, board cutouts and resource disposal. Geometry remains illustrative, not manufacturer STEP models.
- WebGL failure no longer prevents other views from initializing.
- Local browser QA verified startup, the full brief sequence, explicit lock, reload persistence, evidence status and expanded canvas. GPU rendering could not be visually verified because the QA browser did not provide WebGL.
- `npm test` runs Python and JavaScript regressions; `npm run build` checks JavaScript syntax and duplicate entrypoint consistency (the app is served without bundling).

## Mutation integrity milestone

Mutations now operate on deep copies, reject structural errors without changing the original design, explicitly reject unsupported commands, allocate non-colliding LED/resistor references, complete the LED series/ground path, and avoid deleting U2 merely because a user mentioned a charger. The previous RP2040 test requested an LED on GPIO5 already assigned to I2C SCL; that case is now correctly rejected and regression-tested. These remain draft mutations: exact package-pin capability, voltage limits, physical placement and complete regulator circuitry are not validated yet.
