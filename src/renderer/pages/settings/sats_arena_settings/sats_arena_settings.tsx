import { css } from "@emotion/react";
import Button from "@mui/material/Button";
import FormControlLabel from "@mui/material/FormControlLabel";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import React from "react";
import type { SatsArenaNwcInfo } from "sats_arena/types";

import { Toggle } from "@/components/form/toggle";
import { PathInput } from "@/components/path_input/path_input";
import { useSatsArenaServerStore } from "@/lib/hooks/use_sats_arena_server";
import { useSatsArenaMode, useSetting } from "@/lib/hooks/use_settings";
import { useToasts } from "@/lib/hooks/use_toasts";
import { useServices } from "@/services";

import { SettingItem } from "../setting_item_section";
import { SatsArenaSettingsMessages as Messages } from "./sats_arena_settings.messages";

const row = css`
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
`;

export const SatsArenaSettings = React.memo(() => {
  const [mode, setMode] = useSatsArenaMode();
  return (
    <div>
      <Typography variant="caption">{Messages.previewNotice()}</Typography>
      <SettingItem name={Messages.mode()} description={Messages.modeDescription()}>
        <RadioGroup value={mode} onChange={(_event, value) => setMode(value as typeof mode)}>
          <FormControlLabel value="off" label={Messages.modeOff()} control={<Radio />} />
          <FormControlLabel value="connect" label={Messages.modeConnect()} control={<Radio />} />
          <FormControlLabel value="host" label={Messages.modeHost()} control={<Radio />} />
        </RadioGroup>
      </SettingItem>
      {mode === "connect" && <ConnectSettings />}
      {mode === "host" && <HostSettings />}
    </div>
  );
});

const ConnectSettings = React.memo(() => {
  const [serverUrl, setServerUrl] = useSetting("satsArenaServerUrl");
  return (
    <SettingItem name={Messages.serverUrl()} description={Messages.serverUrlDescription()}>
      <TextSettingForm value={serverUrl} onSave={setServerUrl} placeholder="https://" />
      <TestConnectionButton url={serverUrl} />
    </SettingItem>
  );
});

const HostSettings = React.memo(() => {
  const status = useSatsArenaServerStore((store) => store.status);
  const locked = status.state !== "stopped";
  const [walletBackend, setWalletBackend] = useSetting("satsArenaWalletBackend");
  const [inviteCode, setInviteCode] = useSetting("satsArenaInviteCode");
  const [port, setPort] = useSetting("satsArenaHostPort");
  const [allowRemote, setAllowRemote] = useSetting("satsArenaHostAllowRemote");
  const [satsPerPercent, setSatsPerPercent] = useSetting("satsArenaSatsPerPercent");
  const [winSats, setWinSats] = useSetting("satsArenaWinSats");
  const [maxDeposit, setMaxDeposit] = useSetting("satsArenaMaxDepositSats");
  const [binaryPath, setBinaryPath] = useSetting("satsArenaServerBinaryPath");

  return (
    <div>
      <ServerControls />
      {locked && <Typography variant="caption">{Messages.restartToApply()}</Typography>}

      <SettingItem name={Messages.wallet()} description={Messages.walletDescription()}>
        <RadioGroup value={walletBackend} onChange={(_event, value) => setWalletBackend(value as typeof walletBackend)}>
          <FormControlLabel value="fake" label={Messages.walletFake()} control={<Radio />} />
          <FormControlLabel value="nwc" label={Messages.walletNwc()} control={<Radio />} />
        </RadioGroup>
      </SettingItem>
      {walletBackend === "nwc" && <NwcSettings />}

      <SettingItem name={Messages.inviteCode()} description={Messages.inviteCodeDescription()}>
        <div css={row}>
          <TextSettingForm value={inviteCode} onSave={setInviteCode} />
          <Button variant="outlined" color="secondary" onClick={() => setInviteCode(generateInviteCode())}>
            {Messages.generate()}
          </Button>
        </div>
      </SettingItem>

      <SettingItem name={Messages.port()}>
        <NumberSettingForm value={port} onSave={setPort} min={1} max={65535} />
      </SettingItem>
      <SettingItem>
        <Toggle
          value={allowRemote}
          onChange={setAllowRemote}
          label={Messages.allowRemote()}
          description={Messages.allowRemoteDescription()}
        />
      </SettingItem>

      <SettingItem name={Messages.rules()}>
        <div css={row}>
          <NumberSettingForm
            label={Messages.satsPerPercent()}
            value={satsPerPercent}
            onSave={setSatsPerPercent}
            min={0}
          />
          <NumberSettingForm label={Messages.winSats()} value={winSats} onSave={setWinSats} min={0} />
          <NumberSettingForm label={Messages.maxDepositSats()} value={maxDeposit} onSave={setMaxDeposit} min={1} />
        </div>
      </SettingItem>

      <SettingItem name={Messages.advanced()}>
        <SettingItem name={Messages.serverBinary()} description={Messages.serverBinaryDescription()}>
          <PathInput value={binaryPath ?? ""} placeholder={Messages.notSet()} onSelect={setBinaryPath} />
          <Button
            color="secondary"
            variant="text"
            disabled={!binaryPath}
            onClick={() => setBinaryPath(null)}
            css={css`
              margin-top: 8px;
            `}
          >
            {Messages.useDefault()}
          </Button>
        </SettingItem>
      </SettingItem>
    </div>
  );
});

const ServerControls = React.memo(() => {
  const { satsArenaService } = useServices();
  const { showError } = useToasts();
  const status = useSatsArenaServerStore((store) => store.status);
  const [logs, setLogs] = React.useState<string | null>(null);
  const logsOpen = logs !== null;

  const refreshLogs = React.useCallback(() => {
    satsArenaService.getServerLogs().then(setLogs).catch(showError);
  }, [satsArenaService, showError]);

  // Keep the visible log fresh while it's open.
  React.useEffect(() => {
    if (!logsOpen) {
      return;
    }
    const interval = setInterval(refreshLogs, 1000);
    return () => clearInterval(interval);
  }, [logsOpen, refreshLogs]);

  const start = async () => {
    const result = await satsArenaService.startServer().catch(showError);
    if (result?.state === "stopped" && result.lastError) {
      showError(result.lastError);
    }
  };

  let label: string;
  switch (status.state) {
    case "running":
      label = Messages.stateRunning(status.url);
      break;
    case "starting":
      label = Messages.stateStarting();
      break;
    case "stopping":
      label = Messages.stateStopping();
      break;
    default:
      label = Messages.stateStopped();
  }

  return (
    <SettingItem name={Messages.serverStatus()}>
      <Typography data-testid="sats-arena-server-status">{label}</Typography>
      {status.state === "stopped" && status.lastError && (
        <Typography
          color="error"
          variant="body2"
          css={css`
            white-space: pre-wrap;
          `}
        >
          {status.lastError}
        </Typography>
      )}
      <div
        css={css`
          ${row};
          margin-top: 8px;
        `}
      >
        <Button variant="contained" color="primary" disabled={status.state !== "stopped"} onClick={start}>
          {Messages.startServer()}
        </Button>
        <Button
          variant="contained"
          color="secondary"
          disabled={status.state !== "running"}
          onClick={() => satsArenaService.stopServer().catch(showError)}
        >
          {Messages.stopServer()}
        </Button>
        {status.state === "running" && <TestConnectionButton url={status.url} />}
        <Button variant="text" color="secondary" onClick={() => (logs === null ? refreshLogs() : setLogs(null))}>
          {logs === null ? Messages.showLogs() : Messages.hideLogs()}
        </Button>
      </div>
      {logs !== null && (
        <pre
          css={css`
            max-height: 240px;
            overflow: auto;
            background: rgba(0, 0, 0, 0.4);
            padding: 8px;
            font-size: 12px;
            white-space: pre-wrap;
          `}
        >
          {logs || " "}
        </pre>
      )}
    </SettingItem>
  );
});

const NwcSettings = React.memo(() => {
  const { satsArenaService } = useServices();
  const { showError, showSuccess } = useToasts();
  const [info, setInfo] = React.useState<SatsArenaNwcInfo | null>(null);
  const [editing, setEditing] = React.useState(false);
  const [uri, setUri] = React.useState("");

  React.useEffect(() => {
    satsArenaService.getNwcInfo().then(setInfo).catch(showError);
  }, [satsArenaService, showError]);

  const save = async () => {
    try {
      setInfo(await satsArenaService.setNwcUri(uri));
      setUri("");
      setEditing(false);
      showSuccess(Messages.nwcSaved());
    } catch (err) {
      showError(err);
    }
  };

  const showInput = editing || (info !== null && !info.saved);
  return (
    <SettingItem name={Messages.nwcConnection()} description={Messages.nwcConnectionDescription()}>
      {info?.saved && !editing && (
        <div css={row}>
          <Typography>{Messages.nwcSaved()}</Typography>
          <Button variant="outlined" color="secondary" onClick={() => setEditing(true)}>
            {Messages.replace()}
          </Button>
          <Button
            variant="text"
            color="secondary"
            onClick={() => satsArenaService.clearNwcUri().then(setInfo).catch(showError)}
          >
            {Messages.remove()}
          </Button>
        </div>
      )}
      {showInput && (
        <div css={row}>
          <TextField
            size="small"
            type="password"
            autoComplete="off"
            placeholder="nostr+walletconnect://…"
            value={uri}
            onChange={(e) => setUri(e.target.value)}
            sx={{ minWidth: 420 }}
          />
          <Button variant="contained" color="secondary" disabled={!uri.trim()} onClick={save}>
            {Messages.save()}
          </Button>
        </div>
      )}
      {info && !info.saved && !editing && <Typography variant="caption">{Messages.nwcNotSaved()}</Typography>}
      {info && !info.encrypted && (
        <Typography variant="caption" color="warning.main" component="div">
          {Messages.nwcPlainTextWarning()}
        </Typography>
      )}
    </SettingItem>
  );
});

const TestConnectionButton = React.memo(({ url }: { url: string }) => {
  const { satsArenaService } = useServices();
  const { showError, showSuccess } = useToasts();
  const onClick = async () => {
    try {
      const result = await satsArenaService.checkServer(url);
      if (result.ok) {
        showSuccess(result.message);
      } else {
        showError(result.message);
      }
    } catch (error) {
      showError(error);
    }
  };
  return (
    <Button
      variant="outlined"
      color="secondary"
      disabled={!url}
      onClick={onClick}
      css={css`
        margin-top: 8px;
      `}
    >
      {Messages.testConnection()}
    </Button>
  );
});

const TextSettingForm = ({
  value,
  onSave,
  placeholder,
}: {
  value: string;
  onSave: (value: string) => Promise<void>;
  placeholder?: string;
}) => {
  const [draft, setDraft] = React.useState(value);
  React.useEffect(() => setDraft(value), [value]);
  return (
    <div css={row}>
      <TextField
        size="small"
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        sx={{ minWidth: 320 }}
      />
      <Button
        variant="contained"
        color="secondary"
        disabled={draft.trim() === value}
        onClick={() => onSave(draft.trim())}
      >
        {Messages.save()}
      </Button>
    </div>
  );
};

const NumberSettingForm = ({
  label,
  value,
  onSave,
  min,
  max,
}: {
  label?: string;
  value: number;
  onSave: (value: number) => Promise<void>;
  min: number;
  max?: number;
}) => {
  const [draft, setDraft] = React.useState(String(value));
  React.useEffect(() => setDraft(String(value)), [value]);
  const parsed = Number(draft);
  const valid =
    draft.trim() !== "" && Number.isSafeInteger(parsed) && parsed >= min && (max === undefined || parsed <= max);
  return (
    <div css={row}>
      <TextField
        size="small"
        type="number"
        label={label}
        value={draft}
        error={!valid}
        onChange={(e) => setDraft(e.target.value)}
        sx={{ width: 180 }}
      />
      <Button
        variant="contained"
        color="secondary"
        disabled={!valid || parsed === value}
        onClick={() => onSave(parsed)}
      >
        {Messages.save()}
      </Button>
    </div>
  );
};

function generateInviteCode(): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0"))
    .join("")
    .slice(0, 12);
}
