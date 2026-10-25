import { css } from "@emotion/react";
import styled from "@emotion/styled";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { useCallback, useMemo, useRef, useState } from "react";

import { useDolphinActions } from "@/lib/dolphin/use_dolphin_actions";
import { DolphinStatus, useDolphinStore } from "@/lib/dolphin/use_dolphin_store";
import { useSettings } from "@/lib/hooks/use_settings";
import { useSettingsModal } from "@/lib/hooks/use_settings_modal";
import { useToasts } from "@/lib/hooks/use_toasts";
import { useServices } from "@/services";
import { platformTitleBarStyles } from "@/styles/platform_title_bar_styles";

import { HeaderMessages as Messages } from "./header.messages";
import type { MenuItem } from "./main_menu";
import { MainMenu } from "./main_menu";
import { PlayButton as PlayButtonImpl, UpdatingButton } from "./play_button/play_button";

const OuterBox = styled(Box)`
  background: linear-gradient(110deg, var(--arena-surface), var(--arena-background));
  border-bottom: 1px solid var(--arena-border);
  height: 70px;
`;

export const Header = ({ menuItems }: { menuItems: readonly MenuItem[] }) => {
  const { dolphinService, satsArenaService } = useServices();
  const { open } = useSettingsModal();
  const meleeIsoPath = useSettings((store) => store.settings.isoPath) || undefined;
  const { showError } = useToasts();
  const { launchNetplay } = useDolphinActions(dolphinService);
  const [launchingLocal, setLaunchingLocal] = useState(false);
  const localPending = useRef(false);

  const onLocal = async () => {
    if (!meleeIsoPath) {
      showError(Messages.noMeleeIsoFile());
      open("/settings/melee-options");
      return;
    }
    if (localPending.current) {
      return;
    }
    localPending.current = true;
    setLaunchingLocal(true);
    try {
      await satsArenaService.launchLocalGame();
    } catch (error) {
      showError(error);
    } finally {
      localPending.current = false;
      setLaunchingLocal(false);
    }
  };

  const onPlay = useCallback(() => {
    if (!meleeIsoPath) {
      showError(Messages.noMeleeIsoFile());
      open("/settings/melee-options");
      return;
    }

    // Launch the game normally, without a launcher account gate. Dolphin
    // still enforces authentication if a player uses Slippi's online service.
    launchNetplay(false);
  }, [launchNetplay, meleeIsoPath, open, showError]);

  return (
    <OuterBox
      css={css`
        display: flex;
        justify-content: space-between;
        ${platformTitleBarStyles()}
      `}
    >
      <div
        css={css`
          display: flex;
          align-items: center;
          padding-left: 20px;
        `}
      >
        <Typography
          variant="h6"
          css={css`
            color: var(--arena-accent);
            font-weight: 700;
            white-space: nowrap;
          `}
        >
          {Messages.arenaTitle()}
        </Typography>
        <div
          css={css`
            margin: 0 10px;
            display: flex;
            gap: 8px;
          `}
        >
          <PlayButton onClick={() => onPlay()} />
          <PlayButtonImpl
            label={launchingLocal ? Messages.launchingLocal() : Messages.local()}
            disabled={launchingLocal}
            onClick={onLocal}
          />
        </div>
        <MainMenu menuItems={menuItems} />
      </div>
      <Box display="flex" alignItems="center">
        <Tooltip title={Messages.settings()}>
          <IconButton
            onClick={() => open()}
            css={css`
              opacity: 0.5;
              margin-right: 10px;
            `}
            size="large"
            aria-label={Messages.settings()}
          >
            <SettingsOutlinedIcon />
          </IconButton>
        </Tooltip>
      </Box>
    </OuterBox>
  );
};

const PlayButton = ({ onClick }: { onClick: () => void }) => {
  const installStatus = useDolphinStore((store) => store.netplayStatus);
  const installProgress = useDolphinStore((store) => store.netplayDownloadProgress);
  const fillPercent = useMemo(() => {
    if (installStatus === DolphinStatus.READY) {
      return 1;
    }
    if (installProgress && installProgress.total > 0) {
      return installProgress.current / installProgress.total;
    }
    return 0;
  }, [installProgress, installStatus]);

  if (installStatus === DolphinStatus.READY) {
    return <PlayButtonImpl label={Messages.online()} onClick={onClick} />;
  }

  return <UpdatingButton onClick={onClick} fillPercent={fillPercent} />;
};
