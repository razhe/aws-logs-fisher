# AWS Logs Fisher

Desktop app (Electron) for reviewing the CloudWatch logs of anything deployed on AWS (ECS, Lambda, etc.) without fighting the console: follow them live, search the past, and "fish" out the lines you care about. It relies on the AWS CLI and the `saml2aws` session you already have; it never handles credentials on its own.

> Independent project, not affiliated with Amazon Web Services. Tested on Windows. The user interface is in Spanish.

## Features

- **ECS services**: lists clusters and shows the health of each service (healthy, degraded, down, stopped). From each row you open its live or historical logs.
- **Live logs**: equivalent to `aws logs tail <group> --follow`, with server-side CloudWatch filtering, stream prefix, and log group autocomplete.
- **Historical logs**: searches for a term over a period (15 minutes to 7 days, or custom dates) with `aws logs filter-log-events`. Supports case-insensitive matching, advanced CloudWatch filter patterns, cancellation, and copying results.
- **Fishing net**: text or regex rules that highlight matching lines and capture them in a table. Click a row to jump to that line; the panel can be resized, minimized, or maximized, and captures are copied as TSV.
- **Guided SAML login**: signs in with `saml2aws` from the app, with a role picker when you have several roles (it remembers the last one).
- **Light/dark theme**, following the system by default.
- Any log group (Lambdas or others) can be opened from the **Log group** field of the Services tab.

## Requirements

- Node.js 24.22.1 or later (see `.nvmrc`). With nvm: `nvm install 24.22.2` and `nvm use 24.22.2`.
- [AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) on your `PATH`.
- [saml2aws](https://github.com/Versent/saml2aws) on your `PATH`, already configured for your identity provider (`saml2aws configure`).
- A profile in `~/.aws/config`; the SAML login writes the credentials there.
- Region: the app uses your profile's region (`aws configure get region`). If it has none, pick one in the header selector (it is remembered).

## Download

Grab `AWS-Logs-Fisher-<version>-portable.exe` from the [Releases](https://github.com/razhe/aws-logs-fisher/releases) page and run it; no installation needed. You still need the AWS CLI and `saml2aws` installed (see Requirements).

The executable is not code-signed, so Windows SmartScreen may warn you: click **More info → Run anyway**.

## Run from source

```bash
git clone https://github.com/razhe/aws-logs-fisher.git
cd aws-logs-fisher
npm install
npm start
```

1. Click **Iniciar sesión SAML** (SAML sign-in) and complete the login, MFA included, in the browser. The app runs `saml2aws list-roles`, stores the SAML response in a temporary file and, once you pick a role, runs `saml2aws login --role <role>` reusing that response. The temporary file is always deleted when finished. The session is checked on startup and every 2 minutes.
2. In the **Servicios** (Services) tab, pick a cluster and, on a service row, open **Logs en vivo** (live logs) or **Logs históricos** (historical logs). Each one opens a new tab.
3. In a live tab, adjust the log group, prefix, start time, and filter, then click Iniciar (Start). Add rules in the fishing net to highlight and capture lines.
4. In a historical tab, choose the period, type a term, and click Buscar (Search). It is a one-off query: it does not update live.

Per-tab memory limits: 20,000 log lines (trimmed to the most recent 15,000) and 5,000 captures. Historical searches return up to 20,000 results.

## Tests

```bash
npm test
```

## Building a release

```bash
npm run dist
```

This produces `dist/AWS-Logs-Fisher-<version>-portable.exe` (Windows, x64). To publish it: bump `version` in `package.json`, commit, then create a release on GitHub with a `v<version>` tag and attach the `.exe`.

## Security and privacy

- The app never reads or stores credentials; it only invokes `aws` and `saml2aws`. It makes no network calls of its own and sends no telemetry.
- The only things it stores locally (Electron storage, outside the repository) are the theme, the region, and the last selected role.
- Processes are launched with `execFile`/`spawn` without a shell; profile, region, cluster, log group, and prefix are validated against allow-lists of characters and cannot start with `-`.
- The renderer runs with `contextIsolation`, without `nodeIntegration`, sandboxed, and with a strict CSP.
- The app's logs and screenshots may expose account numbers and sensitive content from your services: do not attach them to issues or public repositories.

## Icon

The source is `assets/icon.svg`. The 16–48 px sizes of the `.ico` and the header logo use `assets/icon-small.svg`: the same design with thicker strokes and a light border so it stands out on a dark taskbar. If you change one, apply the same change to the other. `assets/icon-simplificado.svg` and `assets/icon-detallado.svg` are earlier versions. To regenerate `assets/icon.png` (512 px) and `assets/icon.ico` (16–256 px):

```bash
npm run icons
```

## Project structure

```
main.js          Electron main process (window and IPC)
preload.js       API exposed to the renderer (contextBridge)
src/aws.js       AWS CLI calls: ECS, log groups, tail, and search
src/saml.js      two-step login with saml2aws
renderer/        user interface (plain HTML, CSS, and JS)
scripts/         icon generation
test/            tests (node --test)
```

## License

[MIT](LICENSE)
