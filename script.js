/* ===== ユーティリティ ===== */
function $(sel) { return document.querySelector(sel); }
function fmt(ms) {
  if (ms < 0) ms = 0;
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
function fmtDT(ts) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

/* ===== 通知 ===== */
let blinkTimer;
function notifyAll(title, body) {
  if (Notification.permission === 'granted') new Notification(title, { body });
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = 880;
    g.gain.setValueAtTime(0.1, ctx.currentTime);
    o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + 0.3);
  } catch (err) { console.warn('音声再生エラー', err); }
  startBlink();
}
function startBlink() {
  stopBlink();
  let flag = false;
  blinkTimer = setInterval(() => {
    document.title = flag ? '【通知あり】' : 'アラーム管理';
    flag = !flag;
  }, 1000);
}
function stopBlink() {
  clearInterval(blinkTimer);
  document.title = 'アラーム管理';
}

/* ===== イベント ===== */
let isHalfEvent = false;
$('#halfEventButton').addEventListener('click', () => {
  isHalfEvent = !isHalfEvent;
  localStorage.setItem('halfEvent', JSON.stringify(isHalfEvent));
  updateEventUI();
});

function updateEventUI() {
  const header = document.querySelector('header');
  header.classList.toggle('event-active', isHalfEvent);
  $('#halfEventButton').classList.toggle('active', isHalfEvent);
  $('#halfEventButton').textContent = isHalfEvent ? 'イベント中（短縮有効）' : 'イベントOFF';
  updateWorkerPresetLabels();
}

function updateWorkerPresetLabels() {
  document.querySelectorAll('#workerPresetButtons button[data-min]').forEach(btn => {
    const min = parseFloat(btn.dataset.min);
    const effective = isHalfEvent ? min / 2 : min;
    const sec = Math.round(effective * 60);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    let text = '';
    if (h) text += `${h}時間`;
    if (m) text += `${m}分`;
    if (s) text += `${s}秒`;
    btn.querySelector('.label')?.remove();
    const span = document.createElement('span');
    span.className = 'label';
    span.textContent = text || '0秒';
    btn.appendChild(span);
  });
}

/* ===== 状態管理 ===== */
let state = { energy: null, supply: null, workers: [] };
function save() { localStorage.setItem('alarmState', JSON.stringify(state)); }
function load() {
  const s = localStorage.getItem('alarmState');
  if (s) state = JSON.parse(s);
}
load();

/* ===== エネルギー・物資（変更なし・省略）===== */
/* ===== エネルギー ===== */
const MAX_ENERGY = 50;
const ENERGY_INTERVAL_MS_NORMAL = 5 * 60 * 1000;  // 通常
const ENERGY_INTERVAL_MS_EVENT = 3 * 60 * 1000;  // イベント時

function calcEnergyTarget(cur) {
  const need = MAX_ENERGY - cur;
  const interval = isHalfEvent ? ENERGY_INTERVAL_MS_EVENT : ENERGY_INTERVAL_MS_NORMAL;
  return Date.now() + need * interval;
}

function renderEnergy() {
  if (!state.energy) return;
  const remain = state.energy.targetAt - Date.now();
  $('#energyRemain').textContent = fmt(remain);
  $('#energyTarget').textContent = '目標時刻: ' + fmtDT(state.energy.targetAt);

  if (remain <= 0) {
    document.querySelector('.energy').classList.add('done-energy');
  } else {
    document.querySelector('.energy').classList.remove('done-energy');
  }
}

function tickEnergy() {
  if (!state.energy) return;
  const now = Date.now();
  const remain = state.energy.targetAt - now;
  if (remain <= 0 && !state.energy.dueFired) {
    notifyAll('エネルギーが最大になりました', '行動可能です。');
    state.energy.dueFired = true;
    document.querySelector('.energy').classList.add('done-energy');
    save(state);
  }
  renderEnergy();
}

// 開始
$('#startEnergy').addEventListener('click', () => {
  const cur = parseInt($('#curEnergy').value || '0', 10);
  if (cur < 0 || cur > MAX_ENERGY) {
    alert('0〜50の範囲で入力してください');
    return;
  }
  const targetAt = calcEnergyTarget(cur);
  state.energy = { cur, targetAt, dueFired: targetAt <= Date.now() };
  save(state);

  $('#energyInputUI').classList.add('hidden');
  $('#energyActiveUI').classList.remove('hidden');
  renderEnergy();
});
// 停止
$('#stopEnergy').addEventListener('click', () => {
  state.energy = null;
  save(state);
  document.querySelector('.energy').classList.remove('done-energy');
  $('#energyInputUI').classList.remove('hidden');
  $('#energyActiveUI').classList.add('hidden');
});
// リセット
$('#resetEnergy').addEventListener('click', () => {
  const targetAt = calcEnergyTarget(0);
  state.energy = { cur: 0, targetAt, dueFired: targetAt <= Date.now() };
  save(state);
  document.querySelector('.energy').classList.remove('done-energy');
  renderEnergy();
});

/* ===== 物資 ===== */
const MAX_SUPPLY = 40;
const SUPPLY_INTERVAL_MS = 5 * 60 * 1000; // 5分ごとに5個
function calcSupplyTarget(cur) {
  const need = MAX_SUPPLY - cur;
  return Date.now() + (need / 5) * SUPPLY_INTERVAL_MS;
}
function calcSupplyAlert(cur) {
  if (cur >= 36) return null;
  const need = 36 - cur;
  return Date.now() + (need / 5) * SUPPLY_INTERVAL_MS;
}

function renderSupply() {
  if (!state.supply) return;
  const remain = state.supply.alertAt - Date.now();
  $('#supplyRemain').textContent = fmt(remain);
  $('#supplyTarget').textContent = '36個到達: ' + fmtDT(state.supply.alertAt);
  $('#supplyAlert').textContent = '';  // 不要になるので空に
}

function tickSupply() {
  if (!state.supply) return;
  const now = Date.now();
  const remain = state.supply.alertAt - now;

  if (remain <= 0 && !state.supply.fired) {
    notifyAll('物資が36個を超えました！', '回収してね！');
    state.supply.fired = true;
    save(state);
    // タイマー停止（もう更新しない）
    state.supply = null;
    save(state);
    $('#supplyActiveUI').classList.add('hidden');
    $('#supplyInputUI').classList.remove('hidden');
  } else {
    renderSupply();
  }
}

// 開始
$('#startSupply').addEventListener('click', () => {
  const cur = parseInt($('#curSupply').value || '0', 10);
  if (cur < 0 || cur > MAX_SUPPLY) {
    alert('0〜40の範囲で入力してください');
    return;
  }

  // 36個になるまでの時間を計算（5分で5個回復）
  const need = 36 - cur;
  const alertAt = Date.now() + (need / 5) * 5 * 60 * 1000;  // 5分×need回

  state.supply = {
    cur,
    alertAt,           // 36個になる時刻
    fired: false        // 通知済みフラグ
  };
  save(state);

  $('#supplyInputUI').classList.add('hidden');
  $('#supplyActiveUI').classList.remove('hidden');
  renderSupply();
});
// 停止
$('#stopSupply').addEventListener('click', () => {
  state.supply = null;
  save(state);
  document.querySelector('.supply').classList.remove('done-supply');
  $('#supplyInputUI').classList.remove('hidden');
  $('#supplyActiveUI').classList.add('hidden');
});
// リセット
$('#resetSupply').addEventListener('click', () => {
  const targetAt = calcSupplyTarget(0);
  const alertAt = calcSupplyAlert(0);
  state.supply = { cur: 0, targetAt, alertAt, targetFired: false, alertFired: false };
  save(state);
  document.querySelector('.supply').classList.remove('done-supply');
  renderSupply();
});

/* ===== 労働者（CSS完全対応版）===== */
function removeWorkerWithAnimation(el, id) {
  el.classList.add('removing');
  stopBlink();
  setTimeout(() => {
    state.workers = state.workers.filter(w => w.id !== id);
    save();
    el.remove();
  }, 400);
}

function addWorkerItem(w) {
  const item = document.createElement('div');
  item.className = 'worker-item';

  const left = document.createElement('div');
  left.className = 'worker-left';
  left.textContent = w.label || `${w.minutes}分作業`;

  const mid = document.createElement('div');
  mid.className = 'worker-mid';
  const timer = document.createElement('div');
  timer.className = 'timer';
  timer.textContent = fmt(w.targetAt - Date.now());
  const pill = document.createElement('div');
  pill.className = 'pill';
  pill.textContent = '完了: ' + fmtDT(w.targetAt);
  mid.append(timer, pill);

  const right = document.createElement('div');
  right.className = 'worker-right';

  const plus = document.createElement('button');
  plus.className = 'control-btn plus-btn';
  plus.textContent = '+1分';
  const minus = document.createElement('button');
  minus.className = 'control-btn minus-btn';
  minus.textContent = '-1分';
  const del = document.createElement('button');
  del.className = 'control-btn delete-btn';
  del.textContent = '削除';

  right.append(plus, minus, del);
  item.append(left, mid, right);
  $('#workerList').appendChild(item);

  plus.onclick = () => { w.targetAt += 60000; pill.textContent = '完了: ' + fmtDT(w.targetAt); save(); tickWorkers(); };
  minus.onclick = () => { w.targetAt = Math.max(Date.now() + 1000, w.targetAt - 60000); pill.textContent = '完了: ' + fmtDT(w.targetAt); save(); tickWorkers(); };
  del.onclick = () => removeWorkerWithAnimation(item, w.id);

  w._elTimer = timer;
  w._elPill = pill;
  w._elItem = item;

  if (w.fired) item.classList.add('done-worker');
}

function tickWorkers() {
  state.workers.forEach(w => {
    const remain = w.targetAt - Date.now();
    if (w._elTimer) w._elTimer.textContent = fmt(remain);
    if (remain <= 0 && !w.fired) {
      notifyAll('労働者が準備OK', '次の作業が可能です。');
      w.fired = true;
      w._elItem.classList.add('done-worker');
      save();
    }
  });
}

/* ===== プリセットクリック ===== */
$('#workerPresetButtons').addEventListener('click', e => {
  const btn = e.target.closest('button[data-min]');
  if (!btn) return;

  state.workers.filter(w => w.fired).forEach(w => w._elItem && removeWorkerWithAnimation(w._elItem, w.id));

  const min = parseFloat(btn.dataset.min);
  const label = btn.querySelector('.label')?.textContent || `${min}分`;
  const duration = min * 60 * 1000 * (isHalfEvent ? 0.5 : 1);

  const worker = {
    id: 'w_' + Date.now() + Math.random().toString(36).slice(2),
    targetAt: Date.now() + duration - 30000,
    fired: false,
    minutes: min,
    label
  };

  state.workers.push(worker);
  save();
  addWorkerItem(worker);
  stopBlink();
});

/* ===== 起動時復元 ===== */
document.addEventListener('DOMContentLoaded', () => {
  // 状態復元
  if (state.energy) { $('#energyInputUI').classList.add('hidden'); $('#energyActiveUI').classList.remove('hidden'); }
  if (state.supply) { $('#supplyInputUI').classList.add('hidden'); $('#supplyActiveUI').classList.remove('hidden'); }
  state.workers.forEach(addWorkerItem);

  // イベント復元
  const saved = localStorage.getItem('halfEvent');
  if (saved !== null) isHalfEvent = JSON.parse(saved);
  updateEventUI();

  // タイマー
  setInterval(() => { tickEnergy(); tickSupply(); tickWorkers(); }, 1000);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { stopBlink(); tickEnergy(); tickSupply(); tickWorkers(); }
  });

  $('#enableNotif').onclick = () => Notification.requestPermission();
});