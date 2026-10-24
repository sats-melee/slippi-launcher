import { css } from "@emotion/react";

// Keep the shared helper name for existing settings components, but don't use
// Project Slippi's logo as the Arena launcher's background.
export const withSlippiBackground = css`
  &::before {
    content: "";
    background-image: radial-gradient(ellipse at bottom right, rgb(247 147 26 / 8%), transparent 65%);
    background-repeat: no-repeat;
    position: fixed;
    top: 0;
    height: 100%;
    width: 100%;
    pointer-events: none;
    z-index: -1;
  }
`;
