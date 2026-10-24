import { describe, expect, it } from "vitest";

import type { HostSettings } from "./server_config";
import { buildServerConfig } from "./server_config";

const settings: HostSettings = {
  satsArenaHostPort: 8737,
  satsArenaHostAllowRemote: false,
  satsArenaInviteCode: "friends",
  satsArenaWalletBackend: "nwc",
  satsArenaSatsPerPercent: 2,
  satsArenaWinSats: 100,
  satsArenaMaxDepositSats: 50000,
};

describe("buildServerConfig", () => {
  it("writes a config that only listens locally by default", () => {
    const toml = buildServerConfig(settings, "/data/sats-arena.db");
    expect(toml).toContain('listen = "127.0.0.1:8737"');
    expect(toml).toContain('database = "/data/sats-arena.db"');
    expect(toml).toContain('backend = "nwc"');
    expect(toml).toContain("sats_per_percent = 2");
  });

  it("never includes the NWC connection string", () => {
    expect(buildServerConfig(settings, "db")).not.toContain("nwc_uri");
  });

  it("listens on every interface when remote access is on", () => {
    const toml = buildServerConfig({ ...settings, satsArenaHostAllowRemote: true }, "db");
    expect(toml).toContain('listen = "0.0.0.0:8737"');
  });

  it("escapes quotes and backslashes", () => {
    const toml = buildServerConfig({ ...settings, satsArenaInviteCode: 'a"b\\c' }, "C:\\Users\\me\\db");
    expect(toml).toContain('invite_code = "a\\"b\\\\c"');
    expect(toml).toContain('database = "C:\\\\Users\\\\me\\\\db"');
  });

  it("rejects bad values", () => {
    expect(() => buildServerConfig({ ...settings, satsArenaInviteCode: "  " }, "db")).toThrow(/invite code/);
    expect(() => buildServerConfig({ ...settings, satsArenaHostPort: 70000 }, "db")).toThrow(/port/);
    expect(() => buildServerConfig({ ...settings, satsArenaWinSats: 1.5 }, "db")).toThrow(/win_sats/);
    expect(() => buildServerConfig({ ...settings, satsArenaMaxDepositSats: 0 }, "db")).toThrow(/max_deposit/);
  });
});
