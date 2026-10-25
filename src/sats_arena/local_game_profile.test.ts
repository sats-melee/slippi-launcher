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
