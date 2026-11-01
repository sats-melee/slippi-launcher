# Phone rooms

Enable **Phone room** in Settings → Developer options and save the URL of your
self-hosted room service. This replaces the retired Host/Connect controls.
Open LOCAL again to apply the setting. The native sidebar shows the room's
six-character code and website address; there is no room QR code.

The backend and React SPA live in the adjacent `sats-arena/server` checkout.
See [`sats-arena/docs/phone-rooms.md`](../../sats-arena/docs/phone-rooms.md) for
build and self-hosting commands. The SPA sources are in `server/frontend`.

Players select their existing human controller slot, submit a Lightning Address,
and optionally request the desktop's entry invoice from the website. The server
relays these requests over WebSockets. All receiving checks, invoice creation,
payment confirmation, admission, damage payouts and settlement remain in the
existing desktop payment engine. It also publishes damage totals and payment
activity to the room. No controller inputs or wallet credentials are uploaded.

The room stays open across consecutive games. Player slots remain reserved for
their phones during reconnects; invoices are only delivered to the phone that
owns that slot. A server restart creates a new room code without changing local
payment records. Disabling the toggle removes the room connection on the next
LOCAL launch.

Both the launcher and native Dolphin/local Rust library need rebuilding before
trying this feature in the game. Test payment integration with Alby Sandbox.

For a phone on the same Wi-Fi, run the room server with `--bind 0.0.0.0:8738`,
keep the desktop server URL as `http://127.0.0.1:8738`, and open
`http://<this-computer-LAN-IP>:8738` on the phone. Enter the code shown in LOCAL.
Local HTTP selects the invoice for manual copying when clipboard access is
unavailable; opening it in a Lightning wallet is also supported.
The sidebar shows this LAN address automatically when the desktop connects to a
loopback server. Its larger room code and total invoice remain visible above the
player payment cards.
