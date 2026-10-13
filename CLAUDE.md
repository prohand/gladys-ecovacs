# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Gladys Assistant **external integration** (Node 22+, ESM, no build step, one runtime
dependency: `@gladysassistant/integration-sdk`) for **Ecovacs Deebot robot vacuums** and
**Ecovacs GOAT lawn mowers**, reached through the **Ecovacs cloud** with the Ecovacs Home
account (email, password, country). Cloud only: the manifest declares `"transports": ["cloud"]`.
Gladys 5.1+ adds scene triggers (started, finished, docked, error, consumable low), scene actions
(start, pause, stop, dock, locate) and a dashboard widget (`robot`).

It started from the official template (`GladysAssistant/integration-template-js`); the CI and
release workflows are the same as `prohand/gladys-devmel`.

## Commands

```bash
npm install
npm test                                    # node --test (built-in runner)
node --test test/fleet.test.js              # one file
node --test --test-name-pattern "resume"    # one test by name
npm run lint                                # eslint .
npm run format:check                        # prettier --check . (CI gate)
npm run format                              # prettier --write .
npx github:GladysAssistant/integration-store .   # store admission checks
```

CI runs `format:check`, `lint`, `test` on Node 22 and 24 (plus store checks and a Docker build
on pull requests). Releases: **Actions → Release** only (bumps `package.json`, manifest
`version` + `docker_image`, rolls the changelog, tags, builds).

## Architecture

```
index.js                     SDK wiring only: handlers registered before connect()
src/config.js                DEFAULT_CONFIG (mirrors the manifest defaults) + normalization
src/connection.js            connection status / "Test the connection" messages (EN/FR)
src/ecovacs/api.js           app keys, request signing, endpoints per country
src/ecovacs/client.js        login chain, session renewal, robot list, IoT commands
src/ecovacs/robot.js         one robot: V1/V2 commands, Gladys state mapping, error codes
src/devices/index.js         Fleet: robots of the account, poll, setValue, badge, triggers
src/devices/robot.js         Gladys device payload (vacuum or mower) and states
src/capabilities/scenes.js   scene triggers (transitions) and scene actions
src/capabilities/widget.js   dashboard widget: content from the last poll, button actions
```

### Invariants worth knowing

- **External ids are forever**: `externalIds('vacuum' | 'mower', did)`, `did` being the cloud
  id of the robot. Feature keys (`state`, `run-mode`, `dock`, `suction`, `battery`, `charging`,
  `error`, consumable keys), suction option values, config keys, action, trigger and scene
  action keys are stored by users: never rename them.
- **Login chain**: signed `user/login` → signed `getAuthCode` → `loginByItToken`. The client
  id is derived from the account (stable across restarts). The password leaves as MD5 only.
- **Never retry bad credentials** (`kind: 'credentials'`): it could lock the account. Other
  login failures wait 60 s; concurrent callers share one login; a refused token is renewed
  once (`withSession`).
- **V1 / V2**: the first status read tries `getCleanInfo_V2` and falls back to
  `getCleanInfo` on a refusal (not on a timeout); the result is remembered per robot and
  decides `clean_V2` vs `clean`.
- **Polling**: Gladys `poll_frequency` is an enum in ms (1000, 2000, 10000, 15000, 30000,
  60000); any other value rejects the WHOLE discovery batch, and Gladys only polls a device
  that also carries `should_poll: true`. The config offers 15 / 30 / 60 s.
- **Consumables** are read every 30 minutes, not at every poll (cloud load).
- **Scene triggers fire on transitions only**, never on the first poll after a start.
- **The widget never calls the cloud**: it renders the last poll (`Fleet.snapshot`); the Fleet
  nudges it (`requestWidgetRefresh`) when a row changes. Budget: 8 components, 6 tiles,
  1 status, 4 buttons — `test/widget.test.js` checks `validateWidgetContent(...) === []`.
- **Orders from scenes, widget and Configuration go through `Fleet.act`**, which resolves
  false instead of throwing when the robot does not take the order.
- **Every feature declares `min`/`max`** (NOT NULL in Gladys), text features included.
- **Transport badge**: `cloud` when the robot answered, `unreachable` when it or the cloud
  did not; published on change only.
- **The container rootfs is read-only**: nothing is written to disk.
- Never log the password, tokens or the full email (`maskEmail`).

### Manifest

`test/manifest.test.js` keeps `gladys-assistant-integration.json` in sync with
`DEFAULT_CONFIG`, the `onAction` handlers of `index.js`, `SCENE_TRIGGERS`, `SCENE_ACTIONS` and `WIDGETS`,
and checks the store rules (multi-language texts, 10–100 character description,
`gladys_version >= 5.1.0`, version = package version = image tag).

## Testing

No network, no robot: `test/helpers/fakeEcovacs.js` serves a fake Ecovacs cloud through an
injected `fetch` (login chain, robot list, per-robot command answers, offline robot, expired
token), `test/helpers/fakeGladys.js` stands in for the SDK.

## Conventions

- Prettier formats, ESLint catches mistakes. Comments explain **why**, in English.
- User-facing text is `{ en, fr, de, es }`; user docs in `docs/en.md`, `docs/fr.md`,
  `docs/de.md` and `docs/es.md`, kept in sync.
- Every user-visible change adds a line under `## [Unreleased]` in `CHANGELOG.md`. Never
  write a version heading, never edit `version` / `docker_image` by hand.
