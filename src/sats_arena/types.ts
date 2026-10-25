export type SatsArenaServerStatus =
  | { state: "stopped"; lastError?: string }
  | { state: "starting" }
  | { state: "running"; url: string; pid: number }
  | { state: "stopping" };

export type SatsArenaNwcInfo = {
  saved: boolean;
  /** False when the OS has no keyring, so the secret would be stored in plain text. */
  encrypted: boolean;
};

export type SatsArenaNwcCheck = {
  ok: boolean;
  message: string;
  invoice?: string;
  qr_svg?: string;
  amount_sats?: number;
};

export type SatsArenaService = {
  getSandboxInfo(): Promise<{ ready: boolean; addresses: string[] }>;
  setupSandbox(): Promise<{ ready: boolean; addresses: string[] }>;
  launchLocalGame(): Promise<void>;
  getServerStatus(): Promise<SatsArenaServerStatus>;
  startServer(): Promise<SatsArenaServerStatus>;
  stopServer(): Promise<SatsArenaServerStatus>;
  getServerLogs(): Promise<string>;
  getNwcInfo(): Promise<SatsArenaNwcInfo>;
  setNwcUri(uri: string): Promise<SatsArenaNwcInfo>;
  clearNwcUri(): Promise<SatsArenaNwcInfo>;
  checkNwc(createInvoice?: boolean): Promise<SatsArenaNwcCheck>;
  /** Calls `GET /health` on a server; used by the "Test connection" button. */
  checkServer(url: string): Promise<{ ok: boolean; message: string }>;
  onServerStatusChange(handle: (status: SatsArenaServerStatus) => void): () => void;
};
