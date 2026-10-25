import { IniFile } from "@dolphin/config/ini_file";
import path from "path";

/** Local Arena always enters VS character selection, including with a fresh profile. */
export async function prepareLocalGameProfile(userPath: string): Promise<void> {
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
