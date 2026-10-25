import { css } from "@emotion/react";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import React from "react";

import { useSetting } from "@/lib/hooks/use_settings";
import { useSettingsModal } from "@/lib/hooks/use_settings_modal";
import { NwcSettings } from "@/pages/settings/sats_arena_settings/sats_arena_settings";
import logo from "@/styles/images/sats-melee-logo.png";

import { ArenaPageMessages as Messages } from "./arena_page.messages";
import { LocalMatchSettings } from "./local_match_settings";

export const ArenaPage = React.memo(() => {
  const [isoPath] = useSetting("isoPath");
  const [walletBackend] = useSetting("satsArenaWalletBackend");
  const { open } = useSettingsModal();
  return (
    <main
      css={css`
        width: 100%;
        position: relative;
        display: flex;
        align-items: center;
        padding: 48px 40px;
        box-sizing: border-box;
        &::before {
          content: "";
          position: absolute;
          inset: 0;
          background: #191c24;
          opacity: 0.45;
          clip-path: polygon(0 0, 26% 0, 52% 100%, 0 100%);
          pointer-events: none;
        }
        @media (max-height: 650px) {
          align-items: flex-start;
          padding-top: 24px;
          padding-bottom: 24px;
        }
      `}
    >
      <div
        css={css`
          position: relative;
          display: grid;
          grid-template-columns: minmax(240px, 0.9fr) minmax(360px, 1.1fr);
          align-items: center;
          gap: 64px;
          width: 100%;
          max-width: 1020px;
          margin: 0 auto;
          @media (max-width: 980px) {
            gap: 32px;
          }
          @media (max-width: 760px) {
            grid-template-columns: 1fr;
            gap: 20px;
          }
        `}
      >
        <div
          css={css`
            text-align: center;
            padding-bottom: 24px;
          `}
        >
          <img
            src={logo}
            alt=""
            aria-hidden={true}
            css={css`
              display: block;
              width: 100%;
              max-width: 420px;
              margin: 0 auto 20px;
            `}
          />
          <Typography sx={{ fontSize: 15, letterSpacing: "0.035em" }}>{Messages.versus()}</Typography>
          <Typography color="text.secondary" sx={{ fontSize: 12, marginTop: 1 }}>
            {Messages.matchTypes()}
          </Typography>
        </div>
        <section aria-label={Messages.wallet()}>
          <Typography variant="h6" component="h1">
            {Messages.title()}
          </Typography>
          <Typography color="text.secondary" sx={{ marginTop: 1, marginBottom: 3, fontSize: 14, lineHeight: 1.7 }}>
            {Messages.description()}
          </Typography>
          {walletBackend === "sandbox" || walletBackend === "fake" ? (
            <>
              <Typography color="text.secondary">{Messages.sandboxActive()}</Typography>
              <Button onClick={() => open("/settings/sats-arena")}>{Messages.developerOptions()}</Button>
            </>
          ) : (
            <NwcSettings compact={true} />
          )}
          <LocalMatchSettings />
          {!isoPath && (
            <Button variant="outlined" sx={{ marginTop: 3 }} onClick={() => open("/settings/melee-options")}>
              {Messages.chooseIso()}
            </Button>
          )}
        </section>
      </div>
    </main>
  );
});
