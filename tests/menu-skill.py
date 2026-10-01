"""Validate portable skill contents and exercise its offline JSON validator."""
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "skills" / "szzx-menu"
spec = importlib.util.spec_from_file_location("menu_validator", SOURCE / "scripts" / "validate_menu.py")
validator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(validator)
row = {"date": "2026-10-01", "weekday": "周四", "time": ["noon"], "place": None, "group": None, "name": "免费汤", "price": 0, "spicy": False}
assert validator.validate([row]) == 1
assert validator.validate([{**row, "date": "2024-02-29", "weekday": "周四", "price": 1.5, "spicy": None}]) == 1
assert validator.validate([{**row, "date": None, "weekday": None, "time": []}]) == 1
cases = [[], {}, [{**row, "date": "2026-02-29"}], [{**row, "date": "2026-13-01"}], [{**row, "weekday": "周一"}],
         [{**row, "time": ["noon", "noon"]}], [{**row, "time": ["午餐"]}], [{**row, "price": "0"}],
         [{**row, "price": True}], [{**row, "spicy": "false"}], [{**row, "name": " "}], [{**row, "extra": None}],
         [{**row, "price": float("inf")}], [{**row, "place": "字" * 101}], [{**row, "name": None}], [{**row, "price": 10**400}]]
for case in cases:
    try:
        validator.validate(case)
    except ValueError:
        continue
    raise AssertionError(f"Invalid input accepted: {case}")
with tempfile.TemporaryDirectory(prefix="szzx-menu-skill-") as temp:
    assert Path(temp).resolve().parent == Path(tempfile.gettempdir()).resolve()
    file = Path(temp) / "menu.json"
    file.write_text(json.dumps([row], ensure_ascii=False), encoding="utf-8")
    assert subprocess.run([sys.executable, str(SOURCE / "scripts" / "validate_menu.py"), str(file)], capture_output=True).returncode == 0
    file.write_text('[{"name":"a","name":"b"}]', encoding="utf-8")
    assert subprocess.run([sys.executable, str(SOURCE / "scripts" / "validate_menu.py"), str(file)], capture_output=True).returncode == 1
    checkout = Path(temp) / "checkout"
    shutil.copytree(SOURCE, checkout / "skills" / "szzx-menu", ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
    (checkout / "tools").mkdir()
    shutil.copyfile(ROOT / "tools" / "build-menu-skill.py", checkout / "tools" / "build-menu-skill.py")
    (checkout / "menu-json-rules.md").write_bytes((ROOT / "menu-json-rules.md").read_text(encoding="utf-8").replace("\n", "\r\n").encode("utf-8"))
    for source in (checkout / "skills").rglob("*"):
        if source.is_file():
            source.write_bytes(source.read_text(encoding="utf-8").replace("\n", "\r\n").encode("utf-8"))
    assert subprocess.run([sys.executable, str(checkout / "tools" / "build-menu-skill.py")], capture_output=True).returncode == 0
    assert (checkout / "szzx-menu.skill").read_bytes() == (ROOT / "szzx-menu.skill").read_bytes(), "LF and CRLF checkouts must build identical packages"
with zipfile.ZipFile(ROOT / "szzx-menu.skill") as archive:
    assert archive.testzip() is None
    assert sorted(archive.namelist()) == ["szzx-menu/SKILL.md", "szzx-menu/references/menu-json-rules.md", "szzx-menu/scripts/validate_menu.py"]
    assert archive.read("szzx-menu/SKILL.md") == (SOURCE / "SKILL.md").read_text(encoding="utf-8").encode("utf-8")
    assert archive.read("szzx-menu/references/menu-json-rules.md") == (ROOT / "menu-json-rules.md").read_text(encoding="utf-8").encode("utf-8")
    assert archive.read("szzx-menu/scripts/validate_menu.py") == (SOURCE / "scripts" / "validate_menu.py").read_text(encoding="utf-8").encode("utf-8")
assert (SOURCE / "references" / "menu-json-rules.md").read_text(encoding="utf-8") == (ROOT / "menu-json-rules.md").read_text(encoding="utf-8")
print(f"Portable menu skill passed: valid examples, {len(cases)} rejected cases, CLI, packaged files and CRLF reproducibility.")
