# Contributing

Lanes is early — 0.1.0, source-only — and has one maintainer. Issues are
welcome. Pull requests are welcome after an issue has said what the change is
for and it has been agreed that it belongs: the app has a fairly fixed idea
of what it is and isn't (see the README), and a PR that arrives without that
conversation may be closed with thanks. A typo or a broken link can go
straight to a PR.

Lanes is a Mac app and stays one for now. Ports are not something to open a
PR for.

## Issues

Use the templates. A bug report wants your macOS version, the commit you
built, `claude --version`, and the steps.

**Do not paste note content, transcripts, or paths that name people, clients
or places.** Issues are public. Reproduce on the sample vault if you can:
`node checks/run.mjs --dev` opens the app on a copy of it with a stand-in for
the CLI, and `LANES_STATE="$(mktemp -d)" npm run dev` starts a Lanes with no
state, which offers *Use the sample* and talks to your real `claude`.
Otherwise redact, and say that you did.

## The bar: claims are checked

The docs say what the app does in exact terms — which key does what, what is
refused, what is written where — and the bar is a check in `checks/` for each
such claim, one that can be re-run rather than believed. A change in
behaviour ships with one:

1. **Write the check** for the behaviour you want.
2. **Run it against the code before your change and see it fail.** The red
   is what shows the check pins the behaviour down, rather than passing for
   some unrelated reason. `git stash push -- src/` gets the old code back
   while you run it; `git stash pop` brings yours back.
3. **Make the change, run it again, see it pass.**
4. **Say both in the PR**: the command, and the red and the green lines.

Then add it to `checks/manifest.json` and give it a line in
`checks/README.md`, saying what it holds and what it needs.

There are two kinds:

- **Node checks** (`checks/*.mjs`) hold pure modules — the rules for paths,
  links, safety, schedules, the markdown grammar — with no app running. They
  are fast and most rules belong here. Listed under `node` in the manifest,
  or under `nodeNoStrip` for one that runs without
  `--experimental-strip-types`.
- **Driven checks** (`checks/*.js`) are scripts the app runs inside its own
  page. They open notes, type, start threads, and return JSON whose `pass` is
  the verdict. The manifest says what each one wants: the fixture, a state
  seed, which stand-in CLI, a timeout.

### Running them

```bash
npm ci
node checks/run.mjs --node        # the node checks
node checks/run.mjs tabs rail     # named driven checks
node checks/run.mjs --smoke       # the smoke list in checks/manifest.json
node checks/run.mjs --all         # every driven check
node checks/run.mjs --dev         # the app on the sample vault, nothing driven
node checks/run.mjs --self-test   # proves the runner's and the app's refusals
```

`--keep`, `--fixture`, `--seed` and `--shot` are described at the top of
`checks/run.mjs`.

A driven check brings the app to the front and holds it there, since a
person's app is the front one; with the screen locked, where macOS will not
bring an app forward, the page's focus emulation (development runs only)
makes it the focused page all the same. Driven runs take a lock and go one at
a time. The app's output for each is in
`/private/tmp/lanes-check-logs/<name>.log`.

### The world a check runs in

Every driven run gets a world of its own under `/private/tmp/lanes-check-*`:
a fresh vault (a copy of `fixtures/sample-vault`, or the thread fixture, or
an empty folder, as the manifest says), a state directory seeded from
`fixtures/state/lanes-state.json`, and a **stand-in CLI**
(`checks/stand-ins/claude-stub.mjs`) in place of `claude`. The stand-in
answers the way the real CLI does in each mode the manifest names — a plain
answer, a slow one, a usage limit, a signed-out account — so a check spends
nothing and nothing it writes reaches your own Lanes. The world is deleted
afterwards unless you pass `--keep`.

**Never point a check at a real vault.** The runner refuses a `--vault`
outside `/private/tmp` unless `--real-vault` is given as well; don't give it.
The app itself refuses a driven run that was not handed a state directory
and a vault of its own (`src/main/guard.ts`). A check that needs notes the
sample lacks seeds its own, with invented content.

`--live` lets checks marked `live` use your real `claude`. They spend real
turns on your account; use it only when the change is about how the real
CLI behaves, and only on the sample vault.

### Before you send

```bash
npm run typecheck
node checks/run.mjs --node
node checks/run.mjs --smoke
```

and the check for your change, red before and green after. CI runs the
first two and a build on every push to `main` and every pull request; it runs
the smoke list too, but a hosted runner is not promised the GUI session a
driven check needs, so that step does not fail the build.

## Rules the app keeps

- **The panes have roles.** Threads on the left, notes on the right. Opening
  something never asks where.
- **The writing surface is measured against iA Writer.** The editor holds
  the file byte for byte and changes only how it is drawn — marks hidden
  where the caret is not — and nothing it reveals moves the words you are
  looking at.
- **A key that can throw work away asks first.** The default answer keeps
  the work, and pressing or holding the same key again never confirms.
  `checks/esc-discard.js` is the pattern.
- **Lanes makes no network calls of its own.** A change that would need one
  is a discussion first. `checks/no-network.mjs` holds it.
- **Development switches stay development-only.** Every `LANES_*` variable
  but `LANES_CLAUDE` is read through `devEnv` in `src/main/dev.ts`;
  `checks/dev-gates.mjs` holds it.

## Writing

Docs, comments and commit messages share one voice: plain, exact, a little
dry, with a sentence that says why. A comment explains why the code is the
way it is; the code already says what it does. No marketing words, no emoji.

Examples are invented. No real names, clients, places or paths from your own
notes go into code, checks or docs. The sample vault's vocabulary is there to
borrow: lanes Garden and Kitchen; Ada Lovelace and Grace Hopper; Vienna and
Oslo.

## License

By contributing you agree that your contribution is licensed under the MIT
License, as the rest of the project is.
