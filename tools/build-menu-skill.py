#!/usr/bin/env python3
"""Build the portable skill from its source and the canonical project rules."""
from pathlib import Path
import shutil
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "skills" / "szzx-menu"
reference = SOURCE / "references" / "menu-json-rules.md"
reference.parent.mkdir(parents=True, exist_ok=True)
shutil.copyfile(ROOT / "menu-json-rules.md", reference)
files = sorted(p for p in SOURCE.rglob("*") if p.is_file() and "__pycache__" not in p.parts and p.suffix != ".pyc")
with zipfile.ZipFile(ROOT / "szzx-menu.skill", "w", zipfile.ZIP_DEFLATED) as archive:
    for file in files:
        info = zipfile.ZipInfo(file.relative_to(SOURCE.parent).as_posix(), (2026, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        # Git may check out CRLF on Windows. Keep package bytes portable and reproducible.
        archive.writestr(info, file.read_text(encoding="utf-8").encode("utf-8"))
print(f"Built szzx-menu.skill with {len(files)} files")
