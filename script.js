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

let energyTimerActive = false;
let canSound = false;
let blinkTimer = null;
let origTitle = document.title;

const beepEl = $('#beep');
const KEY = 'fmv_timers_v1';
const load = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || { energy: null, workers: [] };
  } catch {
    return { energy: null, workers: [] };
  }
};
const save = (data) => localStorage.setItem(KEY, JSON.stringify(data));
let state = load();

function setPermState() {
  const n = Notification.permission || 'default';
  $('#permState').textContent = `通知: ${n} / サウンド: ${canSound ? '準備OK' : '未準備'}`;
}
$('#btnNotify').addEventListener('click', async () => {
  try {
    const p = await Notification.requestPermission();
    setPermState();
    if (p !== 'granted') alert('通知が拒否/未許可です。ブラウザのサイト設定で許可してください。');
  } catch (e) {
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
    try {
      new Notification(title, { body });
    } catch (e) {}
  }
  if (canSound) {
    try {
      beepEl.currentTime = 0;
      beepEl.play();
    } catch (e) {}
  }
  if (navigator.vibrate) navigator.vibrate([150, 80, 150]);
}

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
    elRem.classList.add('ok');
    hint.textContent = 'しきい値に到達しました！';
  } else {
    elRem.classList.remove('ok');
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
    max: MAX_ENERGY,
    cur,
    minPer: MIN_PER_UNIT,
    threshold: THRESHOLD,
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

function addWorkerItem(w) {
  const wrap = document.createElement('div');
  wrap.className = 'item';
  const left = document.createElement('div');
  left.className = 'left';
  const title = document.createElement('div');
  title.innerHTML = `<strong>労働者</strong> <span class="pill">完了: ${fmtDT(w.targetAt)}</span>`;
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
  w._elTitle = title;
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
      if (w._elWrap) w._elWrap.classList.add('done');
      save(state);
    }
  }
}
$('#addWorker').addEventListener('click', () => {
  const m = parseInt($('#workerMinutes').value || '0', 10);
  if (m <= 0) {
    alert('クールダウン（分）を入力してください。');
    return;
  }
  const now = Date.now();
  const w = {
    id: 'w_' + now + '_' + Math.random().toString(36).slice(2),
    targetAt: now + m * 60 * 1000,
    fired: false
  };
    state.workers.push(w);
  save(state);
  addWorkerItem(w);
  stopBlink();
});

function restoreWorkers() {
  $('#workerList').innerHTML = '';
  for (const w of state.workers) {
    addWorkerItem(w);
  }
}

function restoreEnergyUI() {
  if (!state.energy) return;
  $('#curEnergy').value = state.energy.cur ?? 0;
  renderEnergy();
}

setPermState();
restoreEnergyUI();
restoreWorkers();

$('#workerPresetButtons').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-min]');
  if (!btn) return;
  const min = parseFloat(btn.dataset.min);
  const now = Date.now();
  const w = {
    id: 'w_' + now + '_' + Math.random().toString(36).slice(2),
    targetAt: now + min * 60 * 1000,
    fired: false
  };
  state.workers.push(w);
  save(state);
  addWorkerItem(w);
  stopBlink();
});

setInterval(() => {
  tickEnergy();
  tickWorkers();
}, 1000);

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    stopBlink();
    tickEnergy();
    tickWorkers();
  }
});