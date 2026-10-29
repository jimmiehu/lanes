#!/bin/bash
# Builds Lanes.app: typecheck and bundle, electron-builder, then sign.
#
#   bash build/pack.sh            → dist/mac-arm64/Lanes.app
#   LANES_BUILD_DIR=… bash build/pack.sh   → $LANES_BUILD_DIR/mac-arm64/Lanes.app
#
# Not into a cloud-synced folder. A checkout inside Dropbox or iCloud Drive
# lives on a CloudStorage mount, whose file provider stamps every file with
# `com.apple.fileprovider` xattrs and puts them back faster than `xattr -c` can
# take them off — and codesign refuses a bundle that carries them. So a build
# whose output would land under ~/Library/CloudStorage stops here and asks for
# LANES_BUILD_DIR, a real local folder (~/Library/Caches/lanes-build will do).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${LANES_BUILD_DIR:-$ROOT/dist}"
# Resolved through its parent, so nothing is made before the question below.
OUT="$(cd "$(dirname "$OUT")" && pwd -P)/$(basename "$OUT")"

case "$OUT/" in
  "$HOME/Library/CloudStorage/"* | "$HOME/Library/Mobile Documents/"*)
    echo "pack: $OUT is in a cloud-synced folder, where codesign cannot sign the app (the sync's xattrs come back as fast as they are removed)." >&2
    echo "pack: set LANES_BUILD_DIR to a folder outside it, e.g. LANES_BUILD_DIR=\$HOME/Library/Caches/lanes-build npm run pack" >&2
    exit 2
    ;;
esac

mkdir -p "$OUT"
cd "$ROOT"
npm run build
npx electron-builder --mac -c.directories.output="$OUT"
bash "$ROOT/build/sign.sh" "$OUT/mac-arm64/Lanes.app"
