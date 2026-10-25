/* eslint-disable import/no-default-export */
import type { SettingsManager } from "@settings/settings_manager";
import { app } from "electron";
import electronLog from "electron-log";
import path from "path";

import {
  ipc_satsArenaCheckServer,
  ipc_satsArenaClearNwcUri,
  ipc_satsArenaGetNwcInfo,
  ipc_satsArenaGetServerLogs,
  ipc_satsArenaGetServerStatus,
  ipc_satsArenaLaunchLocalGame,
  ipc_satsArenaServerStatusEvent,
  ipc_satsArenaSetNwcUri,
  ipc_satsArenaStartServer,
  ipc_satsArenaStopServer,
} from "./ipc";
import { SatsArenaNativeGame } from "./native_game_process";
import { NwcSecretStore } from "./nwc_secret_store";
import { checkHealth, SatsArenaServerProcess } from "./server_process";

const log = electronLog.scope("sats_arena");

export default function setupSatsArenaIpc({ settingsManager }: { settingsManager: SettingsManager }) {
  const secrets = new NwcSecretStore(path.join(app.getPath("userData"), "sats-arena"));
  const nativeGame = new SatsArenaNativeGame(settingsManager, secrets);
  ipc_satsArenaLaunchLocalGame.main!.handle(async () => {
    await nativeGame.start();
    return {};
  });
  const server = new SatsArenaServerProcess(settingsManager, secrets, (status) => {
    ipc_satsArenaServerStatusEvent.main!.trigger({ status }).catch(log.error);
  });

  ipc_satsArenaGetServerStatus.main!.handle(async () => server.getStatus());
  ipc_satsArenaStartServer.main!.handle(async () => {
    if (settingsManager.get().settings.satsArenaMode !== "host") {
      throw new Error("Select Host a server first");
    }
    return server.start();
  });
  ipc_satsArenaStopServer.main!.handle(async () => server.stop());
  ipc_satsArenaGetServerLogs.main!.handle(async () => ({ logs: server.getLogs() }));
  ipc_satsArenaGetNwcInfo.main!.handle(async () => secrets.info());
  ipc_satsArenaSetNwcUri.main!.handle(async ({ uri }) => secrets.set(uri));
  ipc_satsArenaClearNwcUri.main!.handle(async () => secrets.clear());
  ipc_satsArenaCheckServer.main!.handle(async ({ url }) => checkHealth(url));

  // Leaving host mode shuts down the local server.
  settingsManager.onSettingChange("satsArenaMode", async (mode) => {
    if (mode !== "host") {
      await server.stop();
    }
  });

  // Give the child time to close its database instead of leaving an orphan.
  let readyToQuit = false;
  let quitting = false;
  app.on("before-quit", (event) => {
    if (!readyToQuit) {
      event.preventDefault();
      if (!quitting) {
        quitting = true;
        void server.stop().finally(() => {
          readyToQuit = true;
          app.quit();
        });
      }
    }
  });
}
