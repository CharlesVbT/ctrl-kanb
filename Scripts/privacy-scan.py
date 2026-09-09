#!/usr/bin/env python3
"""Bloque les informations locales et secrets courants avant publication."""

from __future__ import annotations

import re
import struct
import sys
import zlib
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
IGNORED_DIRS = {".git", ".build", "build", "dist", "node_modules", ".playwright-cli"}
IGNORED_FILES = {Path(__file__).resolve()}
FORBIDDEN_NAMES = {"events.jsonl", "board.json", "board.previous.json", ".env"}
TEXT_PATTERNS = {
    "chemin utilisateur absolu": re.compile(r"/(?:Users|home)/[^/\s]+/"),
    "volume local absolu": re.compile(r"/Volumes/[^\n\r`\"']+"),
    "adresse email": re.compile(r"(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b"),
    "cle privee": re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    "jeton GitHub": re.compile(r"\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b"),
    "cle OpenAI": re.compile(r"\bsk-[A-Za-z0-9_-]{20,}\b"),
    "cle AWS": re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
}


def public_files():
    for path in ROOT.rglob("*"):
        if path.is_dir() or path.resolve() in IGNORED_FILES:
            continue
        if any(part in IGNORED_DIRS for part in path.relative_to(ROOT).parts):
            continue
        yield path


def png_text(path: Path) -> bytes:
    data = path.read_bytes()
    if not data.startswith(b"\x89PNG\r\n\x1a\n"):
        return b""
    position, chunks = 8, []
    while position + 12 <= len(data):
        length = struct.unpack(">I", data[position : position + 4])[0]
        kind = data[position + 4 : position + 8]
        payload = data[position + 8 : position + 8 + length]
        position += 12 + length
        if kind in {b"tEXt", b"iTXt", b"eXIf"}:
            chunks.append(payload)
        elif kind == b"zTXt":
            try:
                key, compressed = payload.split(b"\0", 1)
                chunks.append(key + b"\0" + zlib.decompress(compressed[1:]))
            except (ValueError, zlib.error):
                pass
        if kind == b"IEND":
            break
    return b"\n".join(chunks)


problems = []
for path in public_files():
    relative = path.relative_to(ROOT)
    if path.name in FORBIDDEN_NAMES or path.suffix in {".log", ".pem", ".key"}:
        problems.append(f"{relative}: artefact local interdit")
        continue
    try:
        raw = png_text(path) if path.suffix.lower() == ".png" else path.read_bytes()
    except OSError as error:
        problems.append(f"{relative}: lecture impossible ({error})")
        continue
    if b"\0" in raw and path.suffix.lower() != ".png":
        continue
    text = raw.decode("utf-8", "ignore")
    for label, pattern in TEXT_PATTERNS.items():
        for match in pattern.finditer(text):
            if label == "adresse email" and match.group(0).lower() == "noreply@ctrl-kanb.local":
                continue
            line = text.count("\n", 0, match.start()) + 1
            problems.append(f"{relative}:{line}: {label}")

if problems:
    print("Le contrôle de confidentialité a échoué :", file=sys.stderr)
    print("\n".join(f"- {problem}" for problem in problems), file=sys.stderr)
    raise SystemExit(1)

print("Confidentialité : aucun chemin personnel, email, secret courant ou artefact local détecté.")
