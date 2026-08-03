#!/usr/bin/env python3
"""Audit test coverage for feature files created by the agent."""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent


def find_feature_files(feature_dir: Path) -> list[Path]:
    files: list[Path] = []
    for pattern in ("*.tsx", "*.ts"):
        for p in feature_dir.rglob(pattern):
            if "__tests__" in p.parts or ".test." in p.name or ".spec." in p.name:
                continue
            files.append(p)
    return sorted(files)


def find_test_files(feature_dir: Path) -> list[Path]:
    tests: list[Path] = []
    for pattern in ("*.test.tsx", "*.test.ts", "*.spec.tsx", "*.spec.ts"):
        tests.extend(feature_dir.rglob(pattern))
    return sorted(tests)


def extract_tested_component(test_path: Path) -> str:
    """Guess which component a test file covers from its name and imports."""
    name = test_path.stem.replace(".test", "").replace(".spec", "")
    return name


def audit(feature_name: str) -> None:
    src = REPO_ROOT / "src" / "pages" / feature_name
    if not src.exists():
        print(f"Feature directory not found: {src}")
        sys.exit(1)

    source_files = find_feature_files(src)
    test_files = find_test_files(src)
    tested_names = {extract_tested_component(t) for t in test_files}

    print(f"Coverage audit: {feature_name}\n")
    print(f"{'File':<50} {'Tested?'}")
    print("-" * 60)

    untested = 0
    for f in source_files:
        rel = f.relative_to(src).as_posix()
        stem = f.stem
        covered = stem in tested_names or any(stem in t.stem for t in test_files)
        mark = "✓" if covered else "✗ MISSING TEST"
        if not covered:
            untested += 1
        print(f"  {rel:<48} {mark}")

    print(f"\nSource files: {len(source_files)} | Test files: {len(test_files)} | Untested: {untested}")
    if untested > 0:
        print("\nAdd test files for untested components before Stage 5 (Verify).")
        sys.exit(1)
    else:
        print("\n✓ All source files have associated tests.")


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python test_coverage_audit.py <FeatureName>", file=sys.stderr)
        sys.exit(1)
    audit(sys.argv[1])


if __name__ == "__main__":
    main()
