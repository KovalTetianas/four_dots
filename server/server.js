// Сервер: хранит состояние иконки для каждой «комнаты» и рассылает изменения по WebSocket.
// Состояние — строка из 4 символов "ABCD" (верх-лево, верх-право, низ-лево, низ-право), 1 = жирная точка.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8787;
const DATA_FILE = path.join(__dirname, 'state.json');
const PUBLIC = path.join(__dirname, 'public');

let states = {};
try { states = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch {}
const save = () => fs.writeFile(DATA_FILE, JSON.stringify(states), () => {});

const validRoom = r => typeof r === 'string' && /^[a-zA-Z0-9_-]{3,64}$/.test(r);
const validState = s => typeof s === 'string' && /^[01]{4}$/.test(s);
// null = сервер ещё не знает состояние комнаты (например, после перезапуска на бесплатном хостинге)
const getState = room => states[room] || null;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const json = (res, code, obj) => {
  res.writeHead(code, { 'Content-Type': 'application/json', ...CORS });
  res.end(JSON.stringify(obj));
};
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }

  const m = url.pathname.match(/^\/api\/state\/([^/]+)$/);
  if (m) {
    const room = m[1];
    if (!validRoom(room)) return json(res, 400, { error: 'bad room' });
    if (req.method === 'GET') return json(res, 200, { room, state: getState(room) });
    if (req.method === 'POST') {
      let body = '';
      req.on('data', c => { body += c; if (body.length > 1000) req.destroy(); });
      req.on('end', () => {
        let state;
        try { state = JSON.parse(body).state; } catch {}
        if (!validState(state)) return json(res, 400, { error: 'state must be like "1010"' });
        states[room] = state;
        save();
        broadcast(room, state);
        json(res, 200, { room, state });
      });
      return;
    }
    return json(res, 405, { error: 'method not allowed' });
  }

  // Статика: страница-пульт
  let file = url.pathname === '/' ? '/index.html' : url.pathname;
  file = path.normalize(path.join(PUBLIC, file));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

// WebSocket: ws://host/ws?room=XXX — сразу присылает текущее состояние и потом все изменения
const wss = new WebSocketServer({ server, path: '/ws' });
const rooms = new Map(); // room -> Set<ws>

wss.on('connection', (ws, req) => {
  const room = new URL(req.url, 'http://x').searchParams.get('room');
  if (!validRoom(room)) return ws.close(1008, 'bad room');
  if (!rooms.has(room)) rooms.set(room, new Set());
  rooms.get(room).add(ws);
  ws.send(JSON.stringify({ type: 'state', room, state: getState(room) }));

  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.type === 'ping') return ws.send(JSON.stringify({ type: 'pong' }));
    if (msg.type === 'set' && validState(msg.state)) {
      states[room] = msg.state;
      save();
      broadcast(room, msg.state);
    }
  });
  ws.on('close', () => {
    const set = rooms.get(room);
    if (set) { set.delete(ws); if (!set.size) rooms.delete(room); }
  });
});

function broadcast(room, state) {
  const msg = JSON.stringify({ type: 'state', room, state });
  for (const ws of rooms.get(room) || []) if (ws.readyState === 1) ws.send(msg);
}

server.listen(PORT, () => console.log(`Four-dots server: http://localhost:${PORT}`));
