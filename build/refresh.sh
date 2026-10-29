#!/bin/bash
# `npm run install-app`: puts a build of this checkout in /Applications.
#
# It builds the app with build/pack.sh, unless nothing that reaches the bundle
# has changed since the last build, and copies it to /Applications/Lanes.app,
# replacing whatever Lanes.app is there. A Lanes that is running is quit first
# and reopened after, which costs a second and restores the whole workspace.
# Nothing is done at all when the installed app is already this source.
#
# Never replaces a bundle under a live process — that is how you get an app
# whose helpers come from one build and whose main process comes from another.
#
# Except while a turn is running: quitting reaches before-quit, which kills the
# CLI, so an answer in flight would die for a build. Then the build is kept,
# nothing is installed, and the next run installs it without needing another
# source change.
#
# Run by hand, it says what it did in plain words, and exits non-zero whenever
# it did not install the build or could not reopen the Lanes it quit.
#
# It can also run as a Claude Code hook, so the installed app keeps up with a
# session that changes the source: give it LANES_HOOK=1 and it speaks the JSON
# a hook uses to tell you something, stays quiet when there is nothing to do,
# and exits 0 even when it fails, so a broken build reports itself without
# failing the hook. In the checkout's .claude/settings.local.json, for one:
#
#   {
#     "hooks": {
#       "Stop": [{ "hooks": [{
#         "type": "command",
#         "command": "LANES_HOOK=1 \"${CLAUDE_PROJECT_DIR:-.}\"/build/refresh.sh",
#         "timeout": 180
#       }] }]
#     }
#   }
#
# A hook runs at the end of a turn, which is why it does not simply wait for
# the app to be closed: an app you reopen between turns is never closed at the
# one moment anybody looks.
set -uo pipefail

HOOK=0
[ "${LANES_HOOK:-}" = 1 ] && HOOK=1

# Says what happened: a hook's systemMessage under LANES_HOOK=1, a plain line
# otherwise.
say() {
  if [ "$HOOK" = 1 ]; then
    printf '{"systemMessage":%s}\n' "$(printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g; s/^/"/; s/$/"/')"
  else
    printf '%s\n' "$1"
  fi
}

# Says what went wrong and stops. Non-zero by hand, so npm reports a failed
# install as one; zero under the hook, where the message is the report.
fail() {
  if [ "$HOOK" = 1 ]; then
    say "$1"
    exit 0
  fi
  say "$1" >&2
  exit 1
}

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Where the build goes: $LANES_BUILD_DIR, else dist/ in this checkout — the same
# rule as build/pack.sh, which this runs and which it hands the choice on to.
# A checkout in a cloud-synced folder needs LANES_BUILD_DIR (see pack.sh).
CACHE="${LANES_BUILD_DIR:-$ROOT/dist}"
export LANES_BUILD_DIR="$CACHE"
mkdir -p "$CACHE" || fail "Lanes not installed: could not make $CACHE for the build."
LOG="$CACHE/refresh.log"
# Two stamps, not one: what has been *packed*, and what has been *installed*.
# Collapsing them means a rebuild repeats on every run for as long as a turn
# keeps the install waiting.
BUILT_STAMP="$CACHE/.built-stamp"
STAMP="$CACHE/.installed-stamp"
BUILT="$CACHE/mac-arm64/Lanes.app"
TARGET="/Applications/Lanes.app"

# Everything that can change what ends up inside the bundle. Deliberately not
# the whole repo: the docs and the checks change often and reach nothing at
# runtime.
current_stamp() {
  {
    git -C "$ROOT" rev-parse HEAD 2>/dev/null || echo nogit
    find "$ROOT/src" "$ROOT/build" -type f ! -name '.DS_Store' -print0 2>/dev/null |
      sort -z | xargs -0 shasum -a 1 2>/dev/null
    shasum -a 1 \
      "$ROOT/package.json" \
      "$ROOT/electron.vite.config.ts" \
      "$ROOT/electron-builder.yml" 2>/dev/null
  } | shasum -a 1 | cut -d' ' -f1
}

now="$(current_stamp)"
installed="$(cat "$STAMP" 2>/dev/null || true)"
built="$(cat "$BUILT_STAMP" 2>/dev/null || true)"
rev="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo local)"

# The stamp alone is not enough: it would claim success after someone deletes
# the app by hand.
if [ "$now" = "$installed" ] && [ -d "$TARGET" ]; then
  [ "$HOOK" = 1 ] || say "Lanes.app is already this source ($rev); nothing to do."
  exit 0
fi

if [ "$now" != "$built" ] || [ ! -d "$BUILT" ]; then
  # A hook speaks once, at the end; by hand, a build long enough to wonder
  # about says where it is going.
  [ "$HOOK" = 1 ] || say "Building Lanes ($rev); the log is $LOG"
  if ! (cd "$ROOT" && npm run pack) >"$LOG" 2>&1; then
    # By hand, the end of the log is usually the reason, so show it.
    [ "$HOOK" = 1 ] || tail -n 15 "$LOG" >&2
    fail "Lanes not installed: the build failed — see $LOG"
  fi
  if [ ! -d "$BUILT" ]; then
    fail "Lanes not installed: the build produced no bundle — see $LOG"
  fi
  printf '%s' "$now" >"$BUILT_STAMP"
fi

running_pid() { pgrep -f "$TARGET/Contents/MacOS/Lanes" | head -1; }

pid="$(running_pid)"
relaunch=0
if [ -n "$pid" ]; then
  # The CLI is a direct child of the main process, so a live one means a turn
  # is in flight. The install stamp is deliberately not written, so the next
  # run retries without needing another source change.
  if pgrep -P "$pid" -f claude >/dev/null 2>&1; then
    fail "Lanes built, not installed: a turn is running in it. The next run installs it, once that turn lands."
  fi
  osascript -e 'quit app "Lanes"' >/dev/null 2>&1 || true
  for _ in $(seq 1 30); do
    [ -z "$(running_pid)" ] && break
    sleep 0.4
  done
  if [ -n "$(running_pid)" ]; then
    fail "Lanes built, not installed: it would not quit. Quit it, and the next run installs it."
  fi
  relaunch=1
fi

# The copy holds the lock build/swap.sh takes for this bundle: quitting Lanes
# above starts the install it does on quit when an update is ready, and two
# writers of one bundle at once can leave half of each, or none. Whichever
# comes second waits for the other, and this one then puts its build over
# whatever that one left.
LOCK="$(dirname "$TARGET")/.$(basename "$TARGET" .app)-install.lock"
# A remove that half-fails would leave a folder that the copy then lands
# inside, as Lanes.app/Lanes.app — so the copy follows only a remove that
# worked. A function, so that checks/swap.mjs can run it on bundles of its own.
put_in_place() {
  lockf -s -t 120 "$LOCK" /bin/bash -c '
    rm -rf "$1" || exit 2
    cp -R "$2" "$1" || exit 3
    xattr -cr "$1" 2>/dev/null
    exit 0' _ "$TARGET" "$BUILT" 2>>"$LOG"
}
put_in_place
case $? in
  0) ;;
  2) fail "Lanes built, not installed: the old $TARGET could not be removed — see $LOG" ;;
  3) fail "Lanes built, not installed: the copy to /Applications failed — see $LOG" ;;
  75) fail "Lanes built, not installed: another install of $TARGET did not finish. The next run installs it." ;;
  *) fail "Lanes built, not installed: $TARGET could not be locked for the copy — see $LOG" ;;
esac

printf '%s' "$now" >"$STAMP"
if [ "$relaunch" = 1 ]; then
  if ! open -a "$TARGET" >/dev/null 2>&1; then
    fail "Lanes.app updated to $rev, but it would not reopen — open it from /Applications."
  fi
  say "Lanes.app updated to $rev and reopened."
else
  say "Lanes.app updated ($rev)."
fi
