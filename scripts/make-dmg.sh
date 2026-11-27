#!/bin/bash
# Construit un DMG « glisser dans Applications » : l'app, un raccourci vers /Applications et un LISEZ-MOI.
#
#   scripts/make-dmg.sh <getaroom.app> <sortie.dmg>
#
# Utilisé par le workflow de release (.github/workflows/release.yml) et utilisable en local.
set -euo pipefail

APP="${1:?usage: make-dmg.sh <getaroom.app> <sortie.dmg>}"
OUT="${2:?usage: make-dmg.sh <getaroom.app> <sortie.dmg>}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
README="$HERE/docs/dmg/LISEZ-MOI.txt"

[ -d "$APP" ] || { echo "App introuvable : $APP" >&2; exit 1; }
[ -f "$README" ] || { echo "LISEZ-MOI introuvable : $README" >&2; exit 1; }

STAGE="$(mktemp -d "${TMPDIR:-/tmp}/getaroom-dmg.XXXXXX")"
trap 'rm -rf "$STAGE"' EXIT

# ditto conserve la signature et les attributs de l'app (cp -R peut les abîmer).
ditto "$APP" "$STAGE/getaroom.app"
ln -s /Applications "$STAGE/Applications"
cp "$README" "$STAGE/LISEZ-MOI.txt"

mkdir -p "$(dirname "$OUT")"
rm -f "$OUT"
hdiutil create -ov -fs HFS+ -volname getaroom -srcfolder "$STAGE" "$OUT" >/dev/null
echo "DMG créé : $OUT ($(du -h "$OUT" | cut -f1))"
