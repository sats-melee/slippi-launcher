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

The saved wallet choice, NWC credential, and other settings are preserved.
Configure NWC in the launcher as described in [native-wallet.md](native-wallet.md).
The local fork disables automatic installation of upstream launcher updates. Updating this build means running `make app` again.

Run `make test` for isolated installer and bundle integration tests. These use
temporary homes and fake credentials and never send Lightning payments.
