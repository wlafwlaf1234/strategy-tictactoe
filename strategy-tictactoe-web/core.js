'use strict';
const GameCore = (() => {
  const engine = makeEngine({K: 3, F: 5});
  const RULES = 'k3f5l2p1';
  const levels = ['easy', 'medium', 'hard', 'extreme'];
  function config(input = {}) {
    return {
      mode: input.mode === 'human' ? 'human' : 'ai',
      level: levels.includes(input.level) ? input.level : 'medium',
      speed: ['fast', 'balanced', 'deep'].includes(input.speed) ? input.speed : 'fast',
      human: input.human === -1 ? -1 : 1
    };
  }
  function key(s) { return s.b.join(',') + '|' + s.p + '|' + s.lock + '|' + s.first; }
  function initial() { return {b: Array(49).fill(0), p: 1, lock: -1, first: true, w: null}; }
  function create(input = {}) {
    const state = initial();
    return {id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      cfg: config(input), state, records: [], history: [], seen: new Map([[key(state), 1]]),
      ended: false, winner: null, reason: '', startedAt: Date.now(), aiInfo: null};
  }
  function legal(s, a) {
    if (s.w || !a || !['place', 'steal'].includes(a.type) || !Array.isArray(a.cells)) return false;
    if (a.cells.length < 1 || a.cells.length > 2 || new Set(a.cells).size !== a.cells.length) return false;
    if (a.cells.some(i => !Number.isInteger(i) || i < 0 || i > 48)) return false;
    if (a.type === 'steal') return !s.first && a.cells.length === 1 && s.b[a.cells[0]] === -s.p && !engine.isLocked(s.lock, a.cells[0]);
    if (a.cells.some(i => s.b[i] !== 0)) return false;
    const need = s.first ? 1 : Math.min(2, s.b.filter(v => v === 0).length);
    if (a.cells.length === need) return true;
    if (a.cells.length === 1 && need === 2) {
      const b = s.b.slice(); b[a.cells[0]] = s.p;
      return !!engine.win(b, s.p);
    }
    return false;
  }
  function hasAction(s) {
    return s.b.some(v => v === 0) || (!s.first && s.b.some((v, i) => v === -s.p && !engine.isLocked(s.lock, i)));
  }
  function commit(g, a, info = null) {
    if (g.ended || !legal(g.state, a)) throw new Error('합법적인 행동이 아닙니다.');
    g.history.push({state: g.state, ended: g.ended, winner: g.winner, reason: g.reason, aiInfo: g.aiInfo});
    const player = g.state.p;
    g.state = engine.next(g.state, a);
    g.records.push({player, type: a.type, cells: g.state.used.slice(), ai: g.cfg.mode === 'ai' && player !== g.cfg.human});
    if (info) g.aiInfo = {ms: info.ms, depth: info.depth, reason: info.reason};
    if (g.state.w) {
      g.ended = true; g.winner = player;
      g.reason = g.state.w.kind === '5目' ? '5목 이상 완성' : '3목 세 개 완성';
    } else {
      const k = key(g.state), n = (g.seen.get(k) || 0) + 1;
      g.seen.set(k, n);
      if (n >= 3 || !hasAction(g.state)) {
        g.ended = true; g.winner = null; g.reason = n >= 3 ? '같은 상태가 세 번 반복됨' : '가능한 행동이 없음';
      }
    }
    return g;
  }
  function rebuildSeen(g) {
    g.seen = new Map();
    for (const s of g.history.map(h => h.state).concat(g.state)) {
      const k = key(s); g.seen.set(k, (g.seen.get(k) || 0) + 1);
    }
  }
  function undo(g) {
    if (!g.history.length) return false;
    do {
      const h = g.history.pop(); Object.assign(g, h); g.records.pop();
    } while (g.cfg.mode === 'ai' && g.state.p !== g.cfg.human && g.history.length);
    rebuildSeen(g); return true;
  }
  function snapshot(g) {
    return {schema: 1, rules: RULES, id: g.id, cfg: g.cfg, records: g.records, startedAt: g.startedAt};
  }
  function restore(data) {
    if (!data || data.schema !== 1 || data.rules !== RULES || !Array.isArray(data.records) || data.records.length > 10000) throw new Error('저장 형식 오류');
    const g = create(data.cfg);
    for (const a of data.records) {
      if (a.player !== g.state.p || g.ended) throw new Error('저장 수순 오류');
      commit(g, {type: a.type, cells: a.cells});
    }
    if (typeof data.id === 'string' && data.id.length < 100) g.id = data.id;
    if (Number.isFinite(data.startedAt)) g.startedAt = data.startedAt;
    return g;
  }
  return {engine, config, key, create, legal, hasAction, commit, undo, snapshot, restore};
})();
if(typeof module !== 'undefined') module.exports = GameCore;
