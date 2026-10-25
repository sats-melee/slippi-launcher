import type { EmptyPayload } from "utils/ipc";
import { _, makeEndpoint } from "utils/ipc";

import type { SatsArenaNwcInfo, SatsArenaServerStatus } from "./types";

export const ipc_satsArenaGetServerStatus = makeEndpoint.main(
  "satsArena_getServerStatus",
  <EmptyPayload>_,
  <SatsArenaServerStatus>_,
);

export const ipc_satsArenaStartServer = makeEndpoint.main(
  "satsArena_startServer",
  <EmptyPayload>_,
  <SatsArenaServerStatus>_,
);

export const ipc_satsArenaStopServer = makeEndpoint.main(
  "satsArena_stopServer",
  <EmptyPayload>_,
  <SatsArenaServerStatus>_,
);

export const ipc_satsArenaGetServerLogs = makeEndpoint.main(
  "satsArena_getServerLogs",
  <EmptyPayload>_,
  <{ logs: string }>_,
);

export const ipc_satsArenaGetNwcInfo = makeEndpoint.main("satsArena_getNwcInfo", <EmptyPayload>_, <SatsArenaNwcInfo>_);

export const ipc_satsArenaSetNwcUri = makeEndpoint.main("satsArena_setNwcUri", <{ uri: string }>_, <SatsArenaNwcInfo>_);

export const ipc_satsArenaClearNwcUri = makeEndpoint.main(
  "satsArena_clearNwcUri",
  <EmptyPayload>_,
  <SatsArenaNwcInfo>_,
);

export const ipc_satsArenaCheckServer = makeEndpoint.main(
  "satsArena_checkServer",
  <{ url: string }>_,
  <{ ok: boolean; message: string }>_,
);

// Events

export const ipc_satsArenaServerStatusEvent = makeEndpoint.renderer(
  "satsArena_serverStatus",
  <{ status: SatsArenaServerStatus }>_,
);

export const ipc_satsArenaLaunchLocalGame = makeEndpoint.main(
  "satsArena_launchLocalGame",
  <EmptyPayload>_,
  <EmptyPayload>_,
);
