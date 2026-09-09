#!/usr/bin/env python3
"""Vérifie que le contrôle de confidentialité bloque réellement une fuite."""

from __future__ import annotations

import shutil
import subprocess
import tempfile
from pathlib import Path


source = Path(__file__).with_name("privacy-scan.py")
with tempfile.TemporaryDirectory(prefix="ctrl-kanb-privacy-test-") as folder:
    root = Path(folder)
    scripts = root / "Scripts"
    scripts.mkdir()
    scanner = scripts / "privacy-scan.py"
    shutil.copy2(source, scanner)

    safe = root / "README.md"
    safe.write_text("Projet Exemple\n", encoding="utf-8")
    result = subprocess.run(["python3", str(scanner)], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr

    leak = root / "example.txt"
    leak.write_text("/" + "Users" + "/example/Documents/private.txt\n", encoding="utf-8")
    result = subprocess.run(["python3", str(scanner)], capture_output=True, text=True)
    assert result.returncode == 1, result.stdout
    assert "chemin utilisateur absolu" in result.stderr, result.stderr

print("PASS le contrôle de confidentialité accepte les données neutres et bloque un chemin local")
