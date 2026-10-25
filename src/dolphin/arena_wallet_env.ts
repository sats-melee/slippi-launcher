/** Keep wallet credentials and Arena configuration out of ordinary Dolphin children. */
export function withoutArenaWalletEnv(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(source).filter(([name]) => !name.startsWith("SATS_ARENA_")));
}
