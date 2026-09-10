#!/bin/zsh
# Compile CTRL KANB depuis les sources et l installe dans /Applications.
#
# Compiler sur place evite l attribut de quarantaine que macOS pose sur tout
# fichier telecharge : l application demarre sans passer par Reglages Systeme.
set -euo pipefail

PROJECT_DIR="${0:A:h:h}"
APP_NAME="CTRL KANB.app"
DESTINATION="${CTRL_KANB_INSTALL_DIR:-/Applications}"

print -r -- "CTRL KANB — compilation et installation"
print -r -- ""

# --- Prerequis -------------------------------------------------------------
if [[ "$(uname -s)" != "Darwin" ]]; then
  print -r -- "Cette application est macOS uniquement." >&2
  exit 1
fi

macos_major="$(sw_vers -productVersion | cut -d. -f1)"
if (( macos_major < 14 )); then
  print -r -- "macOS 14 (Sonoma) ou plus recent est requis. Version detectee : $(sw_vers -productVersion)" >&2
  exit 1
fi

if ! /usr/bin/xcrun --find clang >/dev/null 2>&1; then
  print -r -- "Les outils de developpement en ligne de commande sont absents." >&2
  print -r -- "Installe-les avec :  xcode-select --install" >&2
  exit 1
fi

print -r -- "  macOS $(sw_vers -productVersion) · $(/usr/bin/xcrun --find clang >/dev/null && print -n 'compilateur present')"

# --- Compilation -----------------------------------------------------------
print -r -- "  compilation…"
# codesign ecrit « replacing existing signature » sur la sortie d erreur :
# on la garde de cote pour ne la montrer qu en cas d echec.
build_log="$(mktemp)"
if ! built="$("$PROJECT_DIR/Scripts/package_app.sh" 2>"$build_log")"; then
  cat "$build_log" >&2
  rm -f "$build_log"
  print -r -- "La compilation a echoue." >&2
  exit 1
fi
rm -f "$build_log"

# --- Tests -----------------------------------------------------------------
if command -v node >/dev/null 2>&1; then
  print -r -- "  tests d interface…"
  # set -e ferait sortir le script sans rien dire : on nomme le test fautif et on
  # montre sa sortie, sinon l installation semble avoir reussi alors qu elle n a
  # rien installe.
  for suite in smoke-ui xss-scan i18n-scan wiring-audit; do
    if ! output="$(node "$PROJECT_DIR/Scripts/$suite.js" 2>&1)"; then
      print -r -- ""
      print -r -- "Le contrôle « $suite » a échoué ; rien n'a été installé." >&2
      print -r -- "$output" | tail -20 >&2
      exit 1
    fi
  done
  if [[ -d "$PROJECT_DIR/node_modules/jsdom" ]]; then
    for suite in test-accessibility test-experience test-conversation test-sync test-resilience; do
      if ! output="$(node "$PROJECT_DIR/Scripts/$suite.js" 2>&1)"; then
        print -r -- ""
        print -r -- "Le contrôle « $suite » a échoué ; rien n'a été installé." >&2
        print -r -- "$output" | tail -20 >&2
        exit 1
      fi
    done
  else
    print -r -- "  (tests de parcours étendus disponibles après npm ci)"
  fi
  print -r -- "  tests passes"
else
  print -r -- "  (node absent : tests d interface ignores)"
fi

# Le pont natif ne se teste pas depuis le DOM : ces scenarios compilent le
# vrai client et le font parler a un faux App Server.
if command -v python3 >/dev/null 2>&1; then
  print -r -- "  tests du pont natif…"
  for suite in test-security-boundaries test-cli-concurrency test-codex-runner test-claude-runner; do
    if ! output="$(python3 "$PROJECT_DIR/Scripts/$suite.py" 2>&1)"; then
      print -r -- ""
      print -r -- "Le contrôle « $suite » a échoué ; rien n'a été installé." >&2
      print -r -- "$output" | tail -20 >&2
      exit 1
    fi
    print -r -- "  ${output##*$'\n'}"
  done
else
  print -r -- "  (python3 absent : tests du pont natif ignores)"
fi

print -r -- "  tests des notifications…"
if ! output="$($PROJECT_DIR/Scripts/test-notifications.sh 2>&1)"; then
  print -r -- ""
  print -r -- "Le contrôle « test-notifications » a échoué ; rien n'a été installé." >&2
  print -r -- "$output" | tail -20 >&2
  exit 1
fi
print -r -- "  ${output##*$'\n'}"

# --- Installation ----------------------------------------------------------
# Installer par-dessus une application ouverte oblige a la fermer. Elle
# disparaissait alors sans un mot, au milieu de ce que l utilisateur etait en
# train d ecrire, et sans jamais revenir. On previent, on protege le travail en
# cours, et on la rouvre.
relaunch=0
if pgrep -x "CTRL KANB" >/dev/null 2>&1; then
  relaunch=1
  board="$HOME/Library/Application Support/CTRL KANB/board.json"
  actives=0
  if [[ -f "$board" ]] && command -v python3 >/dev/null 2>&1; then
    actives="$(python3 - "$board" <<'PYEOF'
import json, sys
try:
    donnees = json.load(open(sys.argv[1], encoding="utf-8"))
    cartes = donnees.get("cards", []) + donnees.get("utilityChats", [])
except Exception:
    print(0); raise SystemExit
print(sum(1 for c in cartes if c.get("status") in ("running", "queued")))
PYEOF
)"
  fi
  if [[ "$actives" -gt 0 && -z "${CTRL_KANB_FORCE_INSTALL:-}" ]]; then
    print -r -- ""
    print -r -- "CTRL KANB est ouvert avec $actives tache(s) en cours d execution." >&2
    print -r -- "Les fermer maintenant interromprait ces agents ; rien n a ete installe." >&2
    print -r -- "Suspends-les dans l application, ou relance avec CTRL_KANB_FORCE_INSTALL=1." >&2
    exit 1
  fi
  print -r -- "  l application etait ouverte : fermeture, puis reouverture apres installation"
  osascript -e 'quit app "CTRL KANB"' >/dev/null 2>&1 || pkill -x "CTRL KANB" || true
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    pgrep -x "CTRL KANB" >/dev/null 2>&1 || break
    sleep 0.5
  done
fi

mkdir -p "$DESTINATION"
rm -rf "$DESTINATION/$APP_NAME"
cp -R "$built" "$DESTINATION/$APP_NAME"

version="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$DESTINATION/$APP_NAME/Contents/Info.plist")"
print -r -- ""
print -r -- "CTRL KANB $version installe dans $DESTINATION"
print -r -- ""
if (( relaunch )); then
  open -a "$DESTINATION/$APP_NAME"
  print -r -- "L application a ete rouverte."
  print -r -- ""
fi
print -r -- "Les donnees vivent dans ~/Library/Application Support/CTRL KANB."
print -r -- "Ouvre l application, puis Reglages > Comptes pour tester la connexion de chaque compte actif."
