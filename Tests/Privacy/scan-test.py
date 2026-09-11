#!/usr/bin/env python3
"""Vérifie que le contrôle de confidentialité bloque réellement une fuite."""

from __future__ import annotations

import shutil
import subprocess
import tempfile
from pathlib import Path


source = Path(__file__).with_name("scan.py")
with tempfile.TemporaryDirectory(prefix="ctrl-kanb-privacy-test-") as folder:
    root = Path(folder)
    scripts = root / "Tests" / "Privacy"
    scripts.mkdir(parents=True)
    scanner = scripts / "scan.py"
    shutil.copy2(source, scanner)

    safe = root / "README.md"
    safe.write_text("Projet Exemple\n", encoding="utf-8")
    result = subprocess.run(["python3", str(scanner)], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr

    generated = root / "Platforms" / "Windows" / "src-tauri" / "target"
    generated.mkdir(parents=True)
    (generated / "compiler-output.txt").write_text("/" + "Users" + "/generated/cache\n", encoding="utf-8")
    result = subprocess.run(["python3", str(scanner)], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr

    leak = root / "example.txt"
    leak.write_text("/" + "Users" + "/example/Documents/private.txt\n", encoding="utf-8")
    result = subprocess.run(["python3", str(scanner)], capture_output=True, text=True)
    assert result.returncode == 1, result.stdout
    assert "chemin utilisateur absolu" in result.stderr, result.stderr

    leak.write_text("C:" + "\\Users\\example\\Documents\\private.txt\n", encoding="utf-8")
    result = subprocess.run(["python3", str(scanner)], capture_output=True, text=True)
    assert result.returncode == 1, result.stdout
    assert "chemin utilisateur Windows" in result.stderr, result.stderr

    leak.write_text("Hôte " + "192" + ".168.2.10\n", encoding="utf-8")
    result = subprocess.run(["python3", str(scanner)], capture_output=True, text=True)
    assert result.returncode == 1, result.stdout
    assert "adresse reseau privee" in result.stderr, result.stderr

print("PASS le contrôle de confidentialité bloque chemins locaux et adresses privées")
