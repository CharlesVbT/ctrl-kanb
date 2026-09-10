#!/bin/zsh
set -euo pipefail

PROJECT_DIR="${0:A:h:h}"
BUILD_DIR="$PROJECT_DIR/build"
APP_DIR="$PROJECT_DIR/dist/CTRL KANB.app"

/bin/rm -rf "$BUILD_DIR" "$APP_DIR"
/bin/mkdir -p "$BUILD_DIR" "$APP_DIR/Contents/MacOS" "$APP_DIR/Contents/Resources"

/usr/bin/clang \
  -fobjc-arc -fmodules -mmacosx-version-min=14.0 \
  -framework Cocoa -framework WebKit -framework UserNotifications -framework LocalAuthentication -framework Security -framework UniformTypeIdentifiers \
  "$PROJECT_DIR/Sources/App/main.m" "$PROJECT_DIR/Sources/App/AppServerClient.m" \
  -o "$APP_DIR/Contents/MacOS/CTRL KANB"

/usr/bin/clang \
  -fobjc-arc -fmodules -mmacosx-version-min=14.0 \
  -framework Foundation \
  "$PROJECT_DIR/Sources/CLI/main.m" \
  -o "$APP_DIR/Contents/Resources/ctrl-kanb"

/usr/bin/clang \
  -fobjc-arc -fmodules -mmacosx-version-min=14.0 \
  -framework Cocoa \
  "$PROJECT_DIR/Sources/Helper/main.m" \
  -o "$APP_DIR/Contents/Resources/ctrl-kanb-wake"

/bin/cp "$PROJECT_DIR/Resources/Info.plist" "$APP_DIR/Contents/Info.plist"
/bin/cp "$PROJECT_DIR/Resources/index.html" "$APP_DIR/Contents/Resources/index.html"
/bin/cp "$PROJECT_DIR/Resources/app.css" "$APP_DIR/Contents/Resources/app.css"
/bin/cp "$PROJECT_DIR/Resources/app.js" "$APP_DIR/Contents/Resources/app.js"
/bin/cp "$PROJECT_DIR/Resources/i18n.js" "$APP_DIR/Contents/Resources/i18n.js"
/bin/cp "$PROJECT_DIR/Resources/platform.js" "$APP_DIR/Contents/Resources/platform.js"
/bin/cp "$PROJECT_DIR/Resources/AppIcon.png" "$APP_DIR/Contents/Resources/AppIcon.png"
/bin/cp "$PROJECT_DIR/Resources/AppIcon.icns" "$APP_DIR/Contents/Resources/AppIcon.icns"
/bin/cp -R "$PROJECT_DIR/Resources/Brands" "$APP_DIR/Contents/Resources/Brands"
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
