import type { SatsArenaServerStatus } from "sats_arena/types";
import { create } from "zustand";
import { combine } from "zustand/middleware";

export const useSatsArenaServerStore = create(
  combine({ status: { state: "stopped" } as SatsArenaServerStatus }, (set) => ({
    setStatus: (status: SatsArenaServerStatus) => set({ status }),
  })),
);
