import { IniFile } from "@dolphin/config/ini_file";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { afterEach, beforeEach, expect, it } from "vitest";

import { prepareLocalGameProfile } from "./local_game_profile";

let folder: string;
beforeEach(async () => {
  folder = await mkdtemp(path.join(tmpdir(), "arena-local-profile-"));
});
afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

it("boots a fresh local profile to VS character selection", async () => {
  await prepareLocalGameProfile(folder);
  const ini = await readFile(path.join(folder, "GameSettings/GALE01.ini"), "utf8");
  expect(ini).toContain("041BFA20 38600002");
  expect(ini).toMatch(/\[Gecko_Enabled\][\s\S]*\$Boot to CSS/);
});

it("preserves other settings and code overrides when repairing an existing local profile", async () => {
  const iniPath = path.join(folder, "GameSettings/GALE01.ini");
  await mkdir(path.dirname(iniPath), { recursive: true });
  await writeFile(
    iniPath,
    "[Core]\nCPUThread = False\n[Gecko]\n$Boot to CSS [old]\n041BFA20 38600001\n$Custom code\n04000000 00000000\n[Gecko_Enabled]\n$Required: Slippi Online\n$Custom code\n[Gecko_Disabled]\n$Boot to CSS\n$Another global code\n",
  );
  await prepareLocalGameProfile(folder);
  const first = await readFile(iniPath, "utf8");
  await prepareLocalGameProfile(folder);
  expect(await readFile(iniPath, "utf8")).toBe(first);
  expect(first).toContain("CPUThread = False");
  expect(first).toContain("$Custom code\n04000000 00000000");
  expect(first).toContain("$Required: Slippi Online");
  expect(first).toContain("$Another global code");
  expect(first).not.toContain("38600001");
  expect(first.split("[Gecko_Disabled]")[1]).not.toContain("$Boot to CSS");
});

async function profile(name: string, pads: string, core: string): Promise<string> {
  const root = path.join(folder, name);
  await mkdir(path.join(root, "Config"), { recursive: true });
  await writeFile(path.join(root, "Config/GCPadNew.ini"), pads);
  await writeFile(path.join(root, "Config/Dolphin.ini"), core);
  return root;
}

it("imports missing bindings and matching device types for all four ports without importing other settings", async () => {
  const source = await profile(
    "dev",
    [1, 2, 3, 4]
      .map((port) => `[GCPad${port}]\nDevice = evdev/${port - 1}/Fixture Pad\nButtons/A = Button 0\n`)
      .join(""),
    "[Core]\nSIDevice0 = 12\nSIDevice1 = 6\nSIDevice2 = 6\nSIDevice3 = 6\nAdapterRumble1 = False\nCPUThread = True\n[Display]\nFullscreen = True\n",
  );
  await writeFile(path.join(source, "user.json"), "private source account");
  const target = path.join(folder, "release");
  await mkdir(path.join(target, "Config"), { recursive: true });
  await writeFile(
    path.join(target, "Config/Dolphin.ini"),
    "[Core]\nSIDevice0 = 12\nSIDevice1 = 12\nCPUThread = False\n[Display]\nFullscreen = False\n",
  );
  await prepareLocalGameProfile(target, [source]);
  const pads = await IniFile.init(path.join(target, "Config/GCPadNew.ini"));
  const config = await IniFile.init(path.join(target, "Config/Dolphin.ini"));
  for (let port = 1; port <= 4; ++port) {
    expect(pads.getSection(`GCPad${port}`)?.get("Device", "")).toBe(`evdev/${port - 1}/Fixture Pad`);
    expect(pads.getSection(`GCPad${port}`)?.get("Buttons/A", "")).toBe("Button 0");
    expect(config.getSection("Core")?.get(`SIDevice${port - 1}`, "")).toBe(port === 1 ? "12" : "6");
  }
  expect(config.getSection("Core")?.get("AdapterRumble1", "")).toBe("False");
  expect(config.getSection("Core")?.get("CPUThread", "")).toBe("False");
  expect(config.getSection("Display")?.get("Fullscreen", "")).toBe("False");
  await expect(readFile(path.join(target, "user.json"))).rejects.toMatchObject({ code: "ENOENT" });
});

it("preserves configured release controllers and imports missing ports from fallback profiles", async () => {
  const dev = await profile("dev", "[GCPad2]\nDevice = Pipe/0/test-pad\n", "[Core]\nSIDevice1 = 6\n");
  const online = await profile(
    "online",
    "[GCPad1]\nDevice = evdev/0/Online Pad\n[GCPad2]\nDevice = evdev/0/Second Pad\nButtons/A = Button 2\n",
    "[Core]\nSIDevice0 = 6\nSIDevice1 = 6\n",
  );
  const target = await profile(
    "release",
    "[GCPad1]\nDevice = evdev/0/My Pad\nButtons/A = Custom A\n",
    "[Core]\nSIDevice0 = 12\nSIDevice1 = 12\n",
  );
  await prepareLocalGameProfile(target, [path.join(folder, "missing"), dev, online]);
  const pads = await IniFile.init(path.join(target, "Config/GCPadNew.ini"));
  const core = (await IniFile.init(path.join(target, "Config/Dolphin.ini"))).getSection("Core");
  expect(pads.getSection("GCPad1")?.get("Device", "")).toBe("evdev/0/My Pad");
  expect(pads.getSection("GCPad1")?.get("Buttons/A", "")).toBe("Custom A");
  expect(core?.get("SIDevice0", "")).toBe("12");
  expect(pads.getSection("GCPad2")?.get("Device", "")).toBe("evdev/0/Second Pad");
  expect(core?.get("SIDevice1", "")).toBe("6");
  const first = await readFile(path.join(target, "Config/GCPadNew.ini"), "utf8");
  await writeFile(path.join(online, "Config/GCPadNew.ini"), "[GCPad2]\nDevice = evdev/0/Changed Later\n");
  await prepareLocalGameProfile(target, [dev, online]);
  expect(await readFile(path.join(target, "Config/GCPadNew.ini"), "utf8")).toBe(first);
});
