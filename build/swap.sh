#!/bin/bash
# Puts one Lanes.app in the place of another: an update, installed.
#
#   bash build/swap.sh <new.app> <installed.app> [--wait <pid>] [--reopen]
#
# Lanes runs it on itself, detached, when you restart into an update or quit
# with one ready (src/main/update.ts) — from a copy outside its bundle, since
# the bundle is what goes — and `build/follow.sh install` runs it by hand.
#
# It waits for the process it is told to (the Lanes that asked) to be gone, and
# then for anything else running out of the installed bundle: a bundle is never
# replaced under a live process, which is how you get an app whose helpers come
# from one build and whose main process from another.
#
# It installs only Lanes, signed as the Lanes it replaces: the same bundle
# identifier, and the same signing authority (or both ad hoc). The new bundle
# is copied beside the old one, into a folder of this run's own, and checked
# whole there, and then two renames put it in place; anything that goes wrong
# before the second leaves the old app where it was, and `--reopen` reopens
# whichever app is there at the end, with a notification when it is not the
# update.
#
# One install of a bundle at a time. The app starts one whenever it quits with
# an update ready, and `follow.sh install` and `npm run install-app`
# (build/refresh.sh) quit it to install one of their own: two at once delete
# each other's copies, and can leave no app at all. So the install runs
# holding a lock beside the bundle, .<name>-install.lock, which refresh.sh
# takes too. The lock is the kernel's, through lockf: it goes with the process
# that held it, however that ends, so there is never a stale one to judge. A
# swap that finds it held touches nothing: it waits for it to be let go, and
# then only reopens, when asked, what the holder put there.
#
# What it did goes to $LANES_SWAP_LOG (~/Library/Logs/lanes-update.log). For
# checks/swap.mjs: LANES_SWAP_OPEN stands in for `open`, LANES_SWAP_NOTIFY for
# the notification.
set -uo pipefail
PATH="/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

FROM="${1:-}"
TO="${2:-}"
shift 2 2>/dev/null || true
WAIT=""
REOPEN=0
# Set only when this script runs itself under lockf, holding the lock.
LOCKED=0
while [ $# -gt 0 ]; do
  case "$1" in
    --wait)
      WAIT="${2:-}"
      shift 2 || shift
      ;;
    --reopen)
      REOPEN=1
      shift
      ;;
    --locked)
      LOCKED=1
      shift
      ;;
    *) shift ;;
  esac
done
LOG="${LANES_SWAP_LOG:-$HOME/Library/Logs/lanes-update.log}"
mkdir -p "$(dirname "$LOG")" 2>/dev/null || true

log() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" >>"$LOG"; }
reopen() {
  [ "$REOPEN" = 1 ] && [ -d "$TO" ] || return 0
  if [ -n "${LANES_SWAP_OPEN:-}" ]; then "$LANES_SWAP_OPEN" "$TO"; else open "$TO"; fi
}
fail() {
  log "not updated: $1"
  local said="Lanes was not updated: $1"
  if [ -n "${LANES_SWAP_NOTIFY:-}" ]; then
    "$LANES_SWAP_NOTIFY" "$said" >/dev/null 2>&1 || true
  else
    said="${said//\\/\\\\}"
    osascript -e "display notification \"${said//\"/\\\"}\" with title \"Lanes\"" >/dev/null 2>&1 || true
  fi
  reopen
  echo "$said" >&2
  exit 1
}

[ -n "$FROM" ] && [ -n "$TO" ] || fail "usage: swap.sh <new.app> <installed.app> [--wait <pid>] [--reopen]"
FROM="${FROM%/}"
TO="${TO%/}"
case "$TO" in *.app) ;; *) fail "$TO is not an app bundle" ;; esac
DIR="$(dirname "$TO")"
NAME="$(basename "$TO" .app)"
LOCK="$DIR/.$NAME-install.lock"

# Running out of the installed bundle: its main process or its helpers — not
# this script, which may have been started from inside it. The path is matched
# as it is, not as a pattern: a bundle can be named "Lanes (2).app", and a
# pattern made of that matches nothing. It is matched here, in bash, since a
# grep given it would find itself in the list. And a list that cannot be had
# counts as something running: a bundle is never replaced on a guess.
live() {
  local all
  all="$(ps -axww -o command=)" || return 0
  case "$all" in
    *"$TO/Contents/MacOS/"* | *"$TO/Contents/Frameworks/"*) return 0 ;;
  esac
  return 1
}

# Still running: there, and not a zombie — one that has exited and is only
# waiting for its parent to notice is gone, as far as the bundle is concerned.
alive() { kill -0 "$1" 2>/dev/null && ! ps -o stat= -p "$1" 2>/dev/null | grep -q Z; }

if [ "$LOCKED" = 0 ]; then
  if [ -n "$WAIT" ]; then
    for _ in $(seq 1 600); do
      alive "$WAIT" || break
      sleep 0.2
    done
    alive "$WAIT" && fail "Lanes did not quit"
  fi
  # The rest is the install: this script again, holding the lock.
  again=("$FROM" "$TO" --locked)
  [ "$REOPEN" = 1 ] && again+=(--reopen)
  lockf -s -t 0 "$LOCK" /bin/bash "${BASH_SOURCE[0]}" "${again[@]}"
  ran=$?
  case "$ran" in
    # It ran, and said whatever there was to say.
    0 | 1) exit "$ran" ;;
    # EX_TEMPFAIL: another install of this bundle holds it.
    75) ;;
    *) fail "it could not be installed in $DIR" ;;
  esac
  lockf -s -t 300 "$LOCK" true || fail "another install of $TO did not finish"
  log "left $TO to the install already under way"
  reopen
  exit 0
fi

# Helpers can trail the main process out by a moment.
for _ in $(seq 1 50); do
  live || break
  sleep 0.2
done
live && fail "Lanes is still running from $TO"

[ -d "$FROM/Contents/MacOS" ] || fail "there is no app at $FROM"
id_of() { /usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$1/Contents/Info.plist" 2>/dev/null; }
signer() { codesign -dvv "$1" 2>&1 | grep -E '^(Authority|TeamIdentifier|Signature)='; }
if [ -d "$TO" ]; then
  [ -n "$(id_of "$FROM")" ] && [ "$(id_of "$FROM")" = "$(id_of "$TO")" ] || fail "$FROM is not the same app as $TO"
  [ -n "$(signer "$FROM")" ] && [ "$(signer "$FROM")" = "$(signer "$TO")" ] || fail "$FROM is not signed as $TO is"
fi

# What a run cut off part way left beside the bundle — or, from before there
# was a lock, under fixed names. Holding the lock, nothing else is using them;
# but with no app in place, one of them may be the only copy left, so it stays.
if [ -d "$TO" ]; then
  rm -rf "$DIR/.$NAME-swap."* "$DIR/.$NAME-update.app" "$DIR/.$NAME-previous.app"
fi
# This run's own folder, beside the bundle so that its renames stay on one volume.
WORK="$(mktemp -d "$DIR/.$NAME-swap.XXXXXX" 2>>"$LOG")" || fail "it could not be copied to $DIR"
NEW="$WORK/new.app"
OLD="$WORK/old.app"
if ! cp -R "$FROM" "$NEW" 2>>"$LOG"; then
  rm -rf "$WORK"
  fail "it could not be copied to $DIR"
fi
xattr -cr "$NEW" 2>/dev/null || true
if ! codesign --verify --strict --deep "$NEW" 2>>"$LOG"; then
  rm -rf "$WORK"
  fail "the copy's signature does not verify"
fi

# Opened again while it was copied: it stays as it is.
if live; then
  rm -rf "$WORK"
  fail "Lanes was opened again before it could be replaced"
fi
if [ -d "$TO" ] && ! mv "$TO" "$OLD" 2>>"$LOG"; then
  rm -rf "$WORK"
  fail "the old app could not be moved aside"
fi
if ! mv "$NEW" "$TO" 2>>"$LOG"; then
  # The old app goes back first; the folder goes only once it has.
  if [ ! -d "$OLD" ] || mv "$OLD" "$TO" 2>>"$LOG"; then rm -rf "$WORK"; fi
  fail "the update could not be put in place"
fi
rm -rf "$WORK"
log "updated $TO from $FROM"
reopen
exit 0
