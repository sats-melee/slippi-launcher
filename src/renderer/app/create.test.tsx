import { cleanup, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Services } from "@/services/types";

import { createApp } from "./create";

vi.mock("@/lib/hooks/use_app_store", () => ({
  useAppStore: (select: (state: { currentLanguage: string }) => unknown) => select({ currentLanguage: "en" }),
}));
vi.mock("@/lib/hooks/use_last_page", () => ({ useLastPageTracker: () => undefined }));
vi.mock("@/lib/hooks/use_page_request_listeners", () => ({ usePageRequestListeners: () => undefined }));
vi.mock("@/lib/hooks/use_shortcuts", () => ({ usePageNavigationShortcuts: () => undefined }));
vi.mock("@/services", () => ({
  createServiceProvider: () => ({ ServiceProvider: ({ children }: React.PropsWithChildren) => <>{children}</> }),
}));
vi.mock("@/pages/arena/arena_page", () => ({ ArenaPage: () => <div>Arena screen</div> }));
vi.mock("@/pages/settings/create", () => ({ createSettingsPage: () => ({ Page: () => <div>Settings screen</div> }) }));
vi.mock("@/app/header/header", () => ({
  Header: ({ menuItems }: { menuItems: { subpath: string; title: () => string }[] }) => (
    <nav>
      {menuItems.map((item) => (
        <span key={item.subpath}>{item.title()}</span>
      ))}
    </nav>
  ),
}));
vi.mock("@/components/persistent_notification/persistent_notification", () => ({ PersistentNotification: () => null }));
vi.mock("@/components/rosetta_install_dialog/rosetta_install_dialog", () => ({ RosettaInstallDialog: () => null }));

afterEach(cleanup);

describe("Arena navigation", () => {
  it.each(["/", "/landing", "/main/home", "/main/replays", "/main/spectate", "/main/console", "/main/arena"])(
    "opens Arena instead of legacy screens for %s",
    async (route) => {
      window.location.hash = `#${route}`;
      const { App } = createApp({ services: {} as Services });
      render(<App />);
      await waitFor(() => expect(screen.getByText("Arena screen")).toBeTruthy());
      expect(screen.getByRole("navigation").textContent).toBe("Arena");
      expect(window.location.hash).toBe("#/main/arena");
    },
  );

  it("keeps settings accessible without an account", async () => {
    window.location.hash = "#/settings/sats-arena";
    const { App } = createApp({ services: {} as Services });
    render(<App />);
    await waitFor(() => expect(screen.getByText("Settings screen")).toBeTruthy());
  });
});
