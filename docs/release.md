# Local production release

With `slippi-launcher`, `Ishiiruka`, `sats-arena`, and `slippi-ssbm-asm` next to
one another, run this from the launcher checkout (or the workspace Makefile):

```sh
make app
```

This builds the assembly hooks and native Release game, packages the Electron
launcher as an AppImage, installs it, configures the existing Melee 1.02 ISO,
and opens the production launcher. It installs no desktop shortcut.
The release contains its native executable, libraries, and game resources;
playing does not depend on paths into the build checkout. The Ubuntu
`slippi-arena-build` Distrobox remains the native runtime on this Linux machine.

The setup reuses an installed Node 20+ or downloads a checksum-verified,
user-local Node toolchain, installs npm dependencies when needed, and creates
the native build container if absent. Host prerequisites are Python 3,
Distrobox with a working container engine, and the usual download/archive
tools. No host system packages are replaced. A legally obtained NTSC-U Melee
1.02 disc must already exist; none is downloaded. Existing launcher and Dolphin
configuration and Downloads are checked for it. If none is found, choose it
in the launcher.

`make release` builds and installs without opening. To reopen the installed
release without rebuilding, run `~/.local/bin/sats-arena`. `make dev` retains
the development launcher with hot reload. Build logs are in `.release/`;
launcher output starts fresh in `~/.local/state/sats-arena/launcher.log`
(or `$XDG_STATE_HOME/sats-arena/launcher.log`).

For payment development, use `make sandbox` or `make sandbox-agent`; see
[sandbox.md](sandbox.md) for reusable test wallets and controller automation.
The saved live NWC credential and other settings are preserved.
Configure NWC in the launcher as described in [native-wallet.md](native-wallet.md).
The local fork disables automatic installation of upstream launcher updates. Updating this build means running `make app` again.

Run `make test` for isolated installer and bundle integration tests. These use
temporary homes and fake credentials and never send Lightning payments.

# GitHub releases

`build.yml` builds Linux, Windows and Intel macOS launcher packages on `main`,
version tags (`v*`), pull requests, or manual dispatch. It retains the macOS ZIPs
required by updater metadata and fails if a platform's installers are missing.

The workflow pins the native Arena and server source commits. The native game
comes from the same Arena build workflow used for standalone Dolphin releases. Windows
includes the wallet checker, its Rust DLL, and the Microsoft C++ runtime DLLs.
macOS ships an Intel launcher,
server and Dolphin together; Apple Silicon requires Rosetta 2. Native Apple
Silicon packages are not built until the game and its libraries support them.

CI checks the staged runtime and the runtime extracted from the installers
(and macOS updater ZIP): all required executables/libraries must be x86_64,
the wallet checker must reject an offline invalid configuration, and the server
must answer `/health` over loopback. Changing a dependency requires updating
its pinned commit after its platform build succeeds.

Publish a release for a pushed version tag. `release.yml` resolves that exact
tag to a commit, waits up to 30 minutes for a successful `build.yml` run of the
same commit, and downloads its three named platform artifacts. It requires all
installers, updater ZIPs and metadata before uploading to the existing release.
It never substitutes artifacts from a later `main` commit. The job grants its
own GITHUB_TOKEN `actions: read` and `contents: write`; release uploads do not
need the cross-repository PAT used to fetch native build dependencies.

For a rehearsal, create a temporary draft release for a test tag containing the
workflow changes, then dispatch **Upload Latest Artifacts to Release** with:

- `tag`: the draft release's tag.
- `build_run_id`: optional explicit successful build of that tag's commit.
- `upload`: false validates only; true uploads to the existing draft/release.

Inspect the job summary's commit, build URL and asset list. A draft rehearsal
does not change the public latest release or website downloads. Delete only the
rehearsal draft and its test tag after checking the assets. Missing or expired
artifacts fail closed; rebuild a tag containing the current build workflow
before retrying. Older builds that discarded updater ZIPs are not complete
release sources.

Run the release-selection checks locally with:

```sh
python3 -m unittest discover -s scripts -p 'test_release_artifacts.py'
```
