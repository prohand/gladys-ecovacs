# Gladys Ecovacs

External integration for [Gladys Assistant](https://gladysassistant.com) that
drives **Ecovacs Deebot robot vacuums** and **Ecovacs GOAT lawn mowers**
through the Ecovacs cloud, with the account of the Ecovacs Home app.

Built from the official
[JavaScript integration template](https://github.com/GladysAssistant/integration-template-js)
and the SDK
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js).

- **Transport**: `cloud` only (`"transports": ["cloud"]` in the manifest).
  Ecovacs offers no local API; each robot card shows a `cloud` badge, or
  `unreachable` when the robot stops answering.
- **Gladys**: 5.1.0 or later (scene triggers, scene actions, dashboard widget).
- **User documentation**: [English](docs/en.md) · [Français](docs/fr.md) ·
  [Deutsch](docs/de.md) · [Español](docs/es.md).

## Features

| Surface        | What                                                                                          |
| -------------- | --------------------------------------------------------------------------------------------- |
| Devices        | One device per robot: state, start/stop, dock, suction, battery, charging, error, consumables |
| Actions        | `test_connection`, `locate` (Configuration screen)                                            |
| Scene triggers | `cleaning_started`, `cleaning_finished`, `robot_docked`, `robot_error`, `consumable_low`      |
| Scene actions  | `start_robot`, `pause_robot`, `stop_robot`, `return_to_dock`, `locate_robot`                  |
| Widget         | `robot`: state, battery, error, consumables, start/pause/stop/dock/locate buttons             |

The state follows the Gladys `vacuum-cleaner` category (`state`, `run-mode`,
`dock`); GOAT mowers use the same category (Gladys has no mower one), with
their own external id namespace (`mower`) and consumables.

## How it talks to Ecovacs

Ecovacs publishes no third-party API. The integration speaks the protocol of
the Ecovacs Home app, as documented by
[deebot-client](https://github.com/DeebotUniverse/client.py) (Home Assistant)
and [ecovacs-deebot.js](https://github.com/mrbungle64/ecovacs-deebot.js)
(ioBroker):

1. signed login on `gl-<country>-api.ecovacs.com` (password sent as MD5);
2. one-time auth code on `gl-<country>-openapi.ecovacs.com`;
3. `loginByItToken` on `portal-ww.ecouser.net` (China: `portal.ecouser.net`);
4. robot list (`appsvr/app.do`, `GetGlobalDeviceList`);
5. JSON commands through `iot/devmanager.do` (`getCleanInfo_V2`,
   `clean_V2`, `charge`, `getBattery`, `setSpeed`, `playSound`…), falling back
   to the older commands for robots that do not know the `_V2` ones.

Robots on the legacy XMPP protocol (company `eco-legacy`) are listed as not
supported. State is polled (15 s, 30 s or 1 min); the MQTT push channel is not
used.

## Project structure

```
.
├─ index.js                     # SDK wiring only
├─ src/
│  ├─ config.js                 # defaults + normalization (poll frequency in ms)
│  ├─ connection.js             # connection status / test messages (EN/FR)
│  ├─ ecovacs/
│  │  ├─ api.js                 # constants, request signing, endpoints
│  │  ├─ client.js              # session, robot list, commands (fetch injected)
│  │  └─ robot.js               # V1/V2 protocol, state mapping, error codes
│  ├─ devices/
│  │  ├─ index.js               # Fleet: robots of the account, poll, commands
│  │  └─ robot.js               # Gladys device payload and states
│  └─ capabilities/
│     ├─ scenes.js              # scene triggers (transitions) and actions
│     └─ widget.js              # dashboard widget (content + buttons)
├─ docs/{en,fr,de,es}.md        # user documentation (re-hosted by Gladys)
├─ test/                        # node --test, fake Gladys + fake Ecovacs cloud
├─ gladys-assistant-integration.json
├─ Dockerfile                   # Node 24 Alpine, read-only rootfs ready
├─ CHANGELOG.md · CLAUDE.md · SECURITY.md
└─ .github/                     # CI, Release, build, GitHub releases, Dependabot
```

## Development

```bash
npm install
npm test               # node --test (no network: the Ecovacs cloud is faked)
npm run lint           # ESLint
npm run format:check   # Prettier
npx github:GladysAssistant/integration-store .   # store admission checks
```

Run against a Gladys instance:

```bash
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="ecovacs" \
LOG_LEVEL=debug \
npm start
```

## CI and releases

Same workflows as [gladys-devmel](https://github.com/prohand/gladys-devmel):

- **CI** (`ci.yml`): Prettier, ESLint and tests on Node 22 and 24; on pull
  requests, the store admission checks and a Docker build (amd64, not pushed).
- **Release** (`release.yml`): Actions → Release → patch / minor / major.
  Bumps `package.json`, the manifest `version` and `docker_image`, moves
  `## [Unreleased]` of the changelog, tags, then builds and publishes.
- **Build** (`build.yml`): multi-arch image (`linux/amd64`, `linux/arm64`) on
  `ghcr.io/prohand/gladys-ecovacs`.
- **GitHub releases** (`github-release.yml`): one GitHub Release per tag, with
  its changelog section.
- **Dependabot**: npm weekly, GitHub Actions and Docker monthly.

Publishing checklist: GitHub topic `gladys-assistant-integration`, public
`ghcr.io` package, **Private vulnerability reporting** enabled (see
[SECURITY.md](SECURITY.md)).

## License

Apache-2.0. Ecovacs, Deebot and GOAT are trademarks of their owner; this
project is not affiliated with Ecovacs.
