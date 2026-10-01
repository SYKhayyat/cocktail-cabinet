#!/usr/bin/env python3
"""Fail on dead code that is cheap to reintroduce by accident.

Two classes of debt caused the cleanup this guards against:

- CSS class rules whose selector is never referenced from markup or JS.
  ``.score-box``/``.lives-box`` outlived the markup they styled, and a
  duplicated ``.chat-message.you`` rule sat unnoticed for several passes.
- Helpers exported from ``src/engine.js`` that nothing imports, such as
  the never-called ``randomItem``, ``drawPanel``, and ``stopGame``.

This is intentionally a small grep-style check rather than a full linter:
it runs with no dependencies and matches the framework-free, no-build
nature of the project. It is conservative -- class names are matched as
whole words anywhere in the markup or source, so a dynamically composed
class still counts as used.
"""

from __future__ import annotations

import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE_DIRS = ("src",)
STYLE_FILES = ("styles.css",)
MARKUP_FILES = ("index.html",)


def read_all(patterns: tuple[str, ...]) -> str:
    parts: list[str] = []
    for pattern in patterns:
        for path in sorted(ROOT.glob(pattern)):
            if path.is_file():
                parts.append(path.read_text(encoding="utf-8"))
    return "\n".join(parts)


def word_set(text: str) -> set[str]:
    return set(re.findall(r"[A-Za-z0-9_-]+", text))


def unused_css_classes(styles: str, sources: str) -> list[str]:
    referenced = word_set(sources)
    declared = set(re.findall(r"^\.([A-Za-z0-9_-]+)", styles, re.MULTILINE))
    return sorted(declared - referenced)


def unreferenced_exports(exports: list[str], sources: str, tests: str) -> list[str]:
    """An export is dead when nothing but its own declaration mentions it.

    Counting occurrences rather than testing membership is deliberate: the
    declaration itself contains the name, so a plain membership test
    against the full source would mark every export as referenced. A live
    helper is named at least twice -- once at its declaration and once
    where it is used, imported, or tested.
    """

    counts = Counter(re.findall(r"[A-Za-z0-9_$]+", sources + "\n" + tests))
    return sorted(name for name in exports if counts[name] < 2)


def main() -> int:
    styles = read_all(STYLE_FILES)
    markup = read_all(MARKUP_FILES)
    source = read_all([f"{directory}/**/*.js" for directory in SOURCE_DIRS])
    tests = read_all(["tests/**/*.js"])
    everything = "\n".join([markup, source, tests])

    engine_exports = re.findall(
        r"export (?:function|class) (\w+)", (ROOT / "src/engine.js").read_text(encoding="utf-8")
    )

    problems: list[str] = []
    for name in unused_css_classes(styles, everything):
        problems.append(f"styles.css declares .{name}, which nothing references")
    for name in unreferenced_exports(engine_exports, source, tests):
        problems.append(f"src/engine.js exports {name}(), which nothing imports or tests")

    for problem in problems:
        print(f"dead-code-check: {problem}", file=sys.stderr)
    if problems:
        print(f"\n{len(problems)} dead-code problem(s) found.", file=sys.stderr)
        return 1
    print("dead-code-check: no unused CSS classes or unreferenced engine exports")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())