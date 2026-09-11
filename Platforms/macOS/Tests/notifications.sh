#!/bin/zsh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${TMPDIR:-/tmp}/ctrl-kanb-notification-tests"
clang -fobjc-arc -fmodules -mmacosx-version-min=14.0 \
  -framework Cocoa -framework WebKit -framework UserNotifications -framework UniformTypeIdentifiers \
  "$ROOT/Tests/NotificationTests.m" "$ROOT/Sources/App/AppServerClient.m" -o "$OUT"
"$OUT"
