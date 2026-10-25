# Local Arena wallet handoff

Choose your Melee ISO, then press **LOCAL** in the launcher header or
**Play local Arena** on the Arena page. Both open local VS character selection
directly with the Arena payment panel. **ONLINE** retains the existing Slippi
netplay launch and its in-game login. The Wallet setting applies to local Arena,
independently of the separate server-preview mode.
Select Fake wallet for simulated funding, or Nostr Wallet Connect and save the
connection through the existing protected secret store. The renderer only gets
saved/encrypted status; it cannot read a previously saved connection string.

The local Play action launches the bundled Arena Dolphin or discovers the
neighboring `Ishiiruka/build-arena/Binaries/dolphin-emu` development build.
On Linux, an existing sibling build prefers `Ishiiruka/Tools/arena/launch-native.sh`
so SteamOS launches the Ubuntu-linked executable inside the build container.
That wrapper forwards arguments, stdin and environment without choosing its own
ISO or user profile. Empty checkouts are not treated as installed games. A
custom native executable can be selected under Local game program. The child
uses `<launcher userData>/sats-arena/dolphin-user` for its isolated Dolphin profile.
A packaged release needs the matching native build at
`assets/include/sats-arena/dolphin-emu` (`.exe` on Windows).

At launch the main process reads the selected backend and, for NWC, unlocks its
saved connection. It sends exactly one JSON line through the child's private
stdin pipe and closes that pipe:

```json
{"version":1,"backend":"nwc","nwc_uri":"<connection supplied by the secret store>"}
```

`SATS_ARENA_WALLET_CONFIG=stdin` tells the native host to read that pipe. Fake
mode sends `{"version":1,"backend":"fake"}`. The saved secret is not placed in
command-line arguments, generated Dolphin settings, the renderer, or launcher
logs. The native game owns all invoice verification and payments; the renderer
receives no wallet RPC capability. A missing or unreadable NWC connection fails
before a live game is launched. There is no silent fake-wallet fallback.

For development, `SATS_ARENA_NWC_URI` overrides the saved connection and selects
NWC. An explicit `SATS_ARENA_WALLET_BACKEND=fake|nwc` overrides the selected
backend; explicit fake plus a supplied NWC URI is rejected as conflicting.
A dev environment URI may remain in the child environment by deliberate choice;
production saved secrets only travel over stdin. The existing sats-per-percent
setting is passed as non-secret environment configuration unless explicitly
overridden for development. The native host keeps fake and live financial state
separate.

Playback, netplay and Dolphin configuration actions use the ordinary launcher
path and remove all `SATS_ARENA_*` environment values. They never unlock the
saved NWC connection or receive the private payload.

Tests spawn a real synthetic child that reads stdin, confirming backend/secret
selection, one-line framing, and no production secret in arguments/environment
or saved settings. Additional tests cover development overrides, missing live
credentials, renderer Play routing and ordinary-child environment isolation.
No test uses a real wallet or pays an invoice.


## Optional real native integration check

After building the native host, run the opt-in launcher test with your local
Melee 1.02 ISO and (optionally) the container wrapper path:

```sh
ARENA_NATIVE_E2E_ISO=/path/to/Melee.iso \
ARENA_NATIVE_E2E_BINARY=/path/to/Ishiiruka/Tools/arena/launch-native.sh \
npm test -- --project node src/sats_arena/native_game_process.e2e.test.ts
```

The test uses the actual `SatsArenaNativeGame` launcher handoff and native GUI,
forces a fake wallet, and never unlocks the saved NWC secret. It waits for native
state under a temporary isolated Dolphin profile and checks no entries are paid.
Cleanup terminates only processes bearing that exact temporary profile. Without
`ARENA_NATIVE_E2E_ISO` it is skipped; regular tests need no ISO or display.
