/* あそびばこ 共通キット：保存・音・バー・モーダル・紙ふぶき・ゲームループ */
(function () {
  'use strict';
  /* <script src=".../kit.js" data-ns="..." data-home="..."> で、保存先と🏠の行き先を変えられる（「道具と遊び」で使う） */
  const ME = document.currentScript;
  const NS = (ME && ME.dataset.ns) || 'asobibako:';
  const ROOT = (() => {
    try { return new URL('..', ME.src).href; } catch (e) { return '../../'; }
  })();
  const HOME = ME && ME.dataset.home ? new URL(ME.dataset.home, location.href).href : ROOT + 'index.html';
  const ADULT = !!(ME && ME.dataset.tone === 'adult');

  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(NS + key); return v == null ? fallback : JSON.parse(v); }
      catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(NS + key, JSON.stringify(value)); return true; }
      catch (e) { return false; }
    },
    remove(key) { try { localStorage.removeItem(NS + key); } catch (e) { /* なにもしない */ } },
  };

  const settings = Object.assign({ sound: true, music: true, vibrate: true }, store.get('settings', {}));
  function saveSettings() { store.set('settings', settings); }
  const theme = store.get('theme', 'auto');
  if (theme !== 'auto') document.documentElement.dataset.theme = theme;

  /* ---------- 音 ---------- */
  let ctx = null, master = null;
  function audio() {
    if (!ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      ctx = new C();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  ['pointerdown', 'keydown', 'touchstart'].forEach(ev =>
    window.addEventListener(ev, () => { if (settings.sound || settings.music) audio(); }, { passive: true }));

  function tone(freq, dur, opt = {}) {
    const a = audio(); if (!a) return;
    const t = a.currentTime + (opt.delay || 0);
    const o = a.createOscillator(), g = a.createGain();
    o.type = opt.type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (opt.slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + opt.slide), t + dur);
    const vol = opt.vol == null ? 0.25 : opt.vol;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(opt.out || master);
    o.start(t); o.stop(t + dur + 0.02);
    o.onended = () => { o.disconnect(); g.disconnect(); };
  }
  function noise(dur, opt = {}) {
    const a = audio(); if (!a) return;
    const t = a.currentTime + (opt.delay || 0);
    const len = Math.floor(a.sampleRate * dur);
    const buf = a.createBuffer(1, len, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = a.createBufferSource(), g = a.createGain(), f = a.createBiquadFilter();
    f.type = opt.filter || 'lowpass'; f.frequency.value = opt.freq || 1200;
    s.buffer = buf; g.gain.value = opt.vol == null ? 0.3 : opt.vol;
    s.connect(f); f.connect(g); g.connect(opt.out || master);
    s.start(t);
    s.onended = () => { s.disconnect(); f.disconnect(); g.disconnect(); };
  }
  const SFX = {
    tap: () => tone(660, 0.06, { type: 'triangle', vol: 0.15 }),
    select: () => { tone(520, 0.07, { type: 'square', vol: 0.08 }); tone(780, 0.08, { type: 'square', vol: 0.08, delay: 0.05 }); },
    good: () => { tone(880, 0.1, { type: 'triangle' }); tone(1320, 0.14, { type: 'triangle', delay: 0.07 }); },
    bad: () => tone(220, 0.25, { type: 'sawtooth', vol: 0.12, slide: -90 }),
    pop: () => tone(500, 0.08, { type: 'sine', vol: 0.3, slide: 500 }),
    drop: () => tone(420, 0.15, { type: 'sine', vol: 0.3, slide: -260 }),
    jump: () => tone(300, 0.15, { type: 'square', vol: 0.08, slide: 400 }),
    hit: () => { noise(0.12, { vol: 0.35, freq: 900 }); tone(140, 0.1, { type: 'square', vol: 0.12 }); },
    boom: () => { noise(0.5, { vol: 0.5, freq: 500 }); tone(90, 0.4, { type: 'sine', vol: 0.4, slide: -50 }); },
    coin: () => { tone(988, 0.06, { type: 'square', vol: 0.08 }); tone(1319, 0.18, { type: 'square', vol: 0.08, delay: 0.06 }); },
    tick: () => tone(1200, 0.03, { type: 'square', vol: 0.05 }),
    whoosh: () => noise(0.18, { vol: 0.2, freq: 2500, filter: 'bandpass' }),
    win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i === 3 ? 0.5 : 0.14, { type: 'triangle', delay: i * 0.12 })),
    lose: () => [392, 330, 262].forEach((f, i) => tone(f, 0.3, { type: 'triangle', vol: 0.2, delay: i * 0.2 })),
    alarm: () => [0, 0.25, 0.5].forEach(d => tone(880, 0.18, { type: 'square', vol: 0.1, delay: d })),
  };
  function sfx(name) {
    if (!settings.sound) return;
    try { (SFX[name] || SFX.tap)(); } catch (e) { /* 音が出せない環境でも止めない */ }
  }

  /* かんたんBGM：notes は [周波数 or 0] の配列。1つだけ鳴る */
  const music = {
    timer: null, step: 0, opts: null,
    play(opts) {
      this.stop();
      this.opts = Object.assign({ bpm: 120, lead: [], bass: [], type: 'triangle', vol: 0.06 }, opts);
      const ms = 60000 / this.opts.bpm / 2;
      this.step = 0;
      this.timer = setInterval(() => {
        if (!settings.music || document.hidden) return;
        const o = this.opts, i = this.step++;
        const n = o.lead.length ? o.lead[i % o.lead.length] : 0;
        const b = o.bass.length ? o.bass[i % o.bass.length] : 0;
        if (n) tone(n, ms / 1000 * 0.9, { type: o.type, vol: o.vol });
        if (b) tone(b, ms / 1000 * 1.6, { type: 'sine', vol: o.vol * 1.4 });
      }, ms);
    },
    stop() { if (this.timer) clearInterval(this.timer); this.timer = null; },
  };

  function vibrate(p) { if (settings.vibrate && navigator.vibrate) { try { navigator.vibrate(p); } catch (e) { /* なし */ } } }

  /* ---------- 文字・乱数 ---------- */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* ---------- UI ---------- */
  function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }

  function modal({ title = '', body = '', actions = [{ label: ADULT ? '閉じる' : 'とじる', primary: true }], dismissable = true } = {}) {
    const back = el('<div class="k-modal-back"><div class="k-modal" role="dialog" aria-modal="true"></div></div>');
    const box = back.firstElementChild;
    if (title) box.appendChild(el(`<h2>${title}</h2>`));
    const content = document.createElement('div');
    if (typeof body === 'string') content.innerHTML = body; else if (body) content.appendChild(body);
    box.appendChild(content);
    const row = el('<div class="k-actions"></div>');
    const close = () => { back.remove(); document.removeEventListener('keydown', onKey); };
    actions.forEach(a => {
      const b = el(`<button class="k-btn ${a.primary ? 'is-sun' : ''} ${a.cls || ''}">${a.label}</button>`);
      b.onclick = () => { sfx('tap'); const keep = a.onClick && a.onClick() === false; if (!keep && a.close !== false) close(); };
      row.appendChild(b);
    });
    box.appendChild(row);
    function onKey(e) { if (e.key === 'Escape' && dismissable) close(); }
    document.addEventListener('keydown', onKey);
    if (dismissable) back.addEventListener('click', e => { if (e.target === back) close(); });
    document.body.appendChild(back);
    const first = row.querySelector('.is-sun') || row.querySelector('button');
    if (first) first.focus({ preventScroll: true });
    return { close, box: content };
  }
  function ask(message, yes = 'はい', no = 'いいえ') {
    return new Promise(res => modal({
      title: message, body: '', dismissable: false,
      actions: [{ label: no, onClick: () => res(false) }, { label: yes, primary: true, onClick: () => res(true) }],
    }));
  }
  let toastTimer = null;
  function toast(msg, ms = 1800) {
    document.querySelectorAll('.k-toast').forEach(t => t.remove());
    const t = el(`<div class="k-toast" role="status">${esc(msg)}</div>`);
    document.body.appendChild(t);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.remove(), ms);
  }

  function confetti(ms = 2600) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const c = document.createElement('canvas');
    c.className = 'k-confetti';
    document.body.appendChild(c);
    const g = c.getContext('2d');
    const dpr = Math.min(2, devicePixelRatio || 1);
    c.width = innerWidth * dpr; c.height = innerHeight * dpr; g.scale(dpr, dpr);
    const colors = ['#ffc93c', '#4cb8ff', '#4fcf7a', '#ff5d8f', '#9b6bff', '#ff8a3d'];
    const ps = Array.from({ length: 140 }, () => ({
      x: rand(0, innerWidth), y: rand(-innerHeight, 0), vx: rand(-60, 60), vy: rand(120, 320),
      r: rand(0, Math.PI), vr: rand(-6, 6), w: rand(6, 12), h: rand(8, 16), c: pick(colors),
    }));
    const start = performance.now(); let last = start;
    (function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      g.clearRect(0, 0, innerWidth, innerHeight);
      ps.forEach(p => {
        p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt;
        g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c; g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); g.restore();
      });
      if (now - start < ms) requestAnimationFrame(frame); else c.remove();
    })(start);
  }

  /* ---------- 記録 ---------- */
  function best(id, score, { lower = false } = {}) {
    const key = 'best:' + id;
    const prev = store.get(key, null);
    const isNew = prev == null || (lower ? score < prev : score > prev);
    if (isNew) store.set(key, score);
    return { best: isNew ? score : prev, prev, isNew };
  }
  function getBest(id) { return store.get('best:' + id, null); }
  function addWin(id) { const n = (store.get('best:' + id, 0) || 0) + 1; store.set('best:' + id, n); return n; }

  /* ---------- ゲームループ（dt は秒、タブを離れたら止まる） ---------- */
  function loop(update) {
    let raf = 0, last = 0, running = false;
    function frame(now) {
      if (!running) return;
      const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now;
      update(dt);
      raf = requestAnimationFrame(frame);
    }
    const api = {
      start() { if (running) return; running = true; last = performance.now(); raf = requestAnimationFrame(frame); },
      stop() { running = false; cancelAnimationFrame(raf); },
      get running() { return running; },
    };
    return api;
  }

  /* キャンバスを親要素いっぱいにして、高解像度に合わせる。論理サイズを返す */
  function fitCanvas(canvas, w, h) {
    const dpr = Math.min(2, devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    w = w || rect.width; h = h || rect.height;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w, h, g };
  }

  let wake = null;
  async function keepAwake(on = true) {
    try {
      if (on && 'wakeLock' in navigator && !wake) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); }
      if (!on && wake) { await wake.release(); wake = null; }
    } catch (e) { wake = null; }
  }

  /* ---------- 上のバー ---------- */
  function bar({ id, title, help, extra } = {}) {
    if (id) { const r = store.get('recent', []).filter(x => x !== id); r.unshift(id); store.set('recent', r.slice(0, 6)); }
    const h = el(`<header class="kbar">
      <a class="k-btn k-icon" href="${HOME}" aria-label="ホームへもどる" title="ホーム">${ADULT ? '←' : '🏠'}</a>
      <h1>${title}</h1>
      <span class="kbar-extra"></span>
      ${help ? `<button class="k-btn k-icon" data-k="help" aria-label="${ADULT ? '使い方' : 'あそびかた'}" title="${ADULT ? '使い方' : 'あそびかた'}">？</button>` : ''}
      <button class="k-btn k-icon" data-k="sound" aria-label="おと"></button>
    </header>`);
    const sb = h.querySelector('[data-k="sound"]');
    const paint = () => { sb.textContent = settings.sound ? '🔊' : '🔇'; sb.setAttribute('aria-pressed', String(settings.sound)); };
    paint();
    sb.onclick = () => {
      settings.sound = !settings.sound; settings.music = settings.sound; saveSettings(); paint();
      if (!settings.music) music.stop();
      toast(ADULT ? (settings.sound ? '音：オン' : '音：オフ') : (settings.sound ? 'おと：オン' : 'おと：オフ'));
    };
    if (help) h.querySelector('[data-k="help"]').onclick = () => modal({ title: ADULT ? '使い方' : 'あそびかた', body: help, actions: [{ label: ADULT ? '閉じる' : 'とじる', primary: true }] });
    if (extra) h.querySelector('.kbar-extra').appendChild(extra);
    document.body.prepend(h);
    return h;
  }

  /* ---------- オフライン対応（Claude のプレビューでは使えないので静かに諦める） ---------- */
  if ('serviceWorker' in navigator && location.protocol === 'https:' && !/claude\.ai|claudeusercontent/.test(location.host)) {
    window.addEventListener('load', () => { navigator.serviceWorker.register(ROOT + 'sw.js').catch(() => {}); });
  }

  /* 音声入力：対応ブラウザなら🎤ボタンを作る（ないときは null） */
  function micButton(input, { onDone, cls = 'k-btn is-small' } = {}) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return null;
    const b = el(`<button type="button" class="${cls}" aria-label="こえで入力">🎤</button>`);
    let rec = null;
    const stop = () => { if (rec) { try { rec.stop(); } catch (e) {} } };
    b.onclick = () => {
      if (rec) return stop();
      rec = new SR(); rec.lang = 'ja-JP'; rec.interimResults = true; rec.maxAlternatives = 1;
      const before = input.value;
      let finalText = '';
      b.textContent = ADULT ? '👂 聞き取り中…' : '👂 きいてるよ…'; b.classList.add('is-berry'); sfx('select');
      rec.onresult = e => {
        let interim = ''; finalText = '';
        for (const r of e.results) (r.isFinal ? (finalText += r[0].transcript) : (interim += r[0].transcript));
        input.value = (before ? before : '') + (finalText || interim).replace(/[。、]$/, '');
        input.dispatchEvent(new Event('input'));
      };
      rec.onerror = e => { toast(ADULT ? (e.error === 'not-allowed' ? 'マイクが許可されていません' : e.error === 'no-speech' ? '聞き取れませんでした' : '音声入力に失敗しました') : (e.error === 'not-allowed' ? 'マイクがゆるされていないよ' : e.error === 'no-speech' ? 'きこえなかったよ。もういちど！' : 'うまくきけなかったよ')); };
      rec.onend = () => { rec = null; b.textContent = '🎤'; b.classList.remove('is-berry'); if (finalText && onDone) onDone(input.value); };
      try { rec.start(); } catch (e) { rec = null; b.textContent = '🎤'; b.classList.remove('is-berry'); }
    };
    return b;
  }

  window.Kit = { ROOT, HOME, ADULT, micButton, store, settings, saveSettings, audio, tone, noise, sfx, music, vibrate, esc, shuffle, rand, randInt, pick, clamp, el, modal, ask, toast, confetti, best, getBest, addWin, loop, fitCanvas, keepAwake, bar };
})();
