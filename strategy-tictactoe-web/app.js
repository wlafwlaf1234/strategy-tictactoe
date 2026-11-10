'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const names = {easy: '쉬움', medium: '중간', hard: '어려움', extreme: '극악'};
  const keys = {game: 'strategyttt.mobile.game.k4f6.v3', prefs: 'strategyttt.mobile.prefs.v1', setup: 'strategyttt.mobile.setup.v1'};
  let storageFailed = false, game = null, selected = [], screen = 'home', busy = false;
  let worker = null, workerURL = null, workerTimer = null, token = 0, modalKind = '', backgrounded = false, aiFailed = false;
  let toastTimer = null, audio = null, previousBoard = Array(49).fill(0);
  const voices = new Set();
  function read(k, fallback) {
    try { const raw = localStorage.getItem(k); return raw ? JSON.parse(raw) : fallback; }
    catch (_) { storageFailed = true; return fallback; }
  }
  function write(k, data) {
    try { localStorage.setItem(k, JSON.stringify(data)); return true; }
    catch (_) { storageFailed = true; return false; }
  }
  const rawPrefs = read(keys.prefs, {});
  const prefs = {sound: rawPrefs.sound !== false, vibration: rawPrefs.vibration !== false,
    motion: rawPrefs.motion !== false, volume: Number.isFinite(rawPrefs.volume) ? Math.max(0, Math.min(1, rawPrefs.volume)) : .35};
  const rawSetup = read(keys.setup, {});
  const checked = GameCore.config(rawSetup);
  let setup = {...checked, seat: ['1', '-1', 'random'].includes(rawSetup.seat) ? rawSetup.seat : '1'};
  const saved = read(keys.game, null);
  if (saved) {
    try { game = GameCore.restore(saved); }
    catch (_) { toast('저장된 대국을 복구하지 못했습니다. 새 게임을 시작할 수 있습니다.'); }
  }
  // Pixel-art pieces: 9x9 dot grids ('#' = one dot) inside an 11x11 canvas. A 1-dot outline surrounds the shape (arcade sprite look);
  // the top dot of a vertical run is lightened and the bottom dot darkened for a dot-bevel.
  const SPRITES = {
    1: ['##.....##', '###...###', '.###.###.', '..#####..', '...###...', '..#####..', '.###.###.', '###...###', '##.....##'],
    '-1': ['..#####..', '.#######.', '##.....##', '##.....##', '##.....##', '##.....##', '##.....##', '.#######.', '..#####..']
  };
  function buildSprite(rows) {
    const on = (x, y) => rows[y] !== undefined && rows[y][x] === '#';
    const dotAt = (x, y) => 'M' + (x + 1) + ' ' + (y + 1) + 'h1v1h-1z';
    let base = '', light = '', dark = '', line = '';
    for (let y = -1; y <= rows.length; y++) for (let x = -1; x <= rows[0].length; x++) {
      if (on(x, y)) {
        base += dotAt(x, y);
        if (!on(x, y - 1) && on(x, y + 1)) light += dotAt(x, y); else if (on(x, y - 1) && !on(x, y + 1)) dark += dotAt(x, y);
      } else if (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1)) line += dotAt(x, y);
    }
    return '<span class="piece"><svg viewBox="0 0 11 11" aria-hidden="true" focusable="false">' +
      '<path class="px-o" d="' + line + '"/><path class="px-b" d="' + base + '"/><path class="px-l" d="' + light + '"/><path class="px-d" d="' + dark + '"/></svg></span>';
  }
  const PIECES = {1: buildSprite(SPRITES[1]), '-1': buildSprite(SPRITES['-1'])};
  function piece(p) { return PIECES[p === 1 ? 1 : -1]; }
  function coord(i) { return String.fromCharCode(65 + i % 7) + (1 + Math.floor(i / 7)); }
  function toast(message) {
    clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false;
    toastTimer = setTimeout(() => {$('toast').hidden = true;}, 3400);
  }
  function applyPrefs() { document.body.dataset.motion = prefs.motion ? 'normal' : 'low'; }
  function ensureAudio() {
    if (!prefs.sound || backgrounded) return;
    try {
      if (!audio) { const C = window.AudioContext || window.webkitAudioContext; if (C) audio = new C(); }
      if (audio && audio.state === 'suspended') audio.resume().catch(() => {});
    } catch (_) { /* Sound is optional; the game remains playable. */ }
  }
  function tone(frequency, start, duration, type = 'sine', level = 1) {
    if (!audio || audio.state !== 'running') return;
    const osc = audio.createOscillator(), gain = audio.createGain();
    const t = audio.currentTime + start;
    osc.type = type; osc.frequency.setValueAtTime(frequency, t);
    gain.gain.setValueAtTime(.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(.0002, prefs.volume * .17 * level), t + .008);
    gain.gain.exponentialRampToValueAtTime(.0001, t + duration);
    osc.connect(gain); gain.connect(audio.destination); voices.add(osc);
    osc.onended = () => {voices.delete(osc); osc.disconnect(); gain.disconnect();};
    osc.start(t); osc.stop(t + duration + .015);
  }
  function sound(kind) {
    if (!prefs.sound || backgrounded) return;
    ensureAudio();
    // 8-bit chiptune voices: square waves for lead, saw for zaps
    if (kind === 'select') tone(880, 0, .04, 'square', .3);
    if (kind === 'place') {tone(988, 0, .05, 'square', .32); tone(1319, .05, .09, 'square', .32);}
    if (kind === 'steal') {tone(220, 0, .06, 'sawtooth', .3); tone(440, .05, .06, 'square', .3); tone(880, .1, .06, 'square', .3); tone(1760, .15, .1, 'square', .3);}
    if (kind === 'win') [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5, 1318.5].forEach((f, i, a) => tone(f, i * .085, i === a.length - 1 ? .34 : .08, 'square', .3));
    if (kind === 'draw') {tone(392, 0, .1, 'square', .3); tone(330, .1, .1, 'square', .3); tone(262, .2, .22, 'triangle', .6);}
    if (kind === 'invalid') {tone(130, 0, .08, 'square', .3); tone(98, .08, .1, 'square', .3);}
  }
  function stopAudio() {
    for (const osc of voices) {try {osc.stop();} catch (_) {}}
    voices.clear();
    if (audio && audio.state === 'running') audio.suspend().catch(() => {});
  }
  async function vibrate(kind = 'light') {
    if (!prefs.vibration || backgrounded) return;
    try {
      if (window.NativeBridge && window.NativeBridge.isNative) await window.NativeBridge.haptic(kind);
      else if (navigator.vibrate) navigator.vibrate(kind === 'win' ? [20, 35, 20] : 12);
    } catch (_) { /* Unsupported devices can safely ignore haptics. */ }
  }
  function save() {
    if (!game) return;
    if (!write(keys.game, GameCore.snapshot(game))) $('save-note').textContent = '이 환경에서는 저장할 수 없습니다. 앱을 닫으면 대국이 사라질 수 있습니다.';
  }
  function isHuman() { return game && (game.cfg.mode === 'human' || game.state.p === game.cfg.human); }
  function killAI() {
    token++; clearTimeout(workerTimer); workerTimer = null;
    if (worker) worker.terminate(); worker = null;
    if (workerURL) URL.revokeObjectURL(workerURL); workerURL = null; busy = false;
  }
  function renderHome() {
    $('continue').hidden = !game;
    $('home-new').className = 'button ' + (game ? 'secondary' : 'primary');
    if (game) $('continue-detail').textContent = game.ended ? '완료된 대국 · 결과 확인' :
      (game.cfg.mode === 'ai' ? 'AI ' + names[game.cfg.level] : '둘이 대전') + ' · ' + game.records.length + '턴 완료';
  }
  function renderSetup() {
    document.querySelectorAll('[data-pick]').forEach(b => {
      const on = setup[b.dataset.pick] === b.dataset.value;
      b.classList.toggle('selected', on); b.setAttribute('aria-pressed', String(on));
    });
    ['ai-options', 'seat-options', 'search-options'].forEach(id => {$(id).hidden = setup.mode !== 'ai';});
  }
  function showScreen(next) {
    if (next !== 'game') {killAI(); selected = []; save();}
    screen = next;
    ['home', 'setup', 'game'].forEach(name => {$('screen-' + name).hidden = name !== next;});
    if (next === 'home') renderHome();
    if (next === 'setup') renderSetup();
    if (next === 'game' && game) {render(); scheduleAI();}
    window.scrollTo(0, 0);
  }
  const board = $('board');
  for (let i = 0; i < 49; i++) {
    const cell = document.createElement('button'); cell.className = 'cell'; cell.type = 'button';
    cell.addEventListener('click', () => clickCell(i)); board.appendChild(cell);
  }
  const demo = {9: 1, 16: -1, 22: -1, 23: 1, 24: 1, 25: 1, 26: 1, 31: -1, 37: -1, 38: 1};
  for (let i = 0; i < 49; i++) {
    const cell = document.createElement('div'); cell.className = 'demo-cell';
    if (demo[i]) {cell.classList.add(demo[i] === 1 ? 'x-ink' : 'o-ink'); cell.innerHTML = piece(demo[i]);}
    $('demo-board').appendChild(cell);
  }
  // Keep each sprite a whole number of device pixels per dot (all dots equal size). Falls back to a % size in CSS.
  function snapPieces() {
    const dpr = window.devicePixelRatio || 1;
    [[board, .88], [$('demo-board'), .84]].forEach(([grid, ratio]) => {
      const cell = grid.firstElementChild, w = cell ? cell.clientWidth : 0;
      if (!w) return;
      const dot = Math.max(1, Math.floor(w * ratio * dpr / 11)) / dpr;
      grid.style.setProperty('--pw', (dot * 11) + 'px');
    });
  }
  if (window.ResizeObserver) {
    const watcher = new ResizeObserver(snapPieces);
    watcher.observe(board); watcher.observe($('demo-board'));
  }
  window.addEventListener('resize', snapPieces);
  snapPieces();
  function render() {
    if (!game) return;
    const s = game.state, p = s.p, human = isHuman(), sym = p === 1 ? 'X' : 'O';
    $('game-mode').textContent = game.cfg.mode === 'ai' ? 'AI / ' + names[game.cfg.level] : 'LOCAL / 둘이 대전';
    $('turn-label').textContent = game.ended ? 'GAME OVER' : busy ? 'AI THINKING' : human ? 'YOUR TURN' : 'AI TURN';
    $('status').textContent = game.ended ? (game.winner ? (game.winner === 1 ? 'X' : 'O') + ' 승리!' : '무승부') :
      busy ? 'AI가 생각 중' : (game.cfg.mode === 'human' ? sym + ' 차례' : human ? '내 차례 · ' + sym : 'AI 차례 · ' + sym);
    $('turn-piece').className = 'turn-piece ' + (p === 1 ? 'x-ink' : 'o-ink'); $('turn-piece').innerHTML = piece(p);
    $('hint').textContent = game.ended ? game.reason + ' · 결과를 확인하거나 판을 살펴보세요.' : busy ? '상대의 연결과 탈취 후보를 계산하고 있어요.' :
      aiFailed ? 'AI 실행에 실패했습니다. 메뉴에서 다시 시도할 수 있어요.' :
      s.first ? '첫 턴은 빈칸 하나만 누르세요.' : selected.length ? '빈칸 하나를 더 누르세요. 같은 칸은 취소, 상대 돌은 탈취.' : '빈칸 두 개를 놓거나, 상대 돌 하나를 빼앗으세요.';
    const winning = new Set(s.w ? s.w.cells : []), last = new Set(game.records.length ? game.records[game.records.length - 1].cells : []);
    [...board.children].forEach((cell, i) => {
      const preview = selected.includes(i), value = preview ? p : s.b[i];
      const html = value ? piece(value) : '';
      if (cell.dataset.value !== String(value)) {cell.innerHTML = html; cell.dataset.value = String(value);}
      const effect = !preview && s.b[i] && previousBoard[i] !== s.b[i] ? (previousBoard[i] ? 'capture' : 'pop') : '';
      if (effect) {cell.dataset.effect = effect; cell.dataset.effectUntil = String(Date.now() + 430);}
      cell.className = 'cell' + (value === 1 ? ' x' : value === -1 ? ' o' : '') +
        (preview ? ' preview' : '') + (last.has(i) ? ' last' : '') + (winning.has(i) ? ' win' : '') +
        (GameCore.engine.isLocked(s.lock, i) && s.b[i] === -s.p && !game.ended ? ' locked' : '') + (Number(cell.dataset.effectUntil) > Date.now() ? ' ' + cell.dataset.effect : '');
      cell.style.setProperty('--delay', (i % 7 * 45) + 'ms');
      cell.setAttribute('aria-label', coord(i) + ' ' + (value === 1 ? 'X' : value === -1 ? 'O' : '빈칸') +
        (preview ? ' 미리보기' : '') + (GameCore.engine.isLocked(s.lock, i) && s.b[i] === -s.p ? ' 탈취 금지' : ''));
      cell.disabled = game.ended || busy || !human;
    });
    previousBoard = s.b.slice();
    $('cancel').hidden = !selected.length;
    $('undo').disabled = !game.history.length;
    $('result-button').hidden = !game.ended;
    $('game-rules').hidden = game.ended;
    for (const [symb, side] of [['x', 1], ['o', -1]]) {
      const n = GameCore.engine.counts(s.b, side);
      $(symb + '-count').textContent = n + ' / 3';
      [...$(symb + '-progress').children].forEach((el, i) => el.classList.toggle('on', i < n));
    }
    $('turn-count').textContent = game.records.length + '턴 완료';
    $('ai-info').textContent = game.aiInfo ? '최근 AI ' + (game.aiInfo.ms / 1000).toFixed(2) + '초 · 깊이 ' + game.aiInfo.depth : '';
    $('thinking').hidden = !busy;
    $('moves').replaceChildren();
    game.records.slice(-12).forEach((r, i) => {
      const li = document.createElement('li');
      li.textContent = (r.player === 1 ? 'X' : 'O') + ' · ' + (r.type === 'steal' ? '탈취 ' : '마킹 ') + r.cells.map(coord).join(', ');
      $('moves').appendChild(li);
    });
    $('moves').setAttribute('start', String(Math.max(1, game.records.length - 11)));
    if (storageFailed) $('save-note').textContent = '현재 환경에서 저장이 제한될 수 있습니다. 실제 앱에서 확인해 주세요.';
  }
  function invalid(i, message) {
    sound('invalid'); toast(message);
    const cell = board.children[i]; cell.classList.remove('invalid'); void cell.offsetWidth; cell.classList.add('invalid');
  }
  function clickCell(i) {
    if (!game || game.ended || busy || !isHuman() || $('modal').open || backgrounded) return;
    const s = game.state;
    if (s.b[i] === s.p) {invalid(i, '이미 내 돌이 있는 칸이에요.'); return;}
    if (s.b[i] === -s.p) {
      if (s.first || GameCore.engine.isLocked(s.lock, i)) {invalid(i, GameCore.engine.protectedCell(s.lock) === i ? '방금 둔 선공의 첫 돌은 바로 빼앗을 수 없어요.' : '탈취된 칸은 내 다음 두 턴 동안 다시 빼앗을 수 없어요.'); return;}
      selected = []; commit({type: 'steal', cells: [i]}); return;
    }
    const at = selected.indexOf(i);
    if (at >= 0) {selected.splice(at, 1); sound('select'); render(); return;}
    selected.push(i);
    const b = s.b.slice(); selected.forEach(j => {b[j] = s.p;});
    const need = s.first ? 1 : Math.min(2, s.b.filter(v => v === 0).length);
    if (GameCore.engine.win(b, s.p) || selected.length === need) commit({type: 'place', cells: selected.slice()});
    else {sound('select'); vibrate(); render();}
  }
  function commit(a, info = null) {
    try {GameCore.commit(game, a, info);} catch (e) {aiFailed = true; busy = false; toast(e.message); render(); return;}
    selected = []; aiFailed = false; save(); sound(a.type); vibrate(); render();
    if (game.ended) {
      sound(game.winner ? 'win' : 'draw'); vibrate('win');
      const id = game.id;
      setTimeout(() => {if (game && game.id === id && game.ended && screen === 'game' && !$('modal').open && !backgrounded) showResult();}, 550);
    } else scheduleAI();
  }
  function scheduleAI() {
    if (!game || game.ended || game.cfg.mode !== 'ai' || isHuman() || busy || screen !== 'game' || $('modal').open || backgrounded || aiFailed) return;
    busy = true; render(); const current = ++token;
    try {
      if (!worker) {
        // Blob keeps both the standalone preview and local Capacitor app offline-capable.
        const src = 'const makeEngine=' + makeEngine.toString() + ';const E=makeEngine({K:3,F:5});onmessage=e=>{try{postMessage({ok:true,result:E.choose(e.data.state,e.data.level,e.data.speed)});}catch(err){postMessage({ok:false,error:String(err)});}};';
        workerURL = URL.createObjectURL(new Blob([src], {type: 'text/javascript'})); worker = new Worker(workerURL);
      }
      worker.onmessage = e => {
        if (current !== token) return;
        clearTimeout(workerTimer); workerTimer = null; busy = false;
        if (!e.data.ok) {failAI(e.data.error); return;}
        const result = e.data.result;
        if (result.a) commit(result.a, result);
        else {failAI('AI가 합법적인 수를 찾지 못했습니다.');}
      };
      worker.onerror = e => {if (current === token) failAI(e.message || 'Worker 오류');};
      const base = {easy: 30, medium: 90, hard: 300, extreme: 800}[game.cfg.level];
      const scale = {fast: .55, balanced: 1, deep: 2.5}[game.cfg.speed];
      workerTimer = setTimeout(() => {if (current === token) failAI('시간 초과');}, Math.max(12000, base * scale * 4 + 4000));
      worker.postMessage({state: game.state, level: game.cfg.level, speed: game.cfg.speed});
    } catch (e) {failAI(String(e));}
  }
  function failAI(message) {
    killAI(); aiFailed = true; render();
    toast('AI 실행 오류. 메뉴에서 다시 시도해 주세요.'); console.warn('AI:', message);
  }
  function openModal(kind, title, body) {
    killAI(); modalKind = kind;
    $('modal-title').textContent = title; $('modal-body').innerHTML = body;
    if (!$('modal').open) $('modal').showModal();
    if (screen === 'game') render();
  }
  function closeModal(resume = true) {
    if ($('modal').open) $('modal').close(); modalKind = '';
    if (resume && screen === 'game') {render(); scheduleAI();}
  }
  function showRules() {
    openModal('rules', '플레이 방법', '<ol class="rule-list modal-copy">' +
      '<li><strong>선공 X는 한 칸만</strong> 마킹합니다. 앱에서는 순서를 직접 고르거나 무작위로 정합니다.</li>' +
      '<li>이후에는 <strong>빈칸 두 개 마킹</strong> 또는 <strong>상대 돌 하나 탈취</strong> 중 하나를 합니다.</li>' +
      '<li>첫 빈칸은 미리보기입니다. 같은 칸을 다시 누르면 취소됩니다. 미리보기 중 상대 돌을 누르면 선택을 버리고 탈취합니다.</li>' +
      '<li>상대가 탈취한 칸은 <strong>내 다음 두 턴 동안</strong> 다시 빼앗을 수 없습니다. 점선으로 표시합니다.</li>' +
      '<li><strong>선공이 처음 둔 돌</strong>은 상대의 바로 다음 차례에만 빼앗을 수 없습니다. 그 뒤에는 다른 돌처럼 빼앗을 수 있습니다.</li>' +
      '<li>가로·세로·대각선의 <strong>연속 3목 세 개</strong> 또는 <strong>5목 이상 한 줄</strong>로 즉시 승리합니다. 서로 다른 줄끼리는 돌을 공유해도 되고, 한 줄에 3~4개가 이어져 있어도 3목은 하나로만 셉니다. 2개 이하는 목으로 세지 않습니다.</li>' +
      '<li>두 칸을 놓는 도중 첫 돌로 이기면 즉시 끝납니다. 빈칸이 하나뿐이면 한 칸 마킹이 가능합니다.</li>' +
      '<li>돌 배치·차례·탈취 금지 칸·첫 턴 여부가 같은 상태가 세 번 나오면 무승부입니다.</li></ol>' +
      '<div class="modal-actions"><button class="button primary" data-action="close-modal">알겠어요</button></div>');
  }
  function showSettings() {
    openModal('settings', '소리와 효과',
      '<label class="setting-row"><span><strong>효과음</strong><small>마킹 · 탈취 · 승리</small></span><input id="pref-sound" type="checkbox" '+(prefs.sound?'checked':'')+'></label>' +
      '<label class="setting-row volume-row"><strong>효과음 크기</strong><input id="pref-volume" aria-label="효과음 크기" type="range" min="0" max="100" value="'+Math.round(prefs.volume*100)+'"></label>' +
      '<label class="setting-row"><span><strong>진동</strong><small>지원하는 기기에서 작동합니다.</small></span><input id="pref-vibration" type="checkbox" '+(prefs.vibration?'checked':'')+'></label>' +
      '<label class="setting-row"><span><strong>화면 효과</strong><small>기기의 동작 줄이기 설정도 반영합니다.</small></span><input id="pref-motion" type="checkbox" '+(prefs.motion?'checked':'')+'></label>' +
      '<p class="modal-copy">대국과 설정은 이 기기에만 저장합니다. 로그인·광고·분석 도구는 넣지 않았습니다. 효과음은 코드로 합성합니다.</p>' +
      '<div class="modal-actions"><button class="button secondary" data-action="sound-test">효과음 들어보기</button><button class="button primary" data-action="close-modal">완료</button></div>');
  }
  function showPause() {
    openModal('pause', '잠시 쉬어가기', '<p class="modal-copy">완료한 턴은 저장돼 있어요. 앱을 나갔다 돌아와도 이어서 플레이할 수 있습니다.</p><div class="modal-actions">' +
      '<button class="button primary" data-action="retry-ai">'+(aiFailed?'AI 다시 시도':'계속 플레이')+'</button>' +
      '<button class="button secondary" data-action="pause-new">새 대전 준비</button>' +
      '<button class="button secondary" data-action="pause-home">메인으로</button></div>');
  }
  function showResult() {
    if (!game || !game.ended) return;
    const p = game.winner, outcome = p ? (game.cfg.mode === 'human' ? (p === 1 ? 'X' : 'O') + ' 승리' : p === game.cfg.human ? '내가 이겼어요!' : 'AI가 이겼어요') : '무승부';
    openModal('result', '대국 결과',
      '<div class="result-symbol '+(p===1?'x-ink':'o-ink')+'">'+(p?piece(p):'<strong>DRAW</strong>')+'</div>' +
      '<h3 class="result-headline">'+outcome+'</h3><p class="result-detail">'+game.reason+'</p>' +
      '<div class="result-meta"><div><span>완료한 턴</span><strong>'+game.records.length+'</strong></div><div><span>탈취 횟수</span><strong>'+game.records.filter(r=>r.type==='steal').length+'</strong></div></div>' +
      '<div class="modal-actions"><button class="button primary" data-action="rematch">다시 대전</button><button class="button secondary" data-action="close-modal">판 살펴보기</button><button class="button secondary" data-action="pause-home">메인으로</button></div>');
  }
  function beginGame(fromSetup = true) {
    closeModal(false); killAI();
    const cfg = fromSetup ? {...setup, human: setup.seat === 'random' ? (Math.random()<.5?1:-1) : Number(setup.seat)} : game.cfg;
    game = GameCore.create(cfg); selected = []; previousBoard = Array(49).fill(0); aiFailed = false;
    save(); showScreen('game');
  }
  function requestStart() {
    if (game && !game.ended && game.records.length) {
      openModal('replace', '새 게임을 시작할까요?', '<p class="modal-copy">지금 저장된 대국을 새 대국으로 바꿉니다.</p><div class="modal-actions"><button class="button primary" data-action="replace-start">새 게임 시작</button><button class="button secondary" data-action="close-modal">취소</button></div>');
    } else beginGame();
  }
  async function onBack() {
    if ($('modal').open) {closeModal(); return;}
    if (screen === 'game') {showPause(); return;}
    if (screen === 'setup') {showScreen('home'); return;}
    if (window.NativeBridge && window.NativeBridge.isNative) {
      openModal('exit', '게임을 종료할까요?', '<p class="modal-copy">완료된 턴은 기기에 저장돼 있습니다.</p><div class="modal-actions"><button class="button primary" data-action="exit">종료</button><button class="button secondary" data-action="close-modal">취소</button></div>');
    }
  }
  document.addEventListener('pointerdown', ensureAudio, {passive:true});
  document.addEventListener('click', async e => {
    const pick = e.target.closest('[data-pick]');
    if (pick) {setup[pick.dataset.pick] = pick.dataset.value; write(keys.setup, setup); sound('select'); renderSetup(); return;}
    const b = e.target.closest('[data-action]'); if (!b || b.disabled) return;
    const action = b.dataset.action;
    if (!['sound-test','exit'].includes(action)) sound('select');
    if (action === 'setup') showScreen('setup');
    if (action === 'home') showScreen('home');
    if (action === 'continue') {selected=[]; previousBoard=game.state.b.slice(); showScreen('game'); if(game.ended)showResult();}
    if (action === 'start') requestStart();
    if (action === 'replace-start') beginGame();
    if (action === 'rematch') beginGame(false);
    if (action === 'settings') showSettings();
    if (action === 'rules') showRules();
    if (action === 'pause') showPause();
    if (action === 'result') showResult();
    if (action === 'close-modal') closeModal();
    if (action === 'cancel') {selected=[];render();}
    if (action === 'undo') {
      killAI(); GameCore.undo(game); aiFailed=false; selected=[];previousBoard=game.state.b.slice();save();render();scheduleAI();
    }
    if (action === 'retry-ai') {aiFailed=false;closeModal();}
    if (action === 'pause-home') {closeModal(false);showScreen('home');}
    if (action === 'pause-new') {closeModal(false);showScreen('setup');}
    if (action === 'sound-test') {sound('steal');vibrate();}
    if (action === 'exit' && window.NativeBridge) {save();stopAudio();await window.NativeBridge.exit();}
  });
  function updatePref(e) {
    const id = e.target.id;
    if (id === 'pref-sound') {prefs.sound=e.target.checked;if(!prefs.sound)stopAudio();else ensureAudio();}
    if (id === 'pref-vibration') prefs.vibration=e.target.checked;
    if (id === 'pref-motion') prefs.motion=e.target.checked;
    if (id === 'pref-volume') prefs.volume=Number(e.target.value)/100;
    if (id.startsWith('pref-')) {write(keys.prefs,prefs);applyPrefs();}
  }
  document.addEventListener('input',updatePref);
  document.addEventListener('change',updatePref);
  $('modal').addEventListener('cancel',e=>{e.preventDefault();closeModal();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('modal').open){e.preventDefault();onBack();}});
  function lifecycle(active) {
    backgrounded=!active;
    if (!active) {save();killAI();stopAudio();if(screen==='game')render();}
    else if (screen==='game') {render();scheduleAI();}
  }
  document.addEventListener('visibilitychange',()=>lifecycle(!document.hidden));
  window.addEventListener('pagehide',()=>{save();killAI();stopAudio();});
  window.addEventListener('pageshow',()=>{if(!document.hidden)lifecycle(true);});
  const connectNative=()=>{
    if(window.NativeBridge){window.NativeBridge.onBack(onBack);window.NativeBridge.onState(lifecycle);}
  };
  if(window.NativeReady)window.NativeReady.then(connectNative).catch(()=>{});else connectNative();
  applyPrefs(); renderSetup(); showScreen('home');
})();
