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

/* ===== 通知モードの切り替えロジックと関数 ===== */
let blinkTimer;
let originalTitle = document.title;
let notificationMode = localStorage.getItem('notificationMode') || 'blink';

// MIDIjs Player Setup
// Note: MIDIjs is a global object loaded from the script tag.
// No specialized initialization similar to Magenta is needed here.

const $enableNotif = $('#enableNotif');

// UIを現在のモードに合わせて更新する関数
function updateNotifButtonUI() {
  if (!$enableNotif) return;

  if (notificationMode === 'desktop') {
    $enableNotif.textContent = '通知モード: デスクトップ';
    $enableNotif.style.backgroundColor = '#4fc3f7';
    $enableNotif.style.color = '#000';
    if (Notification.permission !== 'granted') {
      $enableNotif.textContent = '通知モード: 権限が必要です';
      $enableNotif.style.backgroundColor = '#d32f2f'; // 赤色
      $enableNotif.style.color = '#fff';
    }
  } else {
    $enableNotif.textContent = '通知モード: タイトル点滅';
    $enableNotif.style.backgroundColor = '#333';
    $enableNotif.style.color = '#ddd';
  }
}

function notifyAll(title, body) {
  // 1. サウンドを鳴らす (両モード共通)
  try {
    MIDIjs.play('midi/aka09.mid');
  } catch (e) {
    console.error('Failed to play MIDI:', e);
  }

  // 2. モードに応じた通知表示
  if (notificationMode === 'desktop' && Notification.permission === 'granted') {
    new Notification(title, { body });
  } else {
    startBlink(title);
  }
}

function startBlink(title) {
  if (blinkTimer) return;

  let isBlink = false;
  document.title = title;

  blinkTimer = setInterval(() => {
    isBlink = !isBlink;
    document.title = isBlink ? '📢 ' + title : originalTitle;
  }, 1000);
}

function stopBlink() {
  if (blinkTimer) {
    clearInterval(blinkTimer);
    blinkTimer = null;
    document.title = originalTitle;
  }
  try {
    MIDIjs.stop();
  } catch (e) {
    console.error('Failed to stop MIDI:', e);
  }
}

/* ===== 状態管理 ===== */
let state = JSON.parse(localStorage.getItem('alarmState')) || {
  energy: null, // {targetAt: number, duration: number, fired: boolean}
  supply: null, // {targetAt: number, targetCount: number, currentCount: number, duration: number, fired: boolean}
  workers: [], // [{id: string, targetAt: number, fired: boolean, minutes: number, label: string}]
  halfEvent: false
};

function save() {
  localStorage.setItem('alarmState', JSON.stringify(state));
}

let isHalfEvent = state.halfEvent; // イベントの状態を一時的に保持

/* ===== エネルギーアラーム機能 ===== */
$('#startEnergy').addEventListener('click', () => {
  stopBlink();
  const curEnergy = parseInt($('#curEnergy').value);

  // 入力値の検証
  if (isNaN(curEnergy) || curEnergy < 0 || curEnergy >= 50) {
    alert('有効なエネルギー値を入力してください (0〜49)。');
    return;
  }

  // 満タン(50)までに必要なエネルギー量を計算
  const energyNeeded = 50 - curEnergy;

  // 1エネルギーあたり3分で回復する前提で時間を計算
  let duration = energyNeeded * 3 * 60 * 1000; // ミリ秒に変換

  // イベントが有効な場合、時間を半減
  duration = duration * (isHalfEvent ? 0.5 : 1);

  state.energy = {
    targetAt: Date.now() + duration,
    duration: duration,
    fired: false
  };
  save();

  $('#energyInputUI').classList.add('hidden');
  $('#energyActiveUI').classList.remove('hidden');
});

$('#stopEnergy').addEventListener('click', () => {
  stopBlink();
  $('#energyActiveUI').classList.add('hidden');
  $('#energyInputUI').classList.remove('hidden');

  // 目標時刻と残時間をクリア
  $('#energyTarget').textContent = '目標時刻: —';
  $('#energyRemain').textContent = '—:—:—';

  state.energy = null;
  save();
});

$('#resetEnergy').addEventListener('click', () => {
  $('#curEnergy').value = 0; // リセットでデフォルト値に戻す
  $('#stopEnergy').click();
});


/* ===== 物資アラーム機能 ===== */
$('#startSupply').addEventListener('click', () => {
  stopBlink();
  const currentSupply = parseInt($('#curSupply').value);

  // 入力値の検証
  if (isNaN(currentSupply) || currentSupply < 0 || currentSupply >= 40) {
    alert('有効な物資数を入力してください (0〜39)。');
    return;
  }

  // デフォルトの目標物資数は36個
  const targetCount = 36;

  // 現在の物資数が目標以上の場合はエラー
  if (currentSupply >= targetCount) {
    alert(`現在の物資数(${currentSupply})が目標数(${targetCount})以上です。`);
    return;
  }

  // 必要な物資数を計算
  const supplyNeeded = targetCount - currentSupply;

  // 5分ごとに5個回復する前提で時間を計算
  // 必要な回復回数 = ceil(必要な物資数 / 5)
  const recoveryTimes = Math.ceil(supplyNeeded / 5);
  const duration = recoveryTimes * 5 * 60 * 1000; // ミリ秒に変換

  // 物資は時間短縮イベントの対象外

  state.supply = {
    targetAt: Date.now() + duration,
    targetCount: targetCount,
    currentCount: currentSupply,
    duration: duration,
    fired: false
  };
  save();

  $('#supplyInputUI').classList.add('hidden');
  $('#supplyActiveUI').classList.remove('hidden');
});

$('#stopSupply').addEventListener('click', () => {
  stopBlink();
  $('#supplyActiveUI').classList.add('hidden');
  $('#supplyInputUI').classList.remove('hidden');

  // 表示をリセット
  $('#supplyTarget').textContent = '36個到達: —';
  $('#supplyRemain').textContent = '—:—:—';

  state.supply = null;
  save();
});

$('#resetSupply').addEventListener('click', () => {
  $('#curSupply').value = 0; // リセットでデフォルト値に戻す
  $('#stopSupply').click();
});


/* ===== 労働者アラーム機能 ===== */
const $workerList = $('#workerList');
const $workerPresetButtons = $('#workerPresetButtons');

function addWorkerItem(worker) {
  const el = document.createElement('div');
  el.className = 'worker-item';
  if (worker.fired) el.classList.add('done-worker');
  el.dataset.workerId = worker.id;

  const targetText = worker.fired ? '完了' : fmtDT(worker.targetAt);

  el.innerHTML = `
    <div class="worker-left">${worker.label}</div>
    <div class="worker-mid">
      <div class="timer" data-timer-id="${worker.id}">—:—:—</div>
      <div class="pill">${targetText}</div>
    </div>
    <div class="worker-right">
      <button class="control-btn plus-btn" data-id="${worker.id}" data-action="plus">+</button>
      <button class="control-btn minus-btn" data-id="${worker.id}" data-action="minus">—</button>
      <button class="control-btn delete-btn" data-id="${worker.id}" data-action="delete">削除</button>
    </div>
  `;

  worker._elItem = el; // 要素をオブジェクトに保存
  $workerList.appendChild(el);
}

function removeWorkerWithAnimation(el, id) {
  el.classList.add('removing');
  setTimeout(() => {
    el.remove();
    // stateからも削除
    state.workers = state.workers.filter(w => w.id !== id);
    save();
    if (state.workers.length === 0) stopBlink();
  }, 400); // CSSアニメーション時間と合わせる
}

$workerPresetButtons.addEventListener('click', e => {
  const btn = e.target.closest('button[data-min]');
  if (!btn) return;

  // 完了したアラームを削除してから新規追加
  state.workers.filter(w => w.fired).forEach(w => w._elItem && removeWorkerWithAnimation(w._elItem, w.id));

  const min = parseFloat(btn.dataset.min);
  const label = btn.querySelector('.label')?.textContent || `${min}分`;
  const duration = min * 60 * 1000 * (isHalfEvent ? 0.5 : 1);

  const worker = {
    id: 'w_' + Date.now() + Math.random().toString(36).slice(2),
    targetAt: Date.now() + duration,
    fired: false,
    minutes: min,
    label
  };

  state.workers.push(worker);
  save();
  addWorkerItem(worker);
  stopBlink();
});

$workerList.addEventListener('click', e => {
  const btn = e.target.closest('.control-btn');
  if (!btn) return;

  const id = btn.dataset.id;
  const action = btn.dataset.action;
  const worker = state.workers.find(w => w.id === id);

  if (!worker) return;

  switch (action) {
    case 'plus':
      worker.targetAt += 60000; // 1分追加
      worker.fired = false;
      worker._elItem.classList.remove('done-worker');
      worker._elItem.querySelector('.pill').textContent = fmtDT(worker.targetAt);
      stopBlink();
      break;
    case 'minus':
      worker.targetAt = Math.max(Date.now(), worker.targetAt - 60000); // 1分減算、ただし現在時刻より前にはしない
      worker.fired = false;
      worker._elItem.classList.remove('done-worker');
      worker._elItem.querySelector('.pill').textContent = fmtDT(worker.targetAt);
      stopBlink();
      break;
    case 'delete':
      removeWorkerWithAnimation(worker._elItem, id);
      break;
  }
  save();
});


/* ===== イベント機能 ===== */
const $halfEventButton = $('#halfEventButton');

$halfEventButton.addEventListener('click', () => {
  isHalfEvent = !isHalfEvent;
  state.halfEvent = isHalfEvent;
  save();
  updateEventUI();
});

function updateEventUI() {
  if (isHalfEvent) {
    $halfEventButton.classList.add('active');
    $('header').classList.add('event-active');
  } else {
    $halfEventButton.classList.remove('active');
    $('header').classList.remove('event-active');
  }
}

/* ===== メインループ (毎秒実行) ===== */
function updateUI() {
  const now = Date.now();
  let mustStopBlink = true; // 点滅を停止すべきかどうかのフラグ

  // 1. エネルギーアラーム
  if (state.energy) {
    const remain = state.energy.targetAt - now;
    $('#energyRemain').textContent = fmt(remain);
    $('#energyTarget').textContent = '目標時刻: ' + fmtDT(state.energy.targetAt);

    if (remain <= 0) {
      $('#energyRemain').textContent = '完了!';
      if (!state.energy.fired) {
        notifyAll('エネルギー完了', 'エネルギーが満タンになりました!');
        state.energy.fired = true;
        save();
      }
      $('#energyActiveUI').classList.add('done-energy');
    } else {
      $('#energyActiveUI').classList.remove('done-energy');
      mustStopBlink = false;
    }
  }

  // 2. 物資アラーム
  if (state.supply) {
    const remain = state.supply.targetAt - now;
    $('#supplyRemain').textContent = fmt(remain);
    $('#supplyTarget').textContent = `${state.supply.targetCount}個到達: ` + fmtDT(state.supply.targetAt);

    if (remain <= 0) {
      $('#supplyRemain').textContent = '完了!';
      if (!state.supply.fired) {
        notifyAll('物資完了', `物資が${state.supply.targetCount}個に到達しました!`);
        state.supply.fired = true;
        save();
      }
      $('#supplyActiveUI').classList.add('done-energy'); // 完了時のスタイル適用
    } else {
      $('#supplyActiveUI').classList.remove('done-energy');
      mustStopBlink = false;
    }
  }

  // 3. 労働者アラーム
  state.workers.forEach(worker => {
    const remain = worker.targetAt - now;
    const $timerEl = $(`[data-timer-id="${worker.id}"]`);

    if ($timerEl) $timerEl.textContent = fmt(remain);

    if (remain <= 0 && !worker.fired) {
      worker.fired = true;
      worker._elItem.classList.add('done-worker');
      worker._elItem.querySelector('.pill').textContent = '完了';
      notifyAll('労働者完了', `${worker.label} の労働者が帰還しました。`);
      save();
    }

    if (!worker.fired) {
      mustStopBlink = false;
    }
  });

  // 全てのアラームが完了している場合のみ点滅を停止
  if (mustStopBlink && state.workers.every(w => w.fired) && !state.energy && !state.supply) {
    stopBlink();
  } else if (!mustStopBlink) {
    // タイトル点滅モードでない場合は、完了時に即座に点滅を停止
    if (notificationMode !== 'blink') stopBlink();
  }


}

/* ===== 起動時復元とイベントリスナー設定 ===== */
document.addEventListener('DOMContentLoaded', () => {
  // 状態復元
  if (state.energy) {
    $('#energyInputUI').classList.add('hidden');
    $('#energyActiveUI').classList.remove('hidden');
    if (state.energy.targetAt <= Date.now()) {
      $('#energyActiveUI').classList.add('done-energy');
    }
  }

  // 物資アラームの状態復元
  if (state.supply) {
    $('#supplyInputUI').classList.add('hidden');
    $('#supplyActiveUI').classList.remove('hidden');
    if (state.supply.targetAt <= Date.now()) {
      $('#supplyActiveUI').classList.add('done-energy');
    }
  }

  state.workers.forEach(addWorkerItem);

  // イベント復元
  updateEventUI();

  // 通知モードのイベントリスナー設定
  $enableNotif.addEventListener('click', () => {
    stopBlink();
    if (notificationMode === 'blink') {
      // 点滅 -> デスクトップ通知に切り替え
      if (Notification.permission === 'default') {
        Notification.requestPermission().then(permission => {
          if (permission === 'granted') {
            notificationMode = 'desktop';
          }
          localStorage.setItem('notificationMode', notificationMode);
          updateNotifButtonUI();
        });
      } else if (Notification.permission === 'granted') {
        notificationMode = 'desktop';
        localStorage.setItem('notificationMode', notificationMode);
        updateNotifButtonUI();
      } else {
        alert("デスクトップ通知を有効にするには、ブラウザの設定で通知を許可してください。");
        updateNotifButtonUI();
      }
    } else {
      // デスクトップ通知 -> 点滅に切り替え
      notificationMode = 'blink';
      localStorage.setItem('notificationMode', notificationMode);
      updateNotifButtonUI();
    }
  });

  // UI初期化
  updateNotifButtonUI();

  // メインループ開始 (1秒ごとに更新)
  setInterval(updateUI, 1000);
});