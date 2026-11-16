const big = document.getElementById('big');
const serverEl = document.getElementById('server');
const roomEl = document.getElementById('room');
const linkEl = document.getElementById('link');
const connEl = document.getElementById('conn');
let state = '0000';

for (let i = 0; i < 4; i++) {
  const b = document.createElement('button');
  b.innerHTML = '<span></span>';
  b.onclick = () => {
    state = state.slice(0, i) + (state[i] === '1' ? '0' : '1') + state.slice(i + 1);
    render();
    chrome.runtime.sendMessage({ type: 'set', state });
  };
  big.appendChild(b);
}

function render() {
  [...big.children].forEach((b, i) => b.classList.toggle('on', state[i] === '1'));
}

function updateLink() {
  const url = serverEl.value.replace(/\/+$/, '') + '/?room=' + encodeURIComponent(roomEl.value);
  linkEl.href = url; linkEl.textContent = url;
}

async function load() {
  const d = await chrome.storage.local.get(['server', 'room', 'state', 'connected']);
  serverEl.value = d.server || 'http://localhost:8787';
  roomEl.value = d.room || '';
  state = d.state || '0000';
  connEl.classList.toggle('ok', !!d.connected);
  render(); updateLink();
}

chrome.storage.onChanged.addListener(ch => {
  if (ch.state) { state = ch.state.newValue; render(); }
  if (ch.connected) connEl.classList.toggle('ok', !!ch.connected.newValue);
  if (ch.room && document.activeElement !== roomEl) { roomEl.value = ch.room.newValue; updateLink(); }
});

document.getElementById('save').onclick = async () => {
  const room = roomEl.value.trim();
  if (!/^[a-zA-Z0-9_-]{3,64}$/.test(room)) { alert('ID комнаты: 3–64 символа, латиница/цифры/-/_'); return; }
  await chrome.storage.local.set({ server: serverEl.value.trim(), room });
  updateLink();
  chrome.runtime.sendMessage({ type: 'reconnect' });
};
document.getElementById('copy').onclick = () => navigator.clipboard.writeText(linkEl.href);
serverEl.oninput = roomEl.oninput = updateLink;

load();
