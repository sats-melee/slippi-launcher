import { IniFile } from "@dolphin/config/ini_file";
import path from "path";

/** Local Arena always enters VS character selection, including with a fresh profile. */
export async function prepareLocalGameProfile(
  userPath: string,
  controllerProfiles: readonly string[] = [],
): Promise<void> {
  await importMissingControllers(userPath, controllerProfiles);
  const ini = await IniFile.init(path.join(userPath, "GameSettings", "GALE01.ini"));
  let inBootCode = false;
  const codes = ini.getLines("Gecko", false).filter((line) => {
    if (line.startsWith("$")) {
      inBootCode = /^\$Boot to CSS(?:\s|$)/.test(line);
    }
    return !inBootCode;
  });
  ini.setLines("Gecko", [...codes, "$Boot to CSS [Dan Salvato, Achilles]", "041BFA20 38600002"]);
  const withoutBoot = (lines: string[]) => lines.filter((line) => line.trim() !== "$Boot to CSS");
  ini.setLines("Gecko_Enabled", [...withoutBoot(ini.getLines("Gecko_Enabled")), "$Boot to CSS"]);
  ini.setLines("Gecko_Disabled", withoutBoot(ini.getLines("Gecko_Disabled")));
  await ini.save();
}

/** Seed only unconfigured pads; never replace bindings saved in the local profile. */
async function importMissingControllers(userPath: string, sources: readonly string[]): Promise<void> {
  const pads = await IniFile.init(path.join(userPath, "Config", "GCPadNew.ini"));
  const dolphin = await IniFile.init(path.join(userPath, "Config", "Dolphin.ini"));
  let changed = false;
  for (const source of sources) {
    const sourcePads = await IniFile.init(path.join(source, "Config", "GCPadNew.ini"));
    const sourceDolphin = await IniFile.init(path.join(source, "Config", "Dolphin.ini"));
    for (let port = 0; port < 4; ++port) {
      const name = `GCPad${port + 1}`;
      if (pads.getSection(name)?.get("Device", "").trim()) {
        continue;
      }
      const sourcePad = sourcePads.getSection(name);
      const device = sourcePad?.get("Device", "").trim();
      // Automated test pipes are not physical-controller defaults.
      if (!sourcePad || !device || device.startsWith("Pipe/")) {
        continue;
      }
      const pad = pads.getOrCreateSection(name);
      for (const key of sourcePad.keysOrder) {
        pad.set(key, sourcePad.get(key, ""));
      }
      const core = dolphin.getOrCreateSection("Core");
      const sourceCore = sourceDolphin.getSection("Core");
      for (const prefix of ["SIDevice", "AdapterRumble", "SimulateKonga"]) {
        const key = `${prefix}${port}`;
        if (sourceCore?.exists(key)) {
          core.set(key, sourceCore.get(key, ""));
        }
      }
      changed = true;
    }
  }
  if (changed) {
    await dolphin.save();
    await pads.save();
  }
}
