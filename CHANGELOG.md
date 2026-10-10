# Changelog

All notable changes to this integration are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[semantic versioning](https://semver.org/), bumped by the Release workflow.

Describe each change under `## [Unreleased]` as you make it. The Release workflow
moves that section under the version it ships, and the section becomes the notes of
the version's GitHub Release.

## [Unreleased]

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

[Unreleased]: https://github.com/prohand/gladys-ecovacs/commits/main
