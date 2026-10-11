# Changelog

All notable changes to this integration are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[semantic versioning](https://semver.org/), bumped by the Release workflow.

Describe each change under `## [Unreleased]` as you make it. The Release workflow
moves that section under the version it ships, and the section becomes the notes of
the version's GitHub Release.

## [Unreleased]

## [1.1.0] - 2026-10-11

### Fixed

- Login refused with code 1013 ("Please update to the latest version"): the
  integration now presents itself as a recent Ecovacs Home app, and supports
  the device verification Ecovacs asks for since July 2026 — new actions
  "Send the verification code" and "Confirm the device" (code received by
  email). No automatic retry while the verification waits.
- "Test the connection" shows a failure as an error (in red) instead of a
  success message.
- The Release workflow no longer mistakes the `## [Unreleased]` quoted in the
  changelog introduction for the section heading.

## [1.0.1] - 2026-10-10

### Added

- First version of the Ecovacs integration, built from the official Gladys
  JavaScript template.
- Ecovacs cloud connection with the Ecovacs Home account (email, password,
  country); the password is sent as MD5 only, never logged.
- Deebot robot vacuums: state, start/stop (resume after a pause), return to dock,
  suction power, battery, charging, last error, main brush / side brush / filter
  life.
- GOAT lawn mowers (to be confirmed by testers): state, start/stop, return to
  station, battery, last error, blades / camera lens brush life.
- Automatic detection of the new (`_V2`) and older JSON commands.
- `cloud` / `unreachable` transport badge on each robot.
- Configuration actions: "Test the connection", "Locate a robot".
- Scene triggers (Gladys 5.1+): cleaning or mowing started, finished, robot back
  on its dock, robot error, consumable worn out (10 % or less).
- Scene actions: start (or resume), pause, stop, return to dock, locate.
- Dashboard widget "Ecovacs robot": live battery, state, error, suction,
  consumables, connection, and start/pause/stop/dock/locate buttons.
- English and French documentation.
- CI (Node 22 and 24, store checks and Docker build on pull requests), Release,
  multi-arch build, GitHub releases and Dependabot, as in gladys-devmel.
- `SECURITY.md`, `CHANGELOG.md` and `CLAUDE.md`.

[Unreleased]: https://github.com/prohand/gladys-ecovacs/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/prohand/gladys-ecovacs/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/prohand/gladys-ecovacs/releases/tag/v1.0.1
