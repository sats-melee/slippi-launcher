// Control only the explicitly launched agent sandbox's loopback debugging port.
import { writeFile } from 'node:fs/promises';
const port = Number(process.env.ARENA_AGENT_DEBUG_PORT ?? 9338);
const command = process.argv[2] ?? 'status';
let page;
const deadline = Date.now() + (command === 'close' ? 2000 : 60000);
while (!page && Date.now() < deadline) {
  const target = command === 'close' ? 'version' : 'list';
  const result = await fetch(`http://127.0.0.1:${port}/json/${target}`, { signal: AbortSignal.timeout(1500) }).then(response => response.json()).catch(() => null);
  page = command === 'close' ? (result?.webSocketDebuggerUrl ? result : null) :
    result?.find(item => item.type === 'page' && item.url.startsWith('file:') && item.url.includes('app.asar'));
  if (!page) await new Promise(resolve => setTimeout(resolve, 250));
}
if (!page && command === 'close') { console.log('No agent debugging endpoint is available; no close command sent.'); process.exit(0); }
if (!page) throw new Error('Open the packaged agent launcher with make sandbox-agent first.');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let next = 0;
const pending = new Map();
ws.onmessage = event => { const message = JSON.parse(event.data); if (message.id) { pending.get(message.id)?.(message); pending.delete(message.id); } };
async function rpc(method, params = {}) {
  const id = ++next;
  const timer = setTimeout(() => { console.error('Agent launcher command timed out.'); process.exit(1); }, 15000);
  try { return await new Promise(resolve => { pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params })); }); }
  finally { clearTimeout(timer); }
}
if (command === 'cpu-wallets') {
  const enabled = process.argv[3] !== 'off';
  await rpc('Runtime.evaluate', { expression: `location.hash = '#/settings/sats-arena'`, returnByValue: true });
  let found = false;
  for (let attempt = 0; attempt < 80; ++attempt) {
    const response = await rpc('Runtime.evaluate', { expression: `(() => {
      const label = [...document.querySelectorAll('label')].find(item => item.textContent.trim() === 'CPU wallets');
      const input = label?.querySelector('input[type="checkbox"]');
      if (!input) return null;
      if (input.checked !== ${enabled}) input.click();
      return input.checked;
    })()`, returnByValue: true });
    if (response.result?.result?.value === enabled) { found = true; break; }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!found) throw new Error('The CPU wallets developer option was not available in this launcher build.');
  await rpc('Runtime.evaluate', { expression: `location.hash = '#/'`, returnByValue: true });
  console.log(`CPU wallets ${enabled ? 'enabled' : 'disabled'} through Developer options`);
} else if (command === 'local') {
  for (let attempt = 0; attempt < 80; ++attempt) {
    const ready = await rpc('Runtime.evaluate', { expression: `!![...document.querySelectorAll('button')].find(item => item.textContent.trim() === 'Local' && !item.disabled)`, returnByValue: true });
    if (ready.result?.result?.value) break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  const response = await rpc('Runtime.evaluate', { expression: `(() => { const button = [...document.querySelectorAll('button')].find(item => item.textContent.trim() === 'Local'); if (!button || button.disabled) throw Error('LOCAL is unavailable'); button.click(); return 'Opened LOCAL sandbox'; })()`, returnByValue: true });
  if (response.result?.exceptionDetails) throw new Error('LOCAL could not be opened; check the agent launcher.');
  console.log(response.result.result.value);
} else if (command === 'screenshot') {
  const response = await rpc('Page.captureScreenshot');
  await writeFile('.release/sandbox-launcher.png', Buffer.from(response.result.data, 'base64'));
  console.log('.release/sandbox-launcher.png');
} else if (command === 'close') {
  ws.send(JSON.stringify({ id: ++next, method: 'Browser.close' }));
} else if (command === 'status') {
  console.log(JSON.stringify({ title: page.title, url: page.url, port }));
} else throw new Error('Use local, cpu-wallets [on|off], screenshot, close, or status.');
ws.close();
setTimeout(() => process.exit(0), 250).unref();
