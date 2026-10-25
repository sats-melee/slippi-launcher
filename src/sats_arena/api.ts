/* eslint-disable import/no-default-export */
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
import type { SatsArenaService } from "./types";

const satsArenaApi: SatsArenaService = {
  async launchLocalGame() {
    await ipc_satsArenaLaunchLocalGame.renderer!.trigger({});
  },
  async getServerStatus() {
    const { result } = await ipc_satsArenaGetServerStatus.renderer!.trigger({});
    return result;
  },
  async startServer() {
    const { result } = await ipc_satsArenaStartServer.renderer!.trigger({});
    return result;
  },
  async stopServer() {
    const { result } = await ipc_satsArenaStopServer.renderer!.trigger({});
    return result;
  },
  async getServerLogs() {
    const { result } = await ipc_satsArenaGetServerLogs.renderer!.trigger({});
    return result.logs;
  },
  async getNwcInfo() {
    const { result } = await ipc_satsArenaGetNwcInfo.renderer!.trigger({});
    return result;
  },
  async setNwcUri(uri: string) {
    const { result } = await ipc_satsArenaSetNwcUri.renderer!.trigger({ uri });
    return result;
  },
  async clearNwcUri() {
    const { result } = await ipc_satsArenaClearNwcUri.renderer!.trigger({});
    return result;
  },
  async checkServer(url: string) {
    const { result } = await ipc_satsArenaCheckServer.renderer!.trigger({ url });
    return result;
  },
  onServerStatusChange(handle) {
    const { destroy } = ipc_satsArenaServerStatusEvent.renderer!.handle(async ({ status }) => {
      handle(status);
    });
    return destroy;
  },
};

export default satsArenaApi;
