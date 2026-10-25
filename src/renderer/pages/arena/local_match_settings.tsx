import { css } from "@emotion/react";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import React from "react";
import { localRulesError, MAX_ENTRY_SATS, MAX_SATS_PER_PERCENT } from "sats_arena/local_rules";

import { useSetting } from "@/lib/hooks/use_settings";
import { useToasts } from "@/lib/hooks/use_toasts";

import { ArenaPageMessages as Messages } from "./arena_page.messages";

export const LocalMatchSettings = React.memo(() => {
  const [entry] = useSetting("satsArenaEntrySats");
  const [rate] = useSetting("satsArenaSatsPerPercent");
  const [entryDraft, setEntryDraft] = React.useState(String(entry));
  const [rateDraft, setRateDraft] = React.useState(String(rate));
  const [saving, setSaving] = React.useState(false);
  const { showError, showSuccess } = useToasts();
  React.useEffect(() => setEntryDraft(String(entry)), [entry]);
  React.useEffect(() => setRateDraft(String(rate)), [rate]);
  const error =
    entryDraft.trim() === "" || rateDraft.trim() === "" || localRulesError(Number(entryDraft), Number(rateDraft));
  const changed = Number(entryDraft) !== entry || Number(rateDraft) !== rate;
  const save = async () => {
    if (error || !changed) {
      return;
    }
    setSaving(true);
    try {
      await window.electron.settings.updateSettings([
        { key: "satsArenaEntrySats", value: Number(entryDraft) },
        { key: "satsArenaSatsPerPercent", value: Number(rateDraft) },
      ]);
      showSuccess(Messages.settingsSaved());
    } catch (err) {
      showError(err);
    } finally {
      setSaving(false);
    }
  };
  return (
    <section
      aria-label={Messages.localSettings()}
      css={css`
        margin-top: 28px;
      `}
    >
      <Typography component="h2" variant="subtitle1" sx={{ marginBottom: 2 }}>
        {Messages.localSettings()}
      </Typography>
      <div
        css={css`
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        `}
      >
        <TextField
          type="number"
          label={Messages.entryAmount()}
          value={entryDraft}
          disabled={saving}
          onChange={(e) => setEntryDraft(e.target.value)}
          inputProps={{ min: 1, max: MAX_ENTRY_SATS, step: 1 }}
        />
        <TextField
          type="number"
          label={Messages.damageRate()}
          value={rateDraft}
          disabled={saving}
          onChange={(e) => setRateDraft(e.target.value)}
          inputProps={{ min: 0, max: MAX_SATS_PER_PERCENT, step: 1 }}
        />
      </div>
      <div
        css={css`
          display: flex;
          gap: 16px;
          align-items: center;
          margin-top: 10px;
        `}
      >
        <Button variant="outlined" disabled={!!error || !changed || saving} onClick={save}>
          {Messages.saveSettings()}
        </Button>
        <Typography variant="caption" sx={{ fontSize: 11 }}>
          {Messages.entryDescription()}
        </Typography>
      </div>
      {typeof error === "string" && (
        <Typography role="alert" color="error" variant="caption">
          {error}
        </Typography>
      )}
      <Typography color="text.secondary" sx={{ fontSize: 11, marginTop: 1 }}>
        {Messages.settingsApply()}
      </Typography>
    </section>
  );
});
