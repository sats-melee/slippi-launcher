import { css } from "@emotion/react";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import React from "react";

import { useSetting } from "@/lib/hooks/use_settings";
import { useSettingsModal } from "@/lib/hooks/use_settings_modal";
import { useToasts } from "@/lib/hooks/use_toasts";
import { SatsArenaSettings } from "@/pages/settings/sats_arena_settings/sats_arena_settings";
import { useServices } from "@/services";

import { ArenaPageMessages as Messages } from "./arena_page.messages";

export const ArenaPage = React.memo(() => {
  const [isoPath] = useSetting("isoPath");
  const { open } = useSettingsModal();
  const { satsArenaService } = useServices();
  const { showError } = useToasts();
  const [launching, setLaunching] = React.useState(false);
  const play = async () => {
    setLaunching(true);
    try {
      await satsArenaService.launchLocalGame();
    } catch (error) {
      showError(error);
    } finally {
      setLaunching(false);
    }
  };

  return (
    <main
      css={css`
        width: 100%;
        max-width: 1000px;
        margin: 0 auto;
        padding: 32px;
        box-sizing: border-box;
      `}
    >
      <Typography variant="h4" component="h1">
        {Messages.title()}
      </Typography>
      <Typography
        color="text.secondary"
        css={css`
          margin: 8px 0 20px;
        `}
      >
        {Messages.description()}
      </Typography>
      <Button
        variant="contained"
        disabled={!isoPath || launching}
        onClick={play}
        css={css`
          margin-right: 8px;
        `}
      >
        {launching ? Messages.launching() : Messages.playLocal()}
      </Button>
      <Button variant="outlined" color="secondary" onClick={() => open("/settings/melee-options")}>
        {isoPath ? Messages.gameSettings() : Messages.chooseIso()}
      </Button>
      <section
        css={css`
          margin-top: 24px;
          border-top: 1px solid var(--arena-border);
          padding-top: 16px;
        `}
      >
        <SatsArenaSettings />
      </section>
    </main>
  );
});
