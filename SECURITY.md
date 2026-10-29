# Security

## Reporting a vulnerability

Please do not open a public issue for it. Use *Report a vulnerability*, under
the repository's Security tab: GitHub's private vulnerability reporting, which
only you and the maintainer can read. There is no other channel.

Say what you found, how to reproduce it, and which commit you were on. A
check that shows it (see CONTRIBUTING.md) is the best possible report, but a
plain description is welcome too. Lanes has one maintainer, so a reply can
take a few days; a fix is noted in CHANGELOG.md, with your name if you want
it there.

Only the latest commit on `main` is supported. 0.1.0 is source-only: there
is no published build to patch.

## Scope

**In scope** is what Lanes itself does on your Mac:

- **The bridge between the page and the main process (IPC).** Any way for the
  page — or text rendered in it, a note or one of Claude's replies — to read,
  write, move or trash a file outside the vault, to write a file in the vault
  that is not a note, to run something, or to set state the shape checks
  should refuse.
- **Links.** Anything that gets an address past the one door out
  (`src/main/open.ts`), or moves the window off its own page.
- **Files it opens.** The right-click menu on a path opening something in a
  way that runs it, or opening a path it was never shown.
- **The flags it sets on the CLI.** A safety mode, a denied tool or a
  switched-off skill not reaching the `claude` process; a Guarded approval
  lasting past its turn; a scheduled run going Autonomous without that
  prompt's own confirm.
- **Development switches.** Any `LANES_*` variable other than `LANES_CLAUDE`,
  or `ELECTRON_RENDERER_URL`, having an effect in a packaged build — the
  `LANES_SWAP_*` that `build/swap.sh` reads included.
- **Installing an update.** The app doing anything with `ready.json` but
  offer what it names, or installing on quit a build not known to be newer
  than itself; `build/swap.sh` installing a bundle that is not the same app
  signed the same way as the installed one, replacing the app while any of it
  is still running, installing alongside another install of the same app, or
  leaving no app in place when an install fails.

**Out of scope:**

- Claude Code itself — the CLI, its permission modes, its hooks and how it
  stores sessions. Report those to Anthropic.
- Anthropic's API, accounts and models.
- What Claude does in a mode that allows it. Autonomous is described as
  running any command without asking, and it does.
- Attacks that need someone who can already run code as you.
- Bugs in Electron or Chromium themselves, unless Lanes' own configuration is
  what makes them reachable.

## How the app is hardened

Links leave through one door: `https:`, `http:` and `mailto:` go to your
browser or mail app, a `file:` link opens a vault note in Lanes or is shown in
the Finder (never launched), and any other scheme is refused. The window
cannot navigate away from its own page, the page cannot open a window of its
own, and no `<webview>` attaches. Every permission request is denied except
writing to the clipboard, which the copy buttons need. The renderer is
sandboxed, with context isolation and no Node, and reaches the main process
only through the preload's bridge; its Content-Security-Policy allows no
remote source and sets `object-src`, `frame-src`, `base-uri` and `form-action`
to `'none'`. Handlers that take a note's path take a vault-relative one and
refuse absolute paths, `~`, `..` and NUL; the ones that write, rename, move
or trash take only a `.md` note outside hidden folders, and the ones that
create make only a new `.md` file, never over one that is there, so the page
cannot touch the vault's `.claude/settings.json`. A skill's handlers take a
folder name that cannot be `.` or `..`, and only write that skill's
`SKILL.md` or move its folder to `.trash/skills/`. A session id must be
UUID-shaped; a state patch never sets the folder Lanes works in (main's picker is its one writer); the keys that decide which
folders are lanes or read only, where a new note lands, the safety mode and
the saved prompts are type-checked, and one of the wrong type is dropped.
The right-click menu's Open takes back only a path the menu's own lookup
handed out, judges a link by the file at the end of it and opens that file, hands only documents and media to their own app, opens a folder
in the Finder and a script as text, and only shows anything else in the
Finder. Every `LANES_*` environment switch except
`LANES_CLAUDE`, and `ELECTRON_RENDERER_URL`, works only in a development
build, and the app exits if it cannot tell which build it is. The packaged app
starts `build/swap.sh` with a `PATH` and a `HOME` and nothing else of its
environment, so the script's own `LANES_SWAP_*` switches are shut there too.
One Lanes runs per state file. A new install starts Guarded; choosing
Autonomous asks first; scheduled prompts are off until switched on. Lanes' own
code makes no network calls, and there is no update check.

An update is only ever a build of your own checkout, and only if you turned
on `npm run follow`. The app reads
`~/Library/Application Support/lanes-follow/ready.json` (a development run
only with `LANES_FOLLOW_HOME`), offers what it names at the foot of the rail,
and installs nothing until *Restart now* or a quit — and on a quit only a
build whose commit log has the app's own commit in it, so known to be newer:
one it cannot place may be older, and goes in only by *Restart now*. Then it
hands the bundle to `build/swap.sh`, shipped in the app and run from a copy in
the temporary folder, which waits until nothing runs from the installed
bundle, and puts the new one in place only if its `CFBundleIdentifier` is the
installed app's and the `Authority`, `TeamIdentifier` and `Signature` lines
`codesign -dvv` reports for it are the installed app's too — the same
certificate names, or both ad hoc. It compares those names, not a designated
requirement. The new bundle is copied beside the old one, into a folder of
that install's own, and must pass `codesign --verify --strict --deep` there;
two renames put it in place, and anything that fails before the second leaves
the old app where it was. One install of the app runs at a time: each holds a
lock beside it, `.Lanes-install.lock`, which `npm run install-app` waits for
and takes too, and a swap that finds it held touches nothing. The lock is the
kernel's, through `lockf`, so it is let go however its holder ends.

The rules for links, navigation, Open, paths, the safety defaults, the
development switches, the network and the update install are held by checks:
`checks/open-outside.mjs`, `how-to-open.mjs`, `open-links.mjs`, `ipc-paths.mjs`,
`safety-default.mjs`, `dev-gates.mjs`, `no-network.mjs`, `swap.mjs`,
`follow.mjs`, `update.mjs`, and the driven `autonomous-ask.js`,
`update-ready.js` and `update-quit.js`. `swap.mjs` signs its bundles ad hoc,
so a certificate-signed install is not checked. The sandbox, the permission
handler and the single-instance lock are configuration in `src/main/index.ts`,
with no check of their own yet.

Not done yet: Electron's fuses — `RunAsNode`, `NODE_OPTIONS` and the
inspector flags off, asar integrity on — are not set on the packaged build.
`npm run pack` (`build/pack.sh`) signs the app with `build/sign.sh`: with a
local certificate if one is set up (`LANES_SIGN_IDENTITY`, or
`build/.sign-identity`), else ad hoc. No Developer ID, not notarised.

## Known advisories

`npm audit` on the 0.1.0 lockfile reports 8 vulnerable packages, all
moderate, and all one advisory counted along one chain. Lanes declares no
runtime dependencies — everything in `package.json` is a devDependency — and
the app bundle holds only the built `out/` folder, `package.json`, the sample
vault, `build/swap.sh` and Electron's own runtime (`electron-builder.yml`:
`files`, `extraResources`, `electronDist: node_modules/electron/dist`).

**The eight are in the build toolchain.** GHSA-hp3w-g68c-fv3c, a
denial-of-service in `sprintf-js` 1.1.3, reached through
`electron-builder` → `app-builder-lib` → `@electron/get` 3.1.0 →
`global-agent` → `roarr` → `sprintf-js`; `dmg-builder` and
`electron-builder-squirrel-windows` are counted because they sit on
`app-builder-lib`. electron-builder runs on the developer's Mac during
`npm run pack`, over this repository's own files, and none of it is in the
app. npm's only offered fix is moving electron-builder back to 26.5.0, which
it marks as breaking; that has not been taken.

**None is in the app.** The lockfile has Electron 43.7.10, which `npm audit`
reports nothing against.

`npm audit` is read-only and safe to run yourself.
