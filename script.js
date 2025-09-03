/* ===== ユーティリティ ===== */
function $(sel) {
  return document.querySelector(sel);
}
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
  if (Notification.permission === 'granted') {
    new Notification(title, { body });
  }
  const audio = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=');
  audio.play();
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

/* ===== 状態管理 ===== */
let state = {
  energy: null,
  supply: null,
  workers: []
};
function save(st) {
  localStorage.setItem('alarmState', JSON.stringify(st));
}
function load() {
  const s = localStorage.getItem('alarmState');
  if (s) state = JSON.parse(s);
}
load();

/* ===== エネルギー ===== */
const MAX_ENERGY = 50;
const ENERGY_INTERVAL_MS = 3 * 60 * 1000;
function calcEnergyTarget(cur) {
  const need = MAX_ENERGY - cur;
  return Date.now() + need * ENERGY_INTERVAL_MS;
}

function renderEnergy() {
  if (!state.energy) return;
  const remain = state.energy.targetAt - Date.now();
  $('#energyRemain').textContent = fmt(remain);
  $('#energyTarget').textContent = '目標時刻: ' + fmtDT(state.energy.targetAt);

  // 色分け
  if (remain <= 0) {
    $('#energyRemain').classList.add('energy-ok');
  } else {
    $('#energyRemain').classList.remove('energy-ok');
  }
}

function tickEnergy() {
  if (!state.energy) return;
  const now = Date.now();
  const remain = state.energy.targetAt - now;
  if (remain <= 0 && !state.energy.dueFired) {
    notifyAll('エネルギーが最大になりました', '行動可能です。');
    state.energy.dueFired = true;
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
  $('#energyInputUI').classList.remove('hidden');
  $('#energyActiveUI').classList.add('hidden');
});
// リセット
$('#resetEnergy').addEventListener('click', () => {
  const targetAt = calcEnergyTarget(0);
  state.energy = { cur: 0, targetAt, dueFired: targetAt <= Date.now() };
  save(state);
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
  const remain = state.supply.targetAt - Date.now();
  $('#supplyRemain').textContent = fmt(remain);
  $('#supplyTarget').textContent = '満杯時刻: ' + fmtDT(state.supply.targetAt);
  $('#supplyAlert').textContent = state.supply.alertAt ? '36個超過: ' + fmtDT(state.supply.alertAt) : '—';

  if (remain <= 0) {
    $('#supplyRemain').classList.add('supply-ok');
  } else {
    $('#supplyRemain').classList.remove('supply-ok');
  }
}

function tickSupply() {
  if (!state.supply) return;
  const now = Date.now();

  if (!state.supply.alertFired && state.supply.alertAt && now >= state.supply.alertAt) {
    notifyAll('物資が36個を超えました', '物資を回収してください。');
    state.supply.alertFired = true;
    save(state);
  }
  if (!state.supply.targetFired && now >= state.supply.targetAt) {
    notifyAll('物資が満杯になりました', '取りこぼさないようにしてください。');
    state.supply.targetFired = true;
    save(state);
  }
  renderSupply();
}

// 開始
$('#startSupply').addEventListener('click', () => {
  const cur = parseInt($('#curSupply').value || '0', 10);
  if (cur < 0 || cur > MAX_SUPPLY) {
    alert('0〜40の範囲で入力してください');
    return;
  }
  const targetAt = calcSupplyTarget(cur);
  const alertAt = calcSupplyAlert(cur);
  state.supply = {
    cur, targetAt, alertAt,
    targetFired: targetAt <= Date.now(),
    alertFired: !alertAt || alertAt <= Date.now()
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
  $('#supplyInputUI').classList.remove('hidden');
  $('#supplyActiveUI').classList.add('hidden');
});
// リセット
$('#resetSupply').addEventListener('click', () => {
  const targetAt = calcSupplyTarget(0);
  const alertAt = calcSupplyAlert(0);
  state.supply = { cur: 0, targetAt, alertAt, targetFired: false, alertFired: false };
  save(state);
  renderSupply();
});

/* ===== 労働者 ===== */
function addWorkerItem(w) {
  const wrap = document.createElement('div');
  wrap.className = 'item';
  const left = document.createElement('div');
  left.className = 'left';
  const title = document.createElement('div');
  title.innerHTML = `<div><strong>労働者 ${w.label || (w.minutes + '分')}</strong></div>
                     <div class="pill">完了: ${fmtDT(w.targetAt)}</div>`;
  const remain = document.createElement('div');
  remain.className = 'timer';
  remain.textContent = fmt(w.targetAt - Date.now());
  left.appendChild(title);
  left.appendChild(remain);

  const right = document.createElement('div');
  right.className = 'right';
  const btnDone = document.createElement('button');
  btnDone.textContent = '削除';
  btnDone.addEventListener('click', () => {
    state.workers = state.workers.filter((x) => x.id !== w.id);
    save(state);
    $('#workerList').removeChild(wrap);
  });
  right.appendChild(btnDone);

  wrap.appendChild(left);
  wrap.appendChild(right);
  $('#workerList').appendChild(wrap);

  w._elRemain = remain;
  w._elWrap = wrap;
  return wrap;
}

function tickWorkers() {
  for (const w of state.workers) {
    const r = w.targetAt - Date.now();
    if (w._elRemain) w._elRemain.textContent = fmt(r);
    if (r <= 0 && !w.fired) {
      notifyAll('労働者が準備OK', '次の作業が可能です。');
      w.fired = true;
      if (w._elRemain) w._elRemain.classList.add('worker-ok');
      save(state);
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  $('#workerPresetButtons').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-min]');
    if (!btn) return;
    const min = parseFloat(btn.dataset.min);
    const label = btn.dataset.label || (min + '分');
    const now = Date.now();
    const w = {
      id: 'w_' + now + '_' + Math.random().toString(36).slice(2),
      targetAt: now + min * 60 * 1000,
      fired: false,
      minutes: min,
      label: label
    };
    state.workers.push(w);
    save(state);
    addWorkerItem(w);
    stopBlink();
  });
});

/* ===== 復元 ===== */
function restoreEnergyUI() {
  if (state.energy) {
    $('#energyInputUI').classList.add('hidden');
    $('#energyActiveUI').classList.remove('hidden');
    renderEnergy();
  }
}
function restoreSupplyUI() {
  if (state.supply) {
    $('#supplyInputUI').classList.add('hidden');
    $('#supplyActiveUI').classList.remove('hidden');
    renderSupply();
  }
}
function restoreWorkers() {
  $('#workerList').innerHTML = '';
  for (const w of state.workers) addWorkerItem(w);
}

/* ===== 起動時処理 ===== */
restoreEnergyUI();
restoreSupplyUI();
restoreWorkers();

setInterval(() => {
  tickEnergy();
  tickSupply();
  tickWorkers();
}, 1000);

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    stopBlink();
    tickEnergy();
    tickSupply();
    tickWorkers();
  }
});

$('#enableNotif').addEventListener('click', () => {
  Notification.requestPermission();
});

