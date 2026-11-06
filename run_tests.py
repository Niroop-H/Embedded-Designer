"""Test runner using standard library."""

import sys
from tests.test_engine import (
    test_stage_1_interrogation_sequence,
    test_stage_2_generation_matrix,
    test_conflict_checker,
    test_stage_3_mutation_loop,
    test_kicad_exporters,
)

tests = [
    ("Stage 1 Interrogation Sequence", test_stage_1_interrogation_sequence),
    ("Stage 2 Generation Matrix", test_stage_2_generation_matrix),
    ("Conflict Checker (ERC)", test_conflict_checker),
    ("Stage 3 Mutation Loop", test_stage_3_mutation_loop),
    ("KiCad S-Expression Exporters", test_kicad_exporters),
]

passed = 0
failed = 0

print("=" * 60)
print("RUNNING AUTONOMOUSHARDWAEARCHITECT-AI TEST SUITE")
print("=" * 60)

for name, test_fn in tests:
    try:
        test_fn()
        print(f"  PASS: {name}")
        passed += 1
    except Exception as e:
        print(f"  FAIL: {name} — {e}")
        import traceback
        traceback.print_exc()
        failed += 1

print("=" * 60)
print(f"Results: {passed} passed, {failed} failed")
print("=" * 60)

if failed > 0:
    sys.exit(1)
