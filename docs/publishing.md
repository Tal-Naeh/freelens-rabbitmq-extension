# Publishing and releases

How this package reaches npm and GitHub Releases. See also [CONTRIBUTING.md](../CONTRIBUTING.md).

## Package requirements

1. **Name in a scope you own.** The template name was `@freelensapp/rabbitmq-extension`; the `@freelensapp` scope belongs to
   the Freelens org, npm would reject it. We renamed to `@tal-naeh/freelens-rabbitmq-extension` (`package.json` → `name`).
   A scoped name is only publishable by the npm **user** `tal-naeh` or an **org** called `tal-naeh`.
2. **`publishConfig.access: "public"`** — scoped packages are private by default; without this, publish fails (or would bill).
3. **`files: ["out/**/*"]`** — only the built output ships. `LICENSE`, `README.md`, `package.json` are always included.
4. **`repository.url`** must point at the real GitHub repo — required for provenance (see Step 4).
5. **Version bump**: `pnpm version 0.2.0 --no-git-tag-version` (wrapped as `pnpm bump-version`).
6. Verify what will be uploaded: `pnpm publish --dry-run` prints the file list and size (1.5 MB, 1860 files).


## First-time manual publish: login

```sh
npm login          # browser flow; then `npm whoami` → tal-naeh
```

## Two-factor authentication

The first `pnpm publish --access public` failed:

```text
403 Two-factor authentication or granular access token with bypass 2fa enabled is required to publish packages.
```

npm no longer lets you publish with just a password session. Options:

- enable 2FA on the account (we used a **security key / Touch ID passkey**; a TOTP app also works), or
- a *granular access token* with "bypass 2FA" — npm is deprecating that route, avoid it.

With a security key the CLI needs an **interactive terminal**: it prints an `https://www.npmjs.com/auth/cli/…` URL,
`npm view` saw `0.2.0` (registry replicas lag ~30–60 s).

## First publish (manual, once)

```sh
cd ~/Documents/GitHub/private/freelens-rabbitmq-extension
pnpm publish --access public --no-git-checks
npm view @tal-naeh/freelens-rabbitmq-extension version   # → 0.2.0
```

`--no-git-checks` skips pnpm's "branch must be clean/main" check. After this the package **exists**, which is a
prerequisite for Trusted Publishing and staging (Step 4).

## Releases via GitHub Actions + npm Trusted Publishing

`.github/workflows/release.yaml` (from the Freelens template) runs on any pushed tag `v*`:
checkout → verify tag == package version → install → build → `pnpm pack` → **publish to npm** → create a **GitHub Release**
with the `.tgz` attached (`softprops/action-gh-release`).

Two ways the publish step can authenticate:

| Method | How | Trade-off |
| --- | --- | --- |
| `NPM_TOKEN` secret | granular token stored as a repo secret, `NODE_AUTH_TOKEN` | a long-lived secret to protect; npm is restricting 2FA-bypass tokens |
| **Trusted Publishing (OIDC)** — what we use | GitHub Actions presents a short-lived identity token; npm checks it against the publisher you configured | no secret at all, signed **provenance** for free |

Configure it once on npmjs.com → package → Settings → **Trusted Publisher** → GitHub Actions:

| Field | Value |
| --- | --- |
| User / org | `Tal-Naeh` |
| Repository | `freelens-rabbitmq-extension` |
| Workflow filename | `release.yaml` |
| Environment | `publishing` (the job has `environment: publishing`) |
| Allowed actions | **staged only** (npm's recommendation) |

The workflow needs `permissions: id-token: write` (present) and `NPM_CONFIG_PROVENANCE=true` so the publish is signed and
recorded in the Sigstore transparency log (the run log prints the `search.sigstore.dev` link).

### Staged publishing

Because we chose "staged only", a direct `npm publish` from CI is refused with
`403 OIDC permission denied for this action`. The workflow therefore runs:

```sh
NPM_CONFIG_PROVENANCE=true npm stage publish --access public --tag latest
```

which uploads the version in a **not-yet-public** state ("staged with id …"). A human then approves it, which is where the
2FA/proof-of-presence happens:

```sh
npm stage list @tal-naeh/freelens-rabbitmq-extension
npm stage approve <stage-id>        # or click Approve on the package's "Staged versions" page
```

Only after approval does `dist-tags.latest` move and installs by name get the new version.


## Release routine

```sh
pnpm bump-version 0.2.2                  # edits package.json
# update CHANGELOG.md, commit
git tag -a v0.2.2 -m "v0.2.2" && git push origin main v0.2.2
# CI: build → test → `npm stage publish` → GitHub Release with .tgz
npm stage approve <id>                   # or approve on npmjs.com  → live
npm view @tal-naeh/freelens-rabbitmq-extension dist-tags
```

Rules: the tag must equal `package.json` version (the workflow checks); tags with a `-` (e.g. `v0.3.0-rc.1`) publish under
the `next` dist-tag instead of `latest`.

## Installing

Freelens → `cmd`+`shift`+`E` → paste `@tal-naeh/freelens-rabbitmq-extension` → Install → enable. Or download the `.tgz` from
GitHub Releases and drag it into the window. Upgrades: install the same name again, then fully restart Freelens.

## Glossary

- **scope** — the `@tal-naeh/` prefix; a namespace owned by an npm user or org.
- **dist-tag** — a movable label (`latest`, `next`) pointing at a version; `npm install name` resolves `latest`.
- **provenance** — a signed statement linking the published tarball to the exact GitHub commit + workflow run that built it.
- **OIDC / Trusted Publishing** — CI proves its identity with a short-lived token instead of a stored secret.
- **staged publish** — uploaded but hidden until a human with 2FA approves.
