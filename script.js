const $ = (s) => document.querySelector(s);
const fmt = (ms) => {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`;
};
const fmtDT = (t) => new Date(t).toLocaleString();

const MAX_ENERGY = 50;
const MIN_PER_UNIT = 3;
const THRESHOLD = 50;

const MAX_SUPPLY = 40;
const SUPPLY_PER_5MIN = 5;
const SUPPLY_INTERVAL_MS = 5 * 60 * 1000;

let energyTimerActive = false;
let supplyTimerActive = false;
let canSound = false;
let blinkTimer = null;
let origTitle = document.title;

const beepEl = $('#beep');
const KEY = 'fmv_timers_v1';
const load = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || { energy: null, supply: null, workers: [] };
  } catch {
    return { energy: null, supply: null, workers: [] };
  }
};
const save = (data) => localStorage.setItem(KEY, JSON.stringify(data));
let state = load();

function setPermState() {
  const btnN = $('#btnNotify');
  if (Notification.permission === 'granted') btnN.classList.add('active'); else btnN.classList.remove('active');

  const btnS = $('#btnSound');
  if (canSound) btnS.classList.add('active'); else btnS.classList.remove('active');
}

$('#btnNotify').addEventListener('click', async () => {
  try {
    const p = await Notification.requestPermission();
    setPermState();
    if (p !== 'granted') alert('通知が拒否/未許可です。ブラウザのサイト設定で許可してください。');
  } catch {
    alert('通知の許可に失敗しました。');
  }
});
$('#btnSound').addEventListener('click', async () => {
  try {
    await beepEl.play();
    beepEl.pause();
    beepEl.currentTime = 0;
    canSound = true;
    setPermState();
  } catch (e) {
    alert('サウンドの有効化に失敗。音量/自動再生設定をご確認ください。');
  }
});
$('#btnTest').addEventListener('click', () => {
  notifyAll('テスト通知', '通知・サウンド・タイトル点滅のテストです。');
});

function startBlink() {
  if (blinkTimer) return;
  let on = false;
  blinkTimer = setInterval(() => {
    document.title = on ? '⏰ アラーム' : origTitle;
    on = !on;
  }, 800);
}
function stopBlink() {
  if (blinkTimer) {
    clearInterval(blinkTimer);
    blinkTimer = null;
    document.title = origTitle;
  }
}
function notifyAll(title, body) {
  if (document.hidden) startBlink();
  if ('Notification' in window && Notification.permission === 'granted') {
    try { new Notification(title, { body }); } catch (e) {}
  }
  if (canSound) {
    try { beepEl.currentTime = 0; beepEl.play(); } catch (e) {}
  }
  if (navigator.vibrate) navigator.vibrate([150, 80, 150]);
}

/* ===== エネルギー ===== */
function calcEnergyTarget(cur) {
  if (cur >= THRESHOLD) return Date.now();
  const need = THRESHOLD - cur;
  const minutes = need * MIN_PER_UNIT;
  return Date.now() + minutes * 60 * 1000;
}
function renderEnergy() {
  const tgt = state.energy?.targetAt;
  const elRem = $('#energyRemain');
  const elTgt = $('#energyTarget');
  const hint = $('#energyHint');
  if (!tgt) {
    elRem.textContent = '—:—:—';
    elTgt.textContent = '目標時刻: —';
    hint.textContent = '設定後に残り時間が表示されます。';
    return;
  }
  elTgt.textContent = '目標時刻: ' + fmtDT(tgt);
  const remain = tgt - Date.now();
  elRem.textContent = fmt(remain);
  if (remain <= 0) {
    elRem.classList.add('energy-ok');
    hint.textContent = 'しきい値に到達しました！';
  } else {
    elRem.classList.remove('energy-ok');
    hint.textContent = '到達すると通知します。';
  }
}
function tickEnergy() {
  if (!energyTimerActive || !state.energy?.targetAt) return;
  const remain = state.energy.targetAt - Date.now();
  const prevDue = state.energy.dueFired;
  if (remain <= 0 && !prevDue) {
    notifyAll('エネルギー到達', `エネルギーがしきい値に達しました。`);
    state.energy.dueFired = true;
    save(state);
  }
  renderEnergy();
}
$('#startEnergy').addEventListener('click', () => {
  const cur = parseInt($('#curEnergy').value || '0', 10);
  if (cur < 0 || cur > MAX_ENERGY) {
    alert('現在エネルギーは 0〜50 の範囲で入力してください。');
    return;
  }
  const targetAt = calcEnergyTarget(cur);
  state.energy = {
    cur,
    targetAt,
    dueFired: targetAt <= Date.now()
  };
  energyTimerActive = true;
  save(state);
  stopBlink();
  renderEnergy();
});
$('#stopEnergy').addEventListener('click', () => {
  energyTimerActive = false;
  state.energy = null;
  save(state);
  renderEnergy();
});
$('#resetEnergy').addEventListener('click', () => {
  $('#curEnergy').value = '';
  energyTimerActive = false;
  state.energy = null;
  save(state);
  renderEnergy();
});

/* ===== 物資 ===== */
function calcSupplyTarget(cur) {
  if (cur >= MAX_SUPPLY) return Date.now();
  const need = MAX_SUPPLY - cur;
  const steps = Math.ceil(need / SUPPLY_PER_5MIN);
  return Date.now() + steps * SUPPLY_INTERVAL_MS;
}
function calcSupplyAlert(cur) {
  if (cur >= 36) return null;
  const need = 36 - cur;
  const steps = Math.ceil(need / SUPPLY_PER_5MIN);
  return Date.now() + steps * SUPPLY_INTERVAL_MS;
}
function renderSupply() {
  const tgt = state.supply?.targetAt;
  const alertAt = state.supply?.alertAt;
  const elRem = $('#supplyRemain');
  const elTgt = $('#supplyTarget');
  const elAlt = $('#supplyAlert');
  const hint = $('#supplyHint');
  if (!tgt) {
    elRem.textContent = '—:—:—';
    elTgt.textContent = '満杯時刻: —';
    elAlt.textContent = '36個超過: —';
    hint.textContent = '設定後に残り時間が表示されます。';
    return;
  }
  elTgt.textContent = '満杯時刻: ' + fmtDT(tgt);
  elAlt.textContent = alertAt ? '36個超過: ' + fmtDT(alertAt) : '36個超過: —';
  const remain = tgt - Date.now();
  elRem.textContent = fmt(remain);
  if (remain <= 0) {
    elRem.classList.add('supply-ok');
    hint.textContent = '物資が満杯になりました！';
  } else {
    elRem.classList.remove('supply-ok');
    hint.textContent = '満杯になると通知します。';
  }
}
function tickSupply() {
  if (!supplyTimerActive || !state.supply?.targetAt) return;
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
$('#startSupply').addEventListener('click', () => {
  const cur = parseInt($('#curSupply').value || '0', 10);
  if (cur < 0 || cur > MAX_SUPPLY) {
    alert('現在の物資は 0〜40 の範囲で入力してください。');
    return;
  }
  const targetAt = calcSupplyTarget(cur);
  const alertAt = calcSupplyAlert(cur);
  state.supply = {
    cur,
    targetAt,
    alertAt,
    targetFired: targetAt <= Date.now(),
    alertFired: !alertAt || alertAt <= Date.now()
  };
  supplyTimerActive = true;
  save(state);
  stopBlink();
  renderSupply();
});
$('#stopSupply').addEventListener('click', () => {
  supplyTimerActive = false;
  state.supply = null;
  save(state);
  renderSupply();
});
$('#resetSupply').addEventListener('click', () => {
  $('#curSupply').value = '';
  supplyTimerActive = false;
  state.supply = null;
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

function restoreWorkers() {
  $('#workerList').innerHTML = '';
  for (const w of state.workers) addWorkerItem(w);
}
function restoreEnergyUI() {
  if (!state.energy) return;
  $('#curEnergy').value = state.energy.cur ?? 0;
  renderEnergy();
}
function restoreSupplyUI() {
  if (!state.supply) return;
  $('#curSupply').value = state.supply.cur ?? 0;
  renderSupply();
}

/* ===== 起動時処理 ===== */
setPermState();
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
