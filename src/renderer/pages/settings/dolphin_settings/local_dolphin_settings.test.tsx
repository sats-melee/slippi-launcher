import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { LocalDolphinSettings } from "./local_dolphin_settings";

const mocks = vi.hoisted(() => ({ configure: vi.fn(), showError: vi.fn() }));
vi.mock("@/services", () => ({ useServices: () => ({ satsArenaService: { configureLocalGame: mocks.configure } }) }));
vi.mock("@/lib/hooks/use_toasts", () => ({ useToasts: () => ({ showError: mocks.showError }) }));
vi.mock("../setting_item_section", () => ({ SettingItem: ({ children }: { children: React.ReactNode }) => children }));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it("opens the Local Dolphin configuration and shows an already-open error", async () => {
  const error = new Error("Close the local Arena game or its settings window first");
  mocks.configure.mockRejectedValue(error);
  render(<LocalDolphinSettings />);
  fireEvent.click(screen.getByRole("button", { name: "Configure Local Dolphin" }));
  await waitFor(() => expect(mocks.showError).toHaveBeenCalledWith(error));
  expect(mocks.configure).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button").hasAttribute("disabled")).toBe(false);
});
