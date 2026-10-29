#!/bin/bash
# `npm run follow`: keeps a build of one branch ready for Lanes to install.
#
#   bash build/follow.sh on [branch]   follow `branch` (the one checked out, if none is named)
#   bash build/follow.sh off           stop following, and remove all that following made
#   bash build/follow.sh status        what is followed, and what happened last
#   bash build/follow.sh install       install the ready build now: Lanes quits (as ⌘Q has it) and reopens
#   bash build/follow.sh               one pass now, in the foreground, even of a commit that failed
#
# Each time the branch moves — a commit on it from any worktree, a merge into
# it, an amend, a reset — the app is built from that commit and left READY, not
# installed: Lanes notices, says "Update ready" at the foot of its rail with
# the commits it would bring, and installs it when you restart from there or
# whenever you quit (src/main/update.ts, build/swap.sh). Nothing is quit under
# you and no reply is cut off for a build. A build that failed says so in a
# notification and is not built again until the branch moves on.
#
# WHAT MOVES IT IS GIT, NOT A TIMER. A checkout in Dropbox or iCloud Drive is
# behind macOS's privacy rules, and a launchd job reading it gets "Operation
# not permitted" — only apps you have let in, like Terminal or Claude, may. So
# `on` writes a `reference-transaction` hook, which git runs after every ref
# update, inside whatever ran git; when the followed branch is among them it
# starts a pass, detached in a session of its own, so the commit returns at
# once and a turn that ends, or a terminal that closes, does not take the
# build with it. The hook is the repository's own, in its .git/hooks: where
# core.hooksPath is set git does not run that one, and a hook in the folder it
# names would run for every repository that uses it, so `on` refuses. And a
# hook run by any repository but the one followed starts nothing.
#
# THE BUILD IS NOT YOUR CHECKOUT. A pass reads the branch into a clone of its
# own outside the synced folder (codesign cannot sign inside one — see
# build/pack.sh), so whatever you have checked out, half-edited or on another
# branch, is never what gets built. `npm ci` runs there when package-lock.json
# changes. The signing identity is the checkout's, read once by `on`
# (build/.sign-identity is per Mac and not committed), so the update is signed
# as the app it replaces — which build/swap.sh insists on.
#
# WHAT IS READY is said in $LANES_FOLLOW_HOME/ready.json: the commit, the
# branch, the bundle, and the branch's latest commits, newest first, from which
# the app shows the ones newer than itself. Each commit is built in a folder of
# its own, and the two newest are kept, so a build finishing never changes the
# bundle an install is copying. A pass reads the config again each time round,
# and once more before it says a build is ready: an `on` of another branch, or
# an `off`, made while it builds holds for what it offers.
#
# `install` with Lanes running only asks it to quit. Lanes installs what it
# offers as it quits, with a swap of its own (src/main/update.ts), and a
# second swap here would copy over the same bundle at the same time; so this
# waits for Lanes to be gone and for that swap to be done, and reopens it.
# Lanes that installs nothing as it quits — it had not yet seen this build, or
# cannot tell it is newer — has it installed here, with nothing left to race.
# The waiting is detached, like a pass: run inside Lanes, by a reply that the
# quit ends, it is not ended with it.
#
# The hook calls a copy of this script kept beside the clone, not the one in a
# checkout, which may be on a branch without it; each pass replaces that copy
# with the branch's own. The hook never fails a ref update: whatever happens
# in it, it exits 0.
#
# Everything lives in $LANES_FOLLOW_HOME (~/Library/Application Support/
# lanes-follow) — the app reads that default, so leave it there for the app to
# see — the builds in $LANES_FOLLOW_BUILDS (~/Library/Caches/lanes-follow), the
# log in $LANES_FOLLOW_LOG (~/Library/Logs/lanes-follow.log). `off` stops a
# pass that is running and removes all of it: the hook; in $LANES_FOLLOW_HOME
# the config, ready.json, the clone, this script's copy and the stamps; the
# builds; the log; and build/swap.sh's log ($LANES_SWAP_LOG,
# ~/Library/Logs/lanes-update.log), which only an update from here writes. For
# checks/follow.mjs, which runs all of it against a throwaway repository:
# LANES_FOLLOW_PACK stands in for build/pack.sh, LANES_FOLLOW_NOTIFY for the
# notification, LANES_FOLLOW_TARGET for /Applications/Lanes.app, and
# LANES_FOLLOW_INLINE=1 runs a pass, and what `install` leaves waiting, in the
# foreground instead of detached.
set -uo pipefail

HOME_DIR="${LANES_FOLLOW_HOME:-$HOME/Library/Application Support/lanes-follow}"
CONFIG="$HOME_DIR/config"
READY="$HOME_DIR/ready.json"
SRC="$HOME_DIR/src"
SELF="$HOME_DIR/follow.sh"
BUILDS="${LANES_FOLLOW_BUILDS:-$HOME/Library/Caches/lanes-follow}"
LOG="${LANES_FOLLOW_LOG:-$HOME/Library/Logs/lanes-follow.log}"
TARGET="${LANES_FOLLOW_TARGET:-/Applications/Lanes.app}"
# build/swap.sh's own, as it reads it: `off` removes it with the rest.
SWAP_LOG="${LANES_SWAP_LOG:-$HOME/Library/Logs/lanes-update.log}"
# How many commits of the branch ready.json carries, for the app to find itself among.
NOTES=40
# How the hook knows it is this script's, and never replaces or removes another.
MARK='lanes-follow: written by build/follow.sh'

say() { printf '%s\n' "$1"; }
fail() {
  say "$1" >&2
  exit 1
}
log() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" >>"$LOG"; }

# A notification, for what went wrong while nobody was looking.
tell() {
  log "$1"
  if [ -n "${LANES_FOLLOW_NOTIFY:-}" ]; then
    "$LANES_FOLLOW_NOTIFY" "$1" >/dev/null 2>&1 || true
  else
    local said="${1//\\/\\\\}"
    osascript -e "display notification \"${said//\"/\\\"}\" with title \"Lanes\"" >/dev/null 2>&1 || true
  fi
}

# Git hands a hook GIT_DIR, GIT_INDEX_FILE and the like, about the repository
# that ran it; carried into the pass they would point its git at that one.
forget_git() {
  local v
  for v in $(compgen -e); do
    case "$v" in GIT_*) unset "$v" ;; esac
  done
}

config() {
  # Read again in a pass, a config gone or changed leaves nothing of the old standing.
  unset REPO BRANCH SIGN NODE_DIR
  [ -f "$CONFIG" ] || return 1
  # shellcheck source=/dev/null
  . "$CONFIG"
  [ -n "${REPO:-}" ] && [ -n "${BRANCH:-}" ]
}

# What node and the build need, wherever this was started from.
tools() {
  [ -n "${NODE_DIR:-}" ] && PATH="$NODE_DIR:$PATH"
  PATH="$PATH:/usr/bin:/bin:/usr/sbin:/sbin"
}

# The repository a checkout belongs to — its main worktree, which outlives the others.
repo_of() {
  local common
  common="$(git -C "$1" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" || return 1
  case "$common" in */.git) dirname "$common" ;; *) printf '%s\n' "$common" ;; esac
}

# A repository's common dir, one path however it was reached: what tells two apart.
common_of() {
  local d
  d="$(git -C "$1" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" && [ -d "$d" ] && (cd "$d" && pwd -P)
}

# Where `on` writes the hook: the repository's own hooks folder, which its
# worktrees share. Not `--git-path hooks`, which is core.hooksPath's folder
# when that is set — outside the repository, and perhaps every repository's.
hook_path() {
  local d
  d="$(git -C "$1" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" || return 1
  printf '%s/hooks/reference-transaction\n' "$d"
}

# Our hook out of a repository: only if it is there, and ours.
unhook() {
  local hook
  hook="$(hook_path "$1")" || return 0
  if [ -f "$hook" ] && grep -qF "$MARK" "$hook"; then rm -f "$hook"; fi
  return 0
}

# Still running: there, and not a zombie (as build/swap.sh has it).
alive() { kill -0 "$1" 2>/dev/null && ! ps -o stat= -p "$1" 2>/dev/null | grep -q Z; }

# A field of ready.json, as written below: one per line, so a line's start finds it.
ready_field() { sed -n "s/^  \"$1\": \"\\(.*\\)\",\$/\\1/p" "$READY" 2>/dev/null | head -1; }

# A script run with `$@`, detached in a session of its own unless asked not
# to, its output in the log.
detach() {
  mkdir -p "$(dirname "$LOG")"
  if [ "${LANES_FOLLOW_INLINE:-}" = 1 ]; then
    bash "$@" >>"$LOG" 2>&1
    return 0
  fi
  nohup /usr/bin/perl -MPOSIX -e 'POSIX::setsid(); exec @ARGV' /bin/bash "$@" </dev/null >>"$LOG" 2>&1 &
}

# A pass.
start() { detach "$SELF" pass; }

# Whether the config, read afresh, still follows `2` of `1`.
following() { config && [ "$REPO" = "$1" ] && [ "$BRANCH" = "$2" ]; }

# The branch, read into the clone: made the first time, and again if it went.
fetch() {
  if [ ! -d "$SRC/.git" ]; then
    rm -rf "$SRC"
    git clone --quiet --no-hardlinks --no-checkout "$REPO" "$SRC" >>"$LOG" 2>&1 || return 1
  fi
  git -C "$SRC" fetch --quiet --force "$REPO" "+refs/heads/$BRANCH:refs/remotes/follow/$BRANCH" >>"$LOG" 2>&1 &&
    git -C "$SRC" checkout --quiet --force --detach "refs/remotes/follow/$BRANCH" >>"$LOG" 2>&1
}

# `npm ci` in the clone, when its lock file is not the one last installed.
deps() {
  local want
  want="$(shasum -a 1 "$SRC/package-lock.json" 2>/dev/null | cut -d' ' -f1)"
  if [ -d "$SRC/node_modules" ] && [ "$want" = "$(cat "$HOME_DIR/deps-stamp" 2>/dev/null)" ]; then return 0; fi
  log "npm ci in $SRC"
  (cd "$SRC" && npm ci) >>"$LOG" 2>&1 || return 1
  printf '%s' "$want" >"$HOME_DIR/deps-stamp"
}

# This script as the branch has it, put where the hook calls it — by rename, so
# a pass already reading the old one reads on undisturbed.
renew() {
  [ -f "$SRC/build/follow.sh" ] || return 0
  cmp -s "$SRC/build/follow.sh" "$SELF" && return 0
  cp "$SRC/build/follow.sh" "$SELF.new" && chmod +x "$SELF.new" && mv -f "$SELF.new" "$SELF"
}

# ready.json for a commit built at `app`: written beside it and renamed over, so
# the app never reads half of one. Node writes it, since it is JSON with
# commit messages in it; one field to a line, which `ready_field` reads.
ready() {
  node -e '
    const { execFileSync } = require("node:child_process")
    const [src, commit, branch, app, n] = process.argv.slice(1)
    const raw = execFileSync("git", ["-C", src, "log", "-n", n, "--format=%H%x1f%s%x1f%b%x1e", commit], { encoding: "utf8" })
    const log = raw.split("\x1e").map((e) => e.replace(/^\n/, "")).filter(Boolean).map((e) => {
      const [c, subject, body] = e.split("\x1f")
      return { commit: c, subject, body: (body ?? "").trim() }
    })
    const out = { commit, short: commit.slice(0, 7), branch, app, built: new Date().toISOString(), log }
    process.stdout.write(JSON.stringify(out, null, 2) + "\n")
  ' "$SRC" "$1" "$BRANCH" "$2" "$NOTES" >"$READY.new" && mv -f "$READY.new" "$READY"
}

# The builds but the two newest: the one just made, and the one before it, which
# an install that started a moment ago may still be copying.
prune() {
  local d
  # shellcheck disable=SC2012
  ls -1t "$BUILDS" 2>/dev/null | tail -n +3 | while IFS= read -r d; do
    [ -n "$d" ] && rm -rf "${BUILDS:?}/$d"
  done
}

pass() {
  forget_git
  config || return 0
  tools
  mkdir -p "$HOME_DIR" "$BUILDS" "$(dirname "$LOG")"

  # One at a time. One asked for while another runs leaves a note, and the one
  # running reads the branch again before it stops.
  if ! mkdir "$HOME_DIR/lock" 2>/dev/null; then
    local holder
    holder="$(cat "$HOME_DIR/lock/pid" 2>/dev/null)"
    if [ -n "$holder" ] && kill -0 "$holder" 2>/dev/null; then
      : >"$HOME_DIR/again"
      return 0
    fi
    rm -rf "$HOME_DIR/lock"
    mkdir "$HOME_DIR/lock" 2>/dev/null || return 0
  fi
  printf '%s' "$$" >"$HOME_DIR/lock/pid"
  trap 'rm -rf "$HOME_DIR/lock"' EXIT

  local sha rev app out code repo branch
  while :; do
    rm -f "$HOME_DIR/again"
    # Read again each time round: what `off`, or `on` another branch, said
    # while the last round built is what this one does.
    config || return 0
    repo="$REPO"
    branch="$BRANCH"
    if ! fetch; then
      tell "Lanes not built: could not read $BRANCH from $REPO — see $LOG"
      return 1
    fi
    sha="$(git -C "$SRC" rev-parse HEAD)"
    rev="$(git -C "$SRC" rev-parse --short HEAD)"
    app="$BUILDS/$sha/mac-arm64/Lanes.app"
    renew

    if [ "$sha" = "$(ready_field commit)" ] && [ -d "$app" ]; then
      log "$rev is ready already"
    elif [ "$sha" = "$(cat "$HOME_DIR/failed" 2>/dev/null)" ]; then
      log "$rev failed before; waiting for $BRANCH to move on"
    elif ! deps; then
      printf '%s' "$sha" >"$HOME_DIR/failed"
      tell "Lanes $rev not built: npm ci failed — see $LOG"
    else
      log "building $rev"
      mkdir -p "$BUILDS/$sha"
      out="$(cd "$SRC" && LANES_BUILD_DIR="$BUILDS/$sha" LANES_SIGN_IDENTITY="${SIGN:-}" bash "${LANES_FOLLOW_PACK:-$SRC/build/pack.sh}" 2>&1)"
      code=$?
      printf '%s\n' "$out" >>"$LOG"
      # Built for a following that ended or moved to another branch meanwhile:
      # not offered, and not kept.
      if [ "$code" = 0 ] && [ -d "$app" ] && ! following "$repo" "$branch"; then
        rm -rf "${BUILDS:?}/$sha"
        log "$rev of $branch built, but $branch of $repo is not followed now"
        continue
      fi
      if [ "$code" = 0 ] && [ -d "$app" ] && ready "$sha" "$app"; then
        log "$rev is ready: $app"
        prune
      else
        rm -rf "${BUILDS:?}/$sha"
        printf '%s' "$sha" >"$HOME_DIR/failed"
        tell "Lanes $rev did not build: ${out##*$'\n'} — see $LOG"
      fi
    fi
    [ -e "$HOME_DIR/again" ] || return 0
  done
}

# Run by the hook, after git has updated refs: a pass if the branch is among
# them, and they are the followed repository's. Which repository ran it is
# asked before GIT_DIR and the like are forgotten: a hooks folder can serve
# several (core.hooksPath), and a branch of the same name in another is not
# this one moving.
hook() {
  local ran old new ref moved=0
  ran="$(common_of .)"
  forget_git
  if ! config || [ -z "$ran" ] || [ "$ran" != "$(common_of "$REPO")" ]; then
    cat >/dev/null
    return 0
  fi
  while read -r old new ref; do
    [ "$ref" = "refs/heads/$BRANCH" ] && [ "$old" != "$new" ] && [[ ! "$new" =~ ^0+$ ]] && moved=1
  done
  [ "$moved" = 1 ] && start
  return 0
}

# The ready build, in now. Lanes running is asked to quit and installs it as
# it goes; what waits for that and reopens it is detached (see the top).
install() {
  config || fail "follow: not following any branch, so nothing is ready."
  forget_git
  tools
  local app pid me
  app="$(ready_field app)"
  [ -n "$app" ] && [ -d "$app" ] || fail "follow: no build is ready — \`npm run follow\` makes one."
  [ -f "$SRC/build/swap.sh" ] || fail "follow: the ready build's commit has no build/swap.sh to install it with."
  pid="$(pgrep -f "$TARGET/Contents/MacOS/" | head -1)"
  if [ -z "$pid" ]; then
    installed "" "$app"
    return
  fi
  me="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
  say "Lanes quits now, as ⌘Q has it — a reply running in it is cut short — installs the update as it goes, and is reopened after; the log is $LOG"
  detach "$me" installed "$pid" "$app"
}

# A swap Lanes started as it quit, still going: the one the Lanes with pid `1`
# started, or with none named any. src/main/update.ts runs its copy of swap.sh
# as lanes-swap-<pid>.sh, over the bundle it runs from.
swapping() {
  ps -axww -o command= 2>/dev/null | grep -E "lanes-swap-${1:-[0-9]+}\.sh " | grep -qF -- " $TARGET "
}

# `app` installed, one swap at a time. Lanes running (pid `1`) is asked to
# quit and waited for — as long as build/swap.sh waits for it — and so is the
# swap it starts as it quits; then it is reopened. Only when Lanes started no
# swap is one started here.
installed() {
  local pid="$1" app="$2" seen=0 reopen=() _
  if [ -n "$pid" ]; then
    reopen=(--reopen)
    osascript -e 'quit app "Lanes"' >/dev/null 2>&1 || true
    for _ in $(seq 1 600); do
      alive "$pid" || break
      swapping "$pid" && seen=1
      sleep 0.2
    done
    if alive "$pid"; then
      tell "Lanes did not quit, so the update was not installed; it goes in when Lanes next quits."
      return 1
    fi
  fi
  while swapping "$pid"; do
    seen=1
    sleep 0.2
  done
  if [ "$seen" = 0 ]; then
    bash "$SRC/build/swap.sh" "$app" "$TARGET" "${reopen[@]+"${reopen[@]}"}"
    return
  fi
  # Whether its swap put the update in or not, that is said by swap.sh, and
  # whichever app is there now is the one to reopen.
  log "Lanes installed what it offered as it quit"
  [ -n "$pid" ] || say "Lanes was installing an update as it quit; that is what went in."
  if [ -n "$pid" ] && [ -d "$TARGET" ]; then open "$TARGET"; fi
  return 0
}

on() {
  local here repo branch hook hooks_path sign npm_at
  here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  repo="$(repo_of "$here")" || fail "follow: $here is not in a git repository."
  branch="${1:-$(git -C "$here" symbolic-ref --short -q HEAD)}"
  [ -n "$branch" ] || fail "follow: name a branch — $here is on none."
  git -C "$repo" rev-parse -q --verify "refs/heads/$branch^{commit}" >/dev/null || fail "follow: there is no branch $branch in $repo."
  hooks_path="$(git -C "$repo" config --get core.hooksPath)"
  if [ -n "$hooks_path" ]; then
    fail "follow: core.hooksPath is set, to $hooks_path, so git would not run a hook in $repo, and one there would run for every repository that uses it; nothing is followed."
  fi
  hook="$(hook_path "$repo")" || fail "follow: $repo has no hooks folder."
  if [ -e "$hook" ] && ! grep -qF "$MARK" "$hook"; then
    fail "follow: $hook is already there and is not this script's; it is left as it is, and nothing is followed."
  fi
  sign="${LANES_SIGN_IDENTITY:-$(tr -d '[:space:]' <"$here/build/.sign-identity" 2>/dev/null || true)}"
  npm_at="$(command -v npm || true)"

  mkdir -p "$HOME_DIR" "$(dirname "$hook")" || fail "follow: could not make $HOME_DIR."
  # Followed from another clone until now: its hook goes, or it would go on
  # running — and `off` only knows the repository followed.
  if config && [ "$REPO" != "$repo" ]; then unhook "$REPO"; fi
  printf 'REPO=%q\nBRANCH=%q\nSIGN=%q\nNODE_DIR=%q\n' "$repo" "$branch" "$sign" "${npm_at:+$(dirname "$npm_at")}" >"$CONFIG"
  rm -f "$HOME_DIR/failed"
  cp "$here/build/follow.sh" "$SELF.new" && chmod +x "$SELF.new" && mv -f "$SELF.new" "$SELF" || fail "follow: could not copy this script to $SELF."
  {
    printf '#!/bin/bash\n# %s on; `bash build/follow.sh off` removes it.\n' "$MARK"
    printf '# Git runs it after every ref update. It must never fail one, so it always exits 0.\n'
    printf 'f=%q\n' "$SELF"
    printf 'if [ "${1:-}" = committed ] && [ -f "$f" ]; then /bin/bash "$f" hook "$@"; else cat >/dev/null; fi\n'
    printf 'exit 0\n'
  } >"$hook" && chmod +x "$hook" || fail "follow: could not write $hook."

  say "Following $branch: each time it moves, Lanes is built from it, and offers to install it."
  say "Building it now; the log is $LOG"
  start
}

# The pass running, if one is, stopped with all it started — npm, the build —
# since setsid made it the leader of its process group. Only if it is this
# script: a lock left behind can name a pid used since by something else.
stop() {
  local pid _
  pid="$(cat "$HOME_DIR/lock/pid" 2>/dev/null)"
  [ -n "$pid" ] && alive "$pid" || return 0
  case "$(ps -o command= -p "$pid" 2>/dev/null)" in *follow.sh*) ;; *) return 0 ;; esac
  kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null
  for _ in $(seq 1 50); do
    alive "$pid" || return 0
    sleep 0.1
  done
  kill -KILL -- "-$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null
}

off() {
  local here d
  here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  # The hook of the repository followed, and of this checkout's, should they differ.
  if config; then unhook "$REPO"; fi
  if d="$(repo_of "$here")"; then unhook "$d"; fi
  # The config first, so a pass is not reading it; then the pass, so nothing
  # it writes comes after what is removed here.
  rm -f "$CONFIG"
  stop
  rm -rf "$READY" "$READY.new" "$SRC" "$SELF" "$SELF.new" "$HOME_DIR/deps-stamp" "$HOME_DIR/failed" "$HOME_DIR/again" "$HOME_DIR/lock"
  rmdir "$HOME_DIR" 2>/dev/null
  # The builds are folders named by commit; nothing else that may share the folder.
  for d in "$BUILDS"/*; do
    [[ "${d##*/}" =~ ^[0-9a-f]{40}$ ]] && rm -rf "$d"
  done
  rmdir "$BUILDS" 2>/dev/null
  rm -f "$LOG" "$SWAP_LOG"
  say "Not following any branch now; Lanes stays as it is, and offers nothing."
  say "Removed with it: the hook, $HOME_DIR, the builds in $BUILDS, $LOG and $SWAP_LOG."
}

status() {
  if ! config; then
    say "Not following any branch."
    return 0
  fi
  say "Following $BRANCH of $REPO."
  local hook
  hook="$(hook_path "$REPO" 2>/dev/null)"
  if [ -z "$hook" ] || ! grep -qF "$MARK" "$hook" 2>/dev/null; then say "But its hook is missing: \`bash build/follow.sh on $BRANCH\` puts it back."; fi
  [ -n "$(git -C "$REPO" config --get core.hooksPath 2>/dev/null)" ] && say "But core.hooksPath is set, so git does not run its hook, and nothing is built as $BRANCH moves."
  [ -d "$SRC/.git" ] && say "Last read: $(git -C "$SRC" log -1 --format='%h %s' 2>/dev/null)"
  [ -f "$READY" ] && say "Ready to install: $(ready_field short), built $(ready_field built)."
  [ -f "$HOME_DIR/failed" ] && [ "$(cat "$HOME_DIR/failed")" = "$(git -C "$SRC" rev-parse HEAD 2>/dev/null)" ] &&
    say "That commit failed to build, and is not tried again until $BRANCH moves."
  [ -d "$HOME_DIR/lock" ] && say "A pass is running now."
  [ -f "$LOG" ] && {
    say "The log, $LOG, ends:"
    tail -n 5 "$LOG"
  }
}

case "${1:-now}" in
  on) on "${2:-}" ;;
  off) off ;;
  status) status ;;
  install) install ;;
  installed) installed "${2:-}" "${3:-}" ;;
  hook) hook ;;
  pass) pass ;;
  # Asked for by hand: what the branch says, whatever failed before.
  now)
    rm -f "$HOME_DIR/failed"
    pass
    ;;
  *) fail "usage: bash build/follow.sh [on [branch] | off | status | install]" ;;
esac
