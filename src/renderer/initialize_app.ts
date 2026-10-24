import { DolphinLaunchType } from "@dolphin/types";
import log from "electron-log";

import type { Services } from "@/services/types";

import { InitializeAppMessages as Messages } from "./initialize_app.messages";

export async function initializeApp(services: Services) {
  const { dolphinService, notificationService } = services;
  const { showError } = notificationService;

  log.info("Initializing app...");

  const promises: Promise<any>[] = [];

  // Arena doesn't restore Slippi accounts, fetch their data, or run their
  // sign-in/policy wizard. Keep existing Dolphin play keys untouched.

  // Playback is hidden, so don't install an unused second emulator on startup.
  [DolphinLaunchType.NETPLAY].forEach((dolphinType) => {
    void dolphinService.downloadDolphin(dolphinType).catch((err) => {
      log.error(err);
      const dolphinTypeName =
        dolphinType === DolphinLaunchType.NETPLAY ? Messages.netplayDolphin() : Messages.playbackDolphin();
      showError(Messages.failedToInstallDolphin(dolphinTypeName));
    });
  });

  // Check if there is an update to the launcher
  promises.push(window.electron.common.checkForAppUpdates());

  // Ensure the fonts are loaded to prevent FOUT (Flash of Unstyled Text)
  promises.push(document.fonts.ready);

  // Wait for all the promises to complete before returning
  const results = await Promise.allSettled(promises);
  results
    .filter((result): result is PromiseRejectedResult => result.status === "rejected")
    .forEach((result) => {
      log.error(result.reason);
    });

  // Show the update result after awaiting the promises since we load the app
  // via React.Suspense so nothing is visible anyway while the promises are being awaited.
  const updateState = window.electron.bootstrap.updateState;
  if (updateState) {
    if (updateState.status === "succeeded") {
      notificationService.showInfo(Messages.updatedToVersion(updateState.version));
    } else {
      showError(Messages.updateFailed(updateState.version));
    }
  }
}
