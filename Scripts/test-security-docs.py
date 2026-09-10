#!/usr/bin/env python3
import pathlib


project = pathlib.Path(__file__).resolve().parents[1]
readme = (project / "README.md").read_text(encoding="utf-8")
privacy = (project / "PRIVACY.md").read_text(encoding="utf-8")
interface = (project / "Resources" / "app.js").read_text(encoding="utf-8")

assert "terminal zsh et navigateur de fichiers limités" not in readme
assert "terminal démarre dans ce dossier mais reste un shell zsh complet" in privacy
assert "reste un shell complet avec vos droits macOS" in interface
assert "refuse leurs demandes de chemin qui sortent du projet" in privacy
assert "fichiers d’instructions CLAUDE.md" in privacy
print("PASS les garanties du terminal et du mode sans modification sont exactes")
