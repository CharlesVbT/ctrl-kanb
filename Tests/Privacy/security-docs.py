#!/usr/bin/env python3
import pathlib


project = pathlib.Path(__file__).resolve().parents[2]
readme = (project / "README.md").read_text(encoding="utf-8")
privacy = (project / "PRIVACY.md").read_text(encoding="utf-8")
interface = (project / "Shared" / "Web" / "app.js").read_text(encoding="utf-8")

assert "terminal zsh et navigateur de fichiers limités" not in readme
assert "terminal démarre dans ce dossier mais reste un shell complet" in privacy
assert "reste un shell complet avec vos droits macOS" in interface
assert "refuse leurs demandes de chemin qui sortent du projet" in privacy
assert "fichiers d’instructions `CLAUDE.md`" in privacy
assert "aucun compte CTRL KANB, serveur intermédiaire" in privacy
assert "%LOCALAPPDATA%\\CTRL KANB Data\\" in privacy
print("PASS les garanties du terminal et du mode sans modification sont exactes")
