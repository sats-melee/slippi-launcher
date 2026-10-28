import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import React from "react";

import { useToasts } from "@/lib/hooks/use_toasts";
import { useServices } from "@/services";

import { SettingItem } from "../setting_item_section";
import { LocalDolphinSettingsMessages as Messages } from "./local_dolphin_settings.messages";

export const LocalDolphinSettings = () => {
  const { satsArenaService } = useServices();
  const { showError } = useToasts();
  const [opening, setOpening] = React.useState(false);
  const configure = async () => {
    setOpening(true);
    try {
      await satsArenaService.configureLocalGame();
    } catch (error) {
      showError(error);
    } finally {
      setOpening(false);
    }
  };
  return (
    <section>
      <Typography variant="h5">{Messages.title()}</Typography>
      <SettingItem name={Messages.configure()} description={Messages.description()}>
        <Button variant="contained" onClick={configure} disabled={opening}>
          {Messages.configure()}
        </Button>
      </SettingItem>
    </section>
  );
};
