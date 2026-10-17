#!/bin/sh
# Build: Tests, Version aus Git, Deploy-Dateien nach dist/deploy.
# Deployt (als Seiten-Anhänge) werden NUR: persistence.js app.js (+ seed.json wie bisher);
# htmlMacro.html ist der Inhalt des HTML-Makros.
set -e
cd "$(dirname "$0")"
VERSION="$(git describe --tags --always --dirty 2>/dev/null || echo dev)-$(date +%Y%m%d)"
echo "Build $VERSION"
node test/run.js
rm -rf dist && mkdir -p dist/deploy
cp persistence.js htmlMacro.html dist/deploy/
sed "s/__BUILD_VERSION__/$VERSION/" app.js > dist/deploy/app.js
grep -q "\"$VERSION\"" dist/deploy/app.js || { echo "Build-Version nicht eingesetzt" >&2; exit 1; }
echo "-> dist/deploy (Build $VERSION)"
ls -la dist/deploy
