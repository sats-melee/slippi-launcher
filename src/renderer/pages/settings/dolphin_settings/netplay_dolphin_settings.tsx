import { DolphinLaunchType } from "@dolphin/types";

import { DolphinSettings } from "./dolphin_settings";
import { LocalDolphinSettings } from "./local_dolphin_settings";

export const NetplayDolphinSettings = () => {
  return (
    <>
      <LocalDolphinSettings />
      <DolphinSettings dolphinType={DolphinLaunchType.NETPLAY} />
    </>
  );
};
