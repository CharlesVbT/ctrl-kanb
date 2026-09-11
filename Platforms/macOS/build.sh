#!/bin/zsh
set -euo pipefail

MACOS_DIR="${0:A:h}"
PROJECT_DIR="${MACOS_DIR:h:h}"
SHARED_WEB_DIR="$PROJECT_DIR/Shared/Web"
BUILD_DIR="$PROJECT_DIR/build"
APP_DIR="$PROJECT_DIR/dist/CTRL KANB.app"

/bin/rm -rf "$BUILD_DIR" "$APP_DIR"
/bin/mkdir -p "$BUILD_DIR" "$APP_DIR/Contents/MacOS" "$APP_DIR/Contents/Resources"

/usr/bin/clang \
  -fobjc-arc -fmodules -mmacosx-version-min=14.0 \
  -framework Cocoa -framework WebKit -framework UserNotifications -framework LocalAuthentication -framework Security -framework UniformTypeIdentifiers \
  "$MACOS_DIR/Sources/App/main.m" "$MACOS_DIR/Sources/App/AppServerClient.m" \
  -o "$APP_DIR/Contents/MacOS/CTRL KANB"

/usr/bin/clang \
  -fobjc-arc -fmodules -mmacosx-version-min=14.0 \
  -framework Foundation \
  "$MACOS_DIR/Sources/CLI/main.m" \
  -o "$APP_DIR/Contents/Resources/ctrl-kanb"

/usr/bin/clang \
  -fobjc-arc -fmodules -mmacosx-version-min=14.0 \
  -framework Cocoa \
  "$MACOS_DIR/Sources/Helper/main.m" \
  -o "$APP_DIR/Contents/Resources/ctrl-kanb-wake"

/bin/cp "$MACOS_DIR/Resources/Info.plist" "$APP_DIR/Contents/Info.plist"
/bin/cp "$SHARED_WEB_DIR/index.html" "$APP_DIR/Contents/Resources/index.html"
/bin/cp "$SHARED_WEB_DIR/app.css" "$APP_DIR/Contents/Resources/app.css"
/bin/cp "$SHARED_WEB_DIR/app.js" "$APP_DIR/Contents/Resources/app.js"
/bin/cp "$SHARED_WEB_DIR/i18n.js" "$APP_DIR/Contents/Resources/i18n.js"
/bin/cp "$SHARED_WEB_DIR/platform.js" "$APP_DIR/Contents/Resources/platform.js"
/bin/cp "$SHARED_WEB_DIR/AppIcon.png" "$APP_DIR/Contents/Resources/AppIcon.png"
/bin/cp "$MACOS_DIR/Resources/AppIcon.icns" "$APP_DIR/Contents/Resources/AppIcon.icns"
/bin/cp "$PROJECT_DIR/LICENSE" "$APP_DIR/Contents/Resources/LICENSE"
/bin/cp "$PROJECT_DIR/NOTICE" "$APP_DIR/Contents/Resources/NOTICE"
/bin/cp "$PROJECT_DIR/THIRD_PARTY_NOTICES.md" "$APP_DIR/Contents/Resources/THIRD_PARTY_NOTICES.md"
# Signature ad hoc : les binaires internes d abord, le bundle ensuite.
# --deep est deprecie par Apple et ne signe pas dans le bon ordre.
for binary in "$APP_DIR/Contents/Resources/ctrl-kanb" "$APP_DIR/Contents/Resources/ctrl-kanb-wake"; do
  /usr/bin/codesign --force --options runtime --sign - "$binary"
done
/usr/bin/codesign --force --options runtime --sign - "$APP_DIR"

echo "$APP_DIR"
