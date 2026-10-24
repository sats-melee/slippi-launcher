import type { ConsoleService } from "@console/types";
import type { SpectateRemoteService } from "@remote/types";
import type { Progress, ReplayService } from "@replays/types";
import throttle from "lodash/throttle";
import type { SatsArenaService } from "sats_arena/types";

import { getReplayPresenter } from "@/lib/hooks/use_replays";
import type { AuthService } from "@/services/auth/types";

import { useAppStore } from "../lib/hooks/use_app_store";
import { useConsoleDiscoveryStore } from "../lib/hooks/use_console_discovery";
import { useSatsArenaServerStore } from "../lib/hooks/use_sats_arena_server";
import { useSpectateRemoteServerStateStore } from "../lib/hooks/use_spectate_remote_server";
import type { NotificationService } from "../services/notification/types";
import type { Services } from "../services/types";
import { installDolphinListeners } from "./install_dolphin_listeners";
import { installSettingsChangeListeners } from "./install_settings_change_listeners";

export function installAppListeners(services: Services) {
  const {
    authService,
    consoleService,
    notificationService,
    dolphinService,
    spectateRemoteService,
    replayService,
    satsArenaService,
  } = services;

  // No Slippi account/session subscriptions in the Arena launcher.

  window.electron.common.onAppUpdateReady(() => {
    useAppStore.getState().setUpdateReady(true);
  });

  window.electron.common.onAppUpdateDownloadProgress((progress) => {
    useAppStore.getState().setUpdateDownloadProgress(progress);
  });

  window.electron.common.onAppUpdateFound((version) => {
    useAppStore.getState().setUpdateVersion(version);
  });

  // Track online/offline status
  window.addEventListener("online", () => {
    useAppStore.getState().setIsOnline(true);
  });
  window.addEventListener("offline", () => {
    useAppStore.getState().setIsOnline(false);
  });

  installDolphinListeners({ dolphinService, notificationService });
  installConsoleListeners({ consoleService, notificationService });
  installSettingsChangeListeners({ replayService, authService, replayBrowserEnabled: false });
  installSpectateListeners({ spectateRemoteService });
  installSatsArenaListeners({ satsArenaService });
}

function installConsoleListeners(services: {
  consoleService: ConsoleService;
  notificationService: NotificationService;
}) {
  const { consoleService, notificationService } = services;
  // Update the discovered console list
  consoleService.onDiscoveredConsolesUpdated((consoles) => {
    useConsoleDiscoveryStore.getState().updateConsoleItems(consoles);
  });

  // Update the mirroring console status
  consoleService.onConsoleMirrorStatusUpdated((status) => {
    useConsoleDiscoveryStore.getState().updateConsoleStatus(status);
  });

  consoleService.onConsoleMirrorErrorMessage((message) => {
    notificationService.showError(message);
  });
}

function installSpectateListeners({ spectateRemoteService }: { spectateRemoteService: SpectateRemoteService }) {
  spectateRemoteService.onSpectateRemoteServerStateChange((state) =>
    useSpectateRemoteServerStateStore.getState().setState(state),
  );
}

function installSatsArenaListeners({ satsArenaService }: { satsArenaService: SatsArenaService }) {
  const { setStatus } = useSatsArenaServerStore.getState();
  satsArenaService.onServerStatusChange(setStatus);
  void satsArenaService.getServerStatus().then(setStatus);
}

export function installReplayListeners({
  replayService,
  authService,
}: {
  replayService: ReplayService;
  authService: AuthService;
}) {
  const replayPresenter = getReplayPresenter(replayService, authService);

  const updateProgress = (progress: Progress | undefined) => replayPresenter.updateProgress(progress);
  const throttledUpdateProgress = throttle(updateProgress, 50);
  replayService.onReplayLoadProgressUpdate(throttledUpdateProgress);
}
