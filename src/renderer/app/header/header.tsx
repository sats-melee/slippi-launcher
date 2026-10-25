import { css } from "@emotion/react";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import SportsEsportsOutlinedIcon from "@mui/icons-material/SportsEsportsOutlined";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import { useRef, useState } from "react";
import { Link } from "react-router-dom";

import { useSettings } from "@/lib/hooks/use_settings";
import { useSettingsModal } from "@/lib/hooks/use_settings_modal";
import { useToasts } from "@/lib/hooks/use_toasts";
import { AboutDialog } from "@/pages/arena/about_dialog";
import { useServices } from "@/services";
import logo from "@/styles/images/sats-melee-logo.png";
import { platformTitleBarStyles } from "@/styles/platform_title_bar_styles";

import { HeaderMessages as Messages } from "./header.messages";

export const Header = () => {
  const { satsArenaService } = useServices();
  const { open } = useSettingsModal();
  const meleeIsoPath = useSettings((store) => store.settings.isoPath) || undefined;
  const { showError } = useToasts();
  const [launchingLocal, setLaunchingLocal] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
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

  return (
    <>
      <header
        css={css`
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
          min-height: 96px;
          padding: 0 28px;
          background: var(--arena-surface);
          border-bottom: 1px solid var(--arena-border);
          ${platformTitleBarStyles()}
        `}
      >
        <div
          css={css`
            display: flex;
            align-items: center;
            gap: 32px;
          `}
        >
          <Link to="/main/arena" aria-label={Messages.home()}>
            <img
              src={logo}
              alt={Messages.arenaTitle()}
              css={css`
                display: block;
                width: 170px;
                height: 94px;
                object-fit: contain;
              `}
            />
          </Link>
          <nav
            aria-label={Messages.playModes()}
            css={css`
              display: flex;
              gap: 10px;
            `}
          >
            <Button
              variant="contained"
              disableElevation={true}
              startIcon={<SportsEsportsOutlinedIcon />}
              disabled={launchingLocal}
              onClick={onLocal}
              sx={{ minWidth: 130, height: 44, borderRadius: 1.5, fontWeight: 700 }}
            >
              {launchingLocal ? Messages.launchingLocal() : Messages.local()}
            </Button>
            <Tooltip title={Messages.onlineUnavailable()}>
              <span>
                <Button
                  variant="outlined"
                  disabled={true}
                  sx={{
                    minWidth: 116,
                    height: 44,
                    borderRadius: 1.5,
                    "&.Mui-disabled": { color: "#737680", borderColor: "#33353e", backgroundColor: "#1b1d23" },
                  }}
                >
                  {Messages.online()}
                </Button>
              </span>
            </Tooltip>
          </nav>
        </div>
        <div
          css={css`
            display: flex;
            align-items: center;
            gap: 14px;
          `}
        >
          <Button
            color="inherit"
            onClick={() => setAboutOpen(true)}
            sx={{ textTransform: "none", color: "text.secondary" }}
          >
            {Messages.about()}
          </Button>
          <Tooltip title={Messages.settings()}>
            <IconButton onClick={() => open()} aria-label={Messages.settings()} sx={{ color: "text.secondary" }}>
              <SettingsOutlinedIcon />
            </IconButton>
          </Tooltip>
        </div>
      </header>
      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </>
  );
};
