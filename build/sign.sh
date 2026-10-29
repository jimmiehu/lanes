#!/bin/bash
# Signs the packaged bundle: with a local certificate if there is one, ad hoc
# if not.
#
# electron-builder with `identity: null` does not sign at all, which leaves the
# app carrying the Electron binary's own signature over contents that no longer
# match it — macOS then refuses to launch it. Apple Silicon requires *some*
# signature, and ad-hoc ("-") is a valid one for an app that stays on this Mac.
#
# Inside-out: helpers and frameworks first, the bundle last, or the outer
# signature is computed over unsigned insides.
#
# Ad hoc is the fallback, not the default. macOS identifies an ad-hoc app by the
# hash of that exact build, so every rebuild was a stranger to its privacy
# database: each Allow and each Don't Allow was forgotten, and the prompts came
# back after every turn that touched src/. A certificate-backed signature is
# identified by the certificate, so the answers stick. The certificate is
# per-Mac and stays out of the repo: LANES_SIGN_IDENTITY, else the SHA-1 in
# build/.sign-identity (from `security find-identity -p codesigning -v`).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Where build/pack.sh puts it, unless told: $LANES_BUILD_DIR, else dist/.
APP="${1:-${LANES_BUILD_DIR:-$HERE/../dist}/mac-arm64/Lanes.app}"

IDENTITY="${LANES_SIGN_IDENTITY:-$(cat "$HERE/.sign-identity" 2>/dev/null | tr -d '[:space:]' || true)}"
# Captured rather than piped into `grep -q`, which can exit before `security`
# finishes writing and fail the pipe under pipefail.
KNOWN="$(security find-identity -p codesigning -v 2>/dev/null || true)"
if [ -n "$IDENTITY" ] && [[ "$KNOWN" != *"$IDENTITY"* ]]; then
  echo "sign: $IDENTITY is not a valid signing identity here, signing ad hoc" >&2
  IDENTITY=""
fi
IDENTITY="${IDENTITY:--}"

# Belt and braces: the build output lives outside any cloud-synced folder (a
# Dropbox or iCloud Drive CloudStorage mount) precisely so the file provider's
# xattrs do not appear, but a stray one from a copy or a download is still
# fatal to codesign.
xattr -cr "$APP"

find "$APP/Contents/Frameworks" -name '*.framework' -maxdepth 1 -print0 2>/dev/null |
  while IFS= read -r -d '' fw; do codesign --force --sign "$IDENTITY" --timestamp=none "$fw" >/dev/null 2>&1 || true; done
find "$APP/Contents/Frameworks" -name '*.app' -maxdepth 1 -print0 2>/dev/null |
  while IFS= read -r -d '' helper; do codesign --force --deep --sign "$IDENTITY" --timestamp=none "$helper"; done
codesign --force --deep --sign "$IDENTITY" --timestamp=none "$APP"
codesign --verify --strict "$APP" && echo "signed ($([ "$IDENTITY" = - ] && echo ad hoc || echo "$IDENTITY")): $APP"
