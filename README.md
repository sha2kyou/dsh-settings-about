# dsh-settings-about

[English](README.md) | [中文](README.zh.md)

DeepSeek Harness (`dsh`) plugin that adds **Settings → About**: verified runtime facts from the *currently running* `dsh` process, plus an installed-plugin inventory (id, module, version, enabled, fiber phase).

![Settings → About](docs/settings-about.png)

## Version requirements (important)

| Requirement | Constraint |
| --- | --- |
| **dsh** | **`@deepseek-ai/dsh@0.1.1-rc.1` only** (the `0.1.1-rc.*` line with credentials document **version 1**) |
| **Not supported** | `@deepseek-ai/dsh@0.1.0-rc.*` and older (flat `.credentials.yaml` without `version` / `refs`) |
| **Profile** | **`web` only** (this package ships a browser `dsh.client` UI) |
| **Node.js** | Whatever **that** dsh release requires (typically Node `^22.19 \|\| >=24`; verify with your install) |
| **pnpm** | Required on `PATH` — `dsh plugin` forwards to pnpm |

Install / upgrade dsh first:

```sh
npm install -g @deepseek-ai/dsh@0.1.1-rc.1
dsh --version   # must print 0.1.1-rc.1
```

Credentials must use the v1 layout (`version: 1` + `refs:`). If you still have a pre-release flat file, start `dsh web` once on `0.1.1-rc.1` and let it migrate, or convert manually — **do not** use a `0.1.0` parser against a v1 file (or the reverse).

## Install

```sh
dsh plugin --profile web add github:sha2kyou/dsh-settings-about
dsh web
```

Local checkout:

```sh
git clone https://github.com/sha2kyou/dsh-settings-about.git
dsh plugin --profile web add ./dsh-settings-about
```

Then open **Settings → About**.

Uninstall:

```sh
dsh plugin --profile web remove dsh-settings-about
```

## Optional: About nav icon

Settings sidebar icons are hard-coded in `@deepseek-ai/dsh-client-ui-settings-general` by section id (unknown ids use the gear). To map `about` → `IconWarningOutline16`:

```sh
node scripts/patch-about-nav-icon.mjs
# restart dsh web
```

Re-run after upgrading the global `dsh` install.

## What the page shows

Values are collected from the running process only — missing data is omitted or listed under notes, never invented.

| Item | Source |
| --- | --- |
| dsh version / license / description / package name | `dirname(realpath(process.argv[1]))/../package.json` (same as `dsh` `lib/bin.js`) |
| Repository link | That `package.json` `repository.url` when convertible to http(s) |
| DSH_HOME | `@deepseek-ai/dsh-home-paths` from the same install |
| Node / platform | `process.version` / `platform` / `arch` |
| Profile / bundles | argv / profile path / `$DSH_HOME/profiles/<name>/package.json` |
| Listen | Live `webServer.host:port` |
| Installed plugins | Cordis Loader entries (+ `package.json` version when resolvable). `builtin` is derived from profile `dependencies` only (no Loader provenance). UI can hide `builtin: true`. |

## Layout

| File | Role |
| --- | --- |
| `index.js` | Host plugin — `GET /dsh-about/info` |
| `collect.js` | Snapshot builder |
| `client.js` | Browser ModuleLoader bundle — `settings.section` `about` |
| `cordis.patch.yml` | Bundle insert |
| `scripts/patch-about-nav-icon.mjs` | Optional shell icon patch |

## License

[MIT](LICENSE)
