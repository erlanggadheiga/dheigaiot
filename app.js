// ── Theme ─────────────────────────────────────────────────────
const THEME_KEY = 'iot_theme';
let currentTheme = localStorage.getItem(THEME_KEY) || 'dark';

function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  const icon = t === 'dark' ? '🌙' : '☀️';
  ['theme-btn-login', 'theme-btn-dash'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = icon;
  });
  localStorage.setItem(THEME_KEY, t);
  currentTheme = t;
}

function toggleTheme() {
  applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
}

// ── Navigation ────────────────────────────────────────────────
function goToDashboard() {
  const login = document.getElementById('view-login');
  const dash  = document.getElementById('view-dashboard');
  login.classList.add('fade-out');
  setTimeout(() => {
    login.classList.add('hidden');
    login.classList.remove('fade-out');
    dash.classList.remove('hidden');
    dash.classList.add('fade-in');
    window.scrollTo(0, 0);
  }, 320);
}

function goToLogin() {
  document.getElementById('view-dashboard').classList.add('hidden');
  document.getElementById('view-dashboard').classList.remove('fade-in');
  document.getElementById('view-login').classList.remove('hidden');
  window.scrollTo(0, 0);
}

// ── Config ────────────────────────────────────────────────────
const BROKER   = 'b79a441bd82a4420841f2ac3c192dd52.s1.eu.hivemq.cloud';
const PORT     = 8884;
const USERNAME = 'dheiga';
const PASSWORD = 'Dheiga2008';
const TOPIC    = 'smk/iot/sensor/';
const TBL_INT  = 2000;
const MAX_ROWS = 50;

// ── State ─────────────────────────────────────────────────────
let cl = null, conn = false, lastStatus = '', manualDisc = false;
let mc = parseInt(localStorage.getItem('msg_count')) || 0;
let st = null, uptimer = null, history = [], nextId = 1, lastData = null, lastTblTime = 0;

// ── Persistence ───────────────────────────────────────────────
function saveHistory() {
  try { localStorage.setItem('iot_hist', JSON.stringify({ rows: history, nextId })); } catch (e) {}
}

function loadHistory() {
  try {
    const raw = localStorage.getItem('iot_hist');
    if (!raw) return;
    const obj = JSON.parse(raw);
    history = obj.rows || [];
    nextId  = obj.nextId || history.length + 1;
    rebuildTable();
    const lu = localStorage.getItem('last_update');
    if (lu) g('lu').textContent = lu;
    updateSelInfo();
    const last = localStorage.getItem('last_sensor');
    if (last) {
      const d = JSON.parse(last);
      if (d.suhu)   updSensor(d.suhu, d.hum);
      if (d.cahaya) updLDR(d.cahaya);
    }
  } catch (e) {}
}

// ── Table ─────────────────────────────────────────────────────
const g = id => document.getElementById(id);

function rebuildTable() {
  const tb = g('tbl-body');
  tb.innerHTML = history.length ? '' : '<tr><td colspan="7" class="no-data">Belum ada data diterima.</td></tr>';
  history.forEach(r => tb.appendChild(makeRow(r)));
  g('chk-all').checked = false;
  g('del-btn').disabled = true;
}

function makeRow(r) {
  const tr = document.createElement('tr');
  tr.dataset.id = r.id;
  tr.innerHTML = `
    <td><input type="checkbox" class="row-cb" data-id="${r.id}" onchange="onRowCheck()"></td>
    <td>${r.id}</td>
    <td>${r.ts}</td>
    <td class="suhu-cell">${r.suhu}</td>
    <td class="hum-cell">${r.hum}</td>
    <td>${r.cahaya === 'TERANG' ? '<span class="bt">TERANG</span>' : '<span class="bg">GELAP</span>'}</td>
    <td>${r.led}</td>
  `;
  tr.onclick = e => {
    if (e.target.type === 'checkbox') return;
    const cb = tr.querySelector('.row-cb');
    cb.checked = !cb.checked;
    onRowCheck();
  };
  return tr;
}

function addTableRow(now, suhu, hum, cahaya, ledRaw) {
  const names = ['LED1', 'LED2', 'LED3', 'LED4'];
  let aktif = [];
  if (typeof ledRaw === 'string' && /^[01]{4}$/.test(ledRaw))
    ledRaw.split('').forEach((v, i) => { if (v === '1') aktif.push(names[i]); });
  else if (Array.isArray(ledRaw))
    ledRaw.forEach(n => { if (n >= 1 && n <= 4) aktif.push(names[n - 1]); });

  const row = {
    id:     nextId++,
    ts:     now.toLocaleTimeString('id-ID', { hour12: false }),
    suhu:   suhu != null ? suhu.toFixed(1) : '-',
    hum:    hum  != null ? hum.toFixed(1)  : '-',
    cahaya,
    led:    aktif.length ? aktif.join(', ') : '-'
  };

  history.unshift(row);
  if (history.length > MAX_ROWS) history.length = MAX_ROWS;

  const tb = g('tbl-body');
  const noRow = tb.querySelector('.no-data');
  if (noRow) noRow.parentElement.remove();
  tb.insertBefore(makeRow(row), tb.firstChild);
  while (tb.children.length > MAX_ROWS) tb.removeChild(tb.lastChild);

  updateSelInfo();
  saveHistory();
}

// ── Checkbox ──────────────────────────────────────────────────
function onRowCheck() {
  const cbs     = [...document.querySelectorAll('.row-cb')];
  const checked = cbs.filter(c => c.checked);
  g('chk-all').checked  = checked.length === cbs.length && cbs.length > 0;
  g('del-btn').disabled = checked.length === 0;
  document.querySelectorAll('#tbl-body tr[data-id]').forEach(tr =>
    tr.classList.toggle('selected', !!tr.querySelector('.row-cb')?.checked)
  );
  updateSelInfo();
}

function toggleAll(master) {
  document.querySelectorAll('.row-cb').forEach(cb => cb.checked = master.checked);
  onRowCheck();
}

function updateSelInfo() {
  const n = [...document.querySelectorAll('.row-cb:checked')].length;
  g('sel-info').textContent = history.length
    ? (n ? `${n} baris dipilih` : `${history.length} baris`)
    : '';
}

function deleteSelected() {
  const ids = new Set([...document.querySelectorAll('.row-cb:checked')].map(c => +c.dataset.id));
  if (!ids.size) return;
  history = history.filter(r => !ids.has(r.id));
  mc = Math.max(0, mc - ids.size);
  localStorage.setItem('msg_count', mc);
  g('mc').textContent = mc;
  saveHistory();
  rebuildTable();
  updateSelInfo();
  g('chk-all').checked  = false;
  g('del-btn').disabled = true;
}

function clearAll() {
  if (!history.length || !confirm('Hapus semua riwayat data?')) return;
  history = [];
  nextId  = 1;
  saveHistory();
  rebuildTable();
  updateSelInfo();
}

function exportCSV() {
  if (!history.length) { alert('Tidak ada data.'); return; }
  const rows = [
    ['#', 'Waktu', 'Suhu (°C)', 'Hum (%)', 'Cahaya', 'LED'],
    ...history.map(r => [r.id, r.ts, r.suhu, r.hum, r.cahaya, r.led])
  ];
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURI(rows.map(r => r.join(',')).join('\n'));
  a.download = `iot-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.csv`;
  a.click();
}

// ── MQTT ──────────────────────────────────────────────────────
function toggle() { conn ? doDisc() : doConn(); }

function doConn() {
  manualDisc = false;
  setBadge('connecting', 'CONNECTING...');
  g('btn').disabled = true;
  cl = new Paho.Client(BROKER, PORT, '/mqtt', 'Web-' + Math.floor(Math.random() * 9000 + 1000));
  cl.onConnectionLost  = onLost;
  cl.onMessageArrived  = onMsg;
  cl.connect({ userName: USERNAME, password: PASSWORD, useSSL: true, onSuccess: onConn, onFailure: onFail });
}

function doDisc() {
  if (!cl || !conn) return;
  manualDisc = true;
  cl.disconnect();
  g('btn-text').textContent = 'HUBUNGKAN KE MQTT';
  g('btn').classList.remove('disc');
  g('btn').disabled = false;
  setBadge('', 'DISCONNECTED');
}

function onConn() {
  conn = true;
  setBadge('connected', 'CONNECTED');
  g('btn').disabled = false;
  g('btn').classList.add('disc');
  g('btn-text').textContent = 'PUTUSKAN KONEKSI';
  cl.subscribe(TOPIC);
  addLog('SYS', 'Connected: ' + BROKER);
  addLog('SYS', 'Topic: ' + TOPIC);
  st = Date.now();
  uptimer = setInterval(uptime, 1000);
}

function onFail(e) {
  setBadge('error', 'GAGAL');
  addLog('SYS', 'Error: ' + e.errorMessage);
  g('btn').disabled = false;
}

function onLost() {
  conn = false;
  setBadge('', 'DISCONNECTED');
  g('btn').disabled = false;
  if (uptimer) clearInterval(uptimer);
  setSystemState('off');
  g('btn-text').textContent = 'HUBUNGKAN KE MQTT';
  g('btn').classList.remove('disc');
  if (!manualDisc) setTimeout(doConn, 3000);
  manualDisc = false;
}

function onMsg(m) {
  mc++;
  localStorage.setItem('msg_count', mc);
  g('mc').textContent = mc;

  const now     = new Date();
  const timeStr = now.toLocaleTimeString('id-ID', { hour12: false });
  g('lu').textContent = timeStr;
  localStorage.setItem('last_update', timeStr);

  try {
    const d      = JSON.parse(m.payloadString.trim());
    const mode   = (d.mode || 'auto').toLowerCase();
    const suhu   = d.suhu      != null ? parseFloat(d.suhu)      : null;
    const hum    = d.kelembapan != null ? parseFloat(d.kelembapan) : null;
    const cahaya = (d.cahaya || '').toUpperCase();

    lastData = { suhu, hum, cahaya };
    localStorage.setItem('last_sensor', JSON.stringify(lastData));

    updModeBadge(mode, suhu);
    if (suhu != null && hum != null) updSensor(suhu, hum);
    if (cahaya) updLDR(cahaya);

    if (mode === 'manual') {
      const led = parseLed(d.led);
      addLog('MODE', 'MANUAL');
      addLog('LED', `L1:${+led[0]} L2:${+led[1]} L3:${+led[2]} L4:${+led[3]}`);
      updLEDs(led, 'manual');
      setSystemState('manual');
    } else {
      if (suhu == null || hum == null) { addLog('ERR', 'Data tidak lengkap'); return; }
      addLog('SUHU', suhu.toFixed(1) + ' °C');
      addLog('HUM',  hum.toFixed(1)  + ' %');
      addLog('LDR',  cahaya || '—');
      setSystemState('auto', suhu);
      updLEDs(null, 'auto', suhu);
      cekAlert(suhu);
    }

    if (Date.now() - lastTblTime >= TBL_INT) {
      addTableRow(now, suhu, hum, cahaya, d.led);
      lastTblTime = Date.now();
    }
  } catch (e) {
    addLog('ERR', 'JSON Error: ' + e.message);
  }
}

function parseLed(led) {
  const s = [false, false, false, false];
  if (led == null) return s;
  if (Array.isArray(led))
    led.forEach(n => { if (n >= 1 && n <= 4) s[n - 1] = true; });
  else if (typeof led === 'string' && /^[01]{4}$/.test(led))
    led.split('').forEach((v, i) => s[i] = v === '1');
  else if (typeof led === 'number')
    for (let i = 0; i < 4; i++) s[i] = !!(led & (1 << i));
  return s;
}

// ── UI Updates ────────────────────────────────────────────────
function updSensor(suhu, hum) {
  g('sv').textContent    = suhu.toFixed(1);
  g('hv').textContent    = hum.toFixed(1);
  g('sb').style.width    = Math.min(100, (suhu / 50) * 100) + '%';
  g('hb').style.width    = Math.min(100, hum) + '%';
}

function updLDR(v) {
  const t = v === 'TERANG';
  g('lico').textContent  = t ? '☀️' : '🌙';
  g('lpill').className   = 'pill ' + (t ? 'terang' : 'gelap');
  g('lpill').textContent = t ? 'TERANG' : 'GELAP';
}

function updModeBadge(mode, suhu) {
  g('mode-badge').className  = 'mode-badge ' + (mode === 'manual' ? 'manual' : 'auto');
  g('mode-text').textContent = mode === 'manual' ? 'MODE: MANUAL' : 'MODE: AUTO';
  g('mode-hint').textContent = mode === 'manual'
    ? 'LED dikontrol via tombol fisik'
    : (suhu != null ? 'LED dari suhu ' + suhu.toFixed(1) + '°C' : 'LED dari suhu sensor');
}

function setSystemState(state, suhu) {
  const sv = g('sval');
  if (state === 'auto') {
    sv.textContent  = 'AKTIF';
    sv.className    = 'big-text on';
    const s = suhu <= 25 ? 'NORMAL' : suhu <= 30 ? 'SEDANG' : 'PANAS';
    g('snote').textContent = 'STATUS: ' + s + ' | ' + suhu.toFixed(1) + '°C';
  } else if (state === 'manual') {
    sv.textContent  = 'MANUAL';
    sv.className    = 'big-text on';
    g('snote').textContent = 'Kontrol LED via tombol fisik';
  } else {
    sv.textContent  = 'STANDBY';
    sv.className    = 'big-text';
    g('snote').textContent       = 'Menunggu data dari ESP32...';
    g('mode-badge').className    = 'mode-badge';
    g('mode-text').textContent   = 'MODE: —';
    g('mode-hint').textContent   = 'Menunggu data...';
  }
}

function updLEDs(state, mode, suhu) {
  const colors = ['green', 'yellow', 'red', 'green'];
  [1, 2, 3, 4].forEach(i => {
    g('l'  + i).className  = 'lorb';
    g('ls' + i).textContent = 'Padam';
  });

  if (mode === 'manual') {
    [1, 2, 3, 4].forEach((_, i) => {
      g('lb' + (i + 1)).textContent = 'BTN ' + (i + 1);
      if (state[i]) {
        g('l'  + (i + 1)).className   = 'lorb ' + colors[i];
        g('ls' + (i + 1)).textContent = 'Menyala';
      }
    });
  } else {
    ['lb1','lb2','lb3','lb4'].forEach((id, i) =>
      g(id).textContent = ['20–25°C', '26–30°C', '≥30°C', 'INDIKATOR'][i]
    );
    const idx = suhu >= 20 && suhu <= 25 ? 0 : suhu > 25 && suhu <= 30 ? 1 : suhu > 30 ? 2 : -1;
    if (idx >= 0) {
      g('l'  + (idx + 1)).className   = 'lorb ' + colors[idx];
      g('ls' + (idx + 1)).textContent = 'Menyala';
    }
    g('l4').className   = 'lorb green';
    g('ls4').textContent = 'Aktif';
  }
}

function cekAlert(suhu) {
  const s = suhu <= 25 ? 'NORMAL' : suhu <= 30 ? 'SEDANG' : 'PANAS';
  if (s !== lastStatus) {
    const map = {
      NORMAL: ['● Suhu Normal (20–25°C)', 'green'],
      SEDANG: ['● Suhu Sedang (26–30°C)', 'yellow'],
      PANAS:  ['● Suhu Panas (>30°C)',    'red']
    };
    showAlert(...map[s]);
  }
  lastStatus = s;
}

// ── Helpers ───────────────────────────────────────────────────
function setBadge(cls, txt) {
  g('badge').className   = 'badge ' + cls;
  g('btext').textContent = txt;
}

function addLog(type, msg) {
  const el = g('log');
  const t  = new Date().toLocaleTimeString('id-ID', { hour12: false });
  const d  = document.createElement('div');
  d.className = 'le';
  const cls = (msg.includes('TERANG') || msg.includes('AKTIF')) ? 'on-txt'
            : (msg.includes('GELAP')  || msg.includes('STANDBY')) ? 'muted' : '';
  d.innerHTML = `<span class="lt">${t}</span> <span class="lk">[${type}]</span> <span class="lm ${cls}">${msg}</span>`;
  el.appendChild(d);
  el.scrollTop = el.scrollHeight;
  while (el.children.length > 120) el.removeChild(el.firstChild);
}

function uptime() {
  if (!st) return;
  const s = Math.floor((Date.now() - st) / 1000);
  g('up').textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

function showAlert(text, type) {
  const div = document.createElement('div');
  div.className = 'alert-box alert-' + type;
  div.innerText = text;
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 3200);
}

// ── Init ──────────────────────────────────────────────────────
window.addEventListener('load', () => {
  applyTheme(currentTheme);
  loadHistory();
  g('mc').textContent = mc;
});
