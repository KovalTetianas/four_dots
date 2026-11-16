// Держит WebSocket к серверу и меняет иконку, когда кто-то выбирает новый вариант.
// Начиная с Chrome 116 активный WebSocket продлевает жизнь service worker'а,
// если раз в <30 с по нему что-то отправлять — поэтому шлём ping каждые 20 с.
const DEFAULT_SERVER = 'http://localhost:8787';
const KEEPALIVE_MS = 20000;

let ws = null;
let keepalive = null;
let reconnectTimer = null;
let currentKey = '';

const iconPaths = s => ({
  16: `icons/dots_${s}_16.png`,
  32: `icons/dots_${s}_32.png`,
  48: `icons/dots_${s}_48.png`,
  128: `icons/dots_${s}_128.png`,
});

async function applyState(state) {
  if (!/^[01]{4}$/.test(state)) return;
  await chrome.action.setIcon({ path: iconPaths(state) });
  const n = [...state].filter(c => c === '1').length;
  await chrome.action.setTitle({ title: `Четыре точки — ${state} (жирных: ${n})` });
  await chrome.storage.local.set({ state });
}

async function getConfig() {
  let { server, room } = await chrome.storage.local.get(['server', 'room']);
  if (!server) server = DEFAULT_SERVER;
  if (!room) {
    room = 'r' + crypto.randomUUID().replace(/-/g, '').slice(0, 10);
    await chrome.storage.local.set({ room });
  }
  if (!(await chrome.storage.local.get('server')).server) await chrome.storage.local.set({ server });
  return { server, room };
}

const wsUrl = (server, room) =>
  server.replace(/^http/, 'ws').replace(/\/+$/, '') + '/ws?room=' + encodeURIComponent(room);

async function connect(force = false) {
  const { server, room } = await getConfig();
  const key = server + '|' + room;
  if (!force && ws && key === currentKey && ws.readyState <= 1) return; // уже подключены
  disconnect();
  currentKey = key;

  let socket;
  try { socket = new WebSocket(wsUrl(server, room)); }
  catch (e) { return scheduleReconnect(); }
  ws = socket;
  await chrome.storage.local.set({ connected: false });

  socket.onopen = () => {
    chrome.storage.local.set({ connected: true });
    keepalive = setInterval(() => {
      if (socket.readyState === 1) socket.send(JSON.stringify({ type: 'ping' }));
    }, KEEPALIVE_MS);
  };
  socket.onmessage = e => {
    let msg; try { msg = JSON.parse(e.data); } catch { return; }
    if (msg.type !== 'state') return;
    if (msg.state) applyState(msg.state);
    else chrome.storage.local.get('state').then(({ state }) => {
      // Сервер «забыл» состояние (перезапуск) — отдаём ему наше, иконка не сбрасывается
      if (state && socket.readyState === 1) socket.send(JSON.stringify({ type: 'set', state }));
    });
  };
  socket.onclose = () => {
    if (ws !== socket) return;
    clearInterval(keepalive);
    ws = null;
    chrome.storage.local.set({ connected: false });
    scheduleReconnect();
  };
}

function disconnect() {
  clearInterval(keepalive);
  clearTimeout(reconnectTimer);
  if (ws) { const s = ws; ws = null; s.onclose = null; s.close(); }
}

function scheduleReconnect() {
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => connect(), 5000);
}

// Отправить новое состояние на сервер (используется окном расширения)
async function pushState(state) {
  await applyState(state);
  const { server, room } = await getConfig();
  if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: 'set', state }));
  else await fetch(`${server.replace(/\/+$/, '')}/api/state/${encodeURIComponent(room)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state }),
  }).catch(() => {});
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg.type === 'set') pushState(msg.state).then(() => reply({ ok: true }));
  if (msg.type === 'reconnect') connect(true).then(() => reply({ ok: true }));
  return true;
});

// Страховка: если Chrome всё-таки усыпил service worker — будильник раз в минуту поднимет связь
chrome.alarms.create('reconnect', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener(a => { if (a.name === 'reconnect') connect(); });

chrome.runtime.onStartup.addListener(() => connect());
chrome.runtime.onInstalled.addListener(() => connect());

// При каждом пробуждении: восстановить последнюю иконку и подключиться
chrome.storage.local.get('state').then(({ state }) => state && applyState(state));
connect();
