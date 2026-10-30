/* あそびばこ オンライン対戦：PeerJS の無料サーバーで、べつべつのスマホ・タブレットをつなぐ（登録なし・へやばんごうで参加）
   つかいかた：
     Net.open({ game: 'connect4', min: 2, max: 2, opts: () => ({...}), onStart(room) {...}, onLeave(name) {...} })
     room.me / room.players / room.isHost / room.opts / room.rng（全員でおなじ乱数）
     room.move(m) で自分の手を送り、room.next() で次の手（だれのでも）を順番に受け取る
     room.send(msg) と room.onMessage で、それ以外のやりとり。room.again() でもう一回、room.close() でおわり */
(function () {
  'use strict';
  const ME = document.currentScript;
  const BASE = (() => { try { return new URL('.', ME.src).href; } catch (e) { return '../../common/'; } })();
  const T = (kid, adult) => (Kit.ADULT ? adult : kid);
  const PREFIX = 'asobibako-';
  const HEARTBEAT = 3000, DEAD = 20000, CONNECT_TIMEOUT = 15000;

  // ふだんは PeerJS の無料サーバー。テストのときだけ window.ASOBI_PEER でかえられる
  const peerOpts = () => Object.assign({ debug: 0 }, window.ASOBI_PEER || {});
  let libP = null;
  function loadLib() {
    if (window.Peer) return Promise.resolve();
    if (!libP) libP = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = BASE + 'vendor/peerjs.min.js';
      s.onload = res; s.onerror = () => { libP = null; s.remove(); rej(Object.assign(new Error('lib'), { type: 'lib' })); };
      document.head.appendChild(s);
    });
    return libP;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  /* おなじ乱数でまぜる（全員でおなじ結果になる） */
  function shuffleWith(rng, a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  function errText(type) {
    switch (type) {
      case 'peer-unavailable': return T('へやが見つからないよ。ばんごうを たしかめてね', 'ルームが見つかりません。番号を確認してください');
      case 'browser-incompatible': return T('このブラウザでは つかえないよ', 'このブラウザでは使えません');
      case 'timeout': return T('つながらなかったよ。おなじWi-Fiに つないで、もういちど ためしてね', '接続できませんでした。同じWi-Fiにつないで、もう一度試してください');
      case 'full': return T('へやが いっぱいだよ', 'ルームが満員です');
      case 'started': return T('もう ゲームが はじまっているよ', 'すでにゲームが始まっています');
      case 'host-left': return T('へやが なくなったよ', 'ルームが閉じられました');
      case 'lib': case 'network': case 'server-error': case 'socket-error': case 'socket-closed': case 'unavailable-id':
        return T('サーバーに つながらないよ。インターネットに つながっているか たしかめてね', 'サーバーに接続できません。インターネット接続を確認してください');
      default: return T('うまく つながらなかったよ。もういちど ためしてね', '接続に失敗しました。もう一度試してください');
    }
  }

  /* ---------- へや ---------- */
  function makeRoom(peer, game, isHost, name) {
    const room = {
      game, isHost, code: '', me: -1, players: [{ id: peer.id, name }], opts: null, seed: 0, rng: Math.random,
      peerId: peer.id, round: 0, seq: 0, started: false, closed: false, onMessage: null, onLeave: null, onLobby: null, onStart: null, max: 2,
    };
    const conns = new Map();   // peer id → { conn, seen }
    const buf = new Map(); let waiter = null;

    function rawSend(msg, exceptId) { conns.forEach((c, id) => { if (id !== exceptId && c.conn.open) { try { c.conn.send(msg); } catch (e) { /* なにもしない */ } } }); }
    function pump() {
      if (!waiter || !buf.has(room.seq)) return;
      const m = buf.get(room.seq); buf.delete(room.seq); room.seq++;
      const w = waiter; waiter = null; w(m);
    }
    function applyStart(msg) {
      room.round = msg.r; room.seed = msg.seed; room.rng = mulberry32(msg.seed);
      room.players = msg.players; room.opts = msg.opts; room.me = msg.players.findIndex(p => p.id === peer.id);
      room.seq = 0; buf.clear(); waiter = null; room.started = true;
      if (room.onStart) room.onStart(room);
    }
    function deliver(msg, fromId) {
      if (msg.t === 'ping') return;
      if (msg.t === 'mv') { if (msg.r === room.round) { buf.set(msg.n, msg.m); pump(); } return; }
      if (msg.t === 'start') return applyStart(msg);
      if (msg.t === 'again') { if (room.isHost) room.again(); return; }
      if (msg.t === 'lobby') { room.players = msg.players; if (room.onLobby) room.onLobby(); return; }
      if (msg.t === 'left') return lost(msg.name);
      if (room.onMessage) room.onMessage(msg, room.players.findIndex(p => p.id === fromId));
    }
    function lost(who) {
      if (room.closed) return;
      if (room.started) { room.close(); if (room.onLeave) room.onLeave(who); }
      else if (!room.isHost) { room.close(); if (room.onError) room.onError('host-left'); }
    }
    function watch(id, conn) {
      const c = { conn, seen: Date.now() };
      conns.set(id, c);
      conn.on('data', msg => {
        c.seen = Date.now();
        if (!msg || typeof msg !== 'object') return;
        if (room.isHost) {
          if (msg.t === 'hello') return hello(id, conn, msg);
          if (!room.players.some(p => p.id === id)) return;
          if (msg.t !== 'ping' && msg.t !== 'again') rawSend(msg, id);   // ほかの人にもとどける
          msg.from = id;
        }
        deliver(msg, room.isHost ? id : msg.from);
      });
      const gone = () => {
        if (!conns.has(id)) return;
        conns.delete(id);
        if (room.closed) return;
        if (!room.isHost) return lost(room.players[0] ? room.players[0].name : '');
        const p = room.players.find(x => x.id === id);
        if (!p) return;
        if (room.started) { rawSend({ t: 'left', name: p.name }); lost(p.name); }
        else { room.players = room.players.filter(x => x !== p); rawSend({ t: 'lobby', players: room.players }); if (room.onLobby) room.onLobby(); }
      };
      conn.on('close', gone); conn.on('error', gone);
      c.gone = gone;
    }
    function hello(id, conn, msg) {
      const deny = why => { try { conn.send({ t: 'deny', why }); } catch (e) { /* なにもしない */ } setTimeout(() => conn.close(), 400); conns.delete(id); };
      if (room.started) return deny('started');
      if (room.players.length >= room.max) return deny('full');
      room.players.push({ id, name: String(msg.name || '').slice(0, 10) || T('ともだち', 'ゲスト') });
      rawSend({ t: 'lobby', players: room.players });
      if (room.onLobby) room.onLobby();
    }
    const beat = setInterval(() => {
      const now = Date.now();
      conns.forEach(c => { if (c.conn.open) { try { c.conn.send({ t: 'ping' }); } catch (e) { /* なにもしない */ } } if (now - c.seen > DEAD) { try { c.conn.close(); } catch (e) { /* なにもしない */ } if (c.gone) c.gone(); } });
    }, HEARTBEAT);

    room.watch = watch;
    room.send = msg => { msg = Object.assign({}, msg, { from: peer.id }); rawSend(msg); };
    room.move = m => { room.send({ t: 'mv', r: room.round, n: room.seq++, m }); };
    room.next = () => new Promise(res => { waiter = res; pump(); });
    room.start = opts => {
      if (!room.isHost) return;
      const msg = { t: 'start', r: room.round + 1, seed: Math.floor(Math.random() * 2 ** 31), players: room.players, opts: opts === undefined ? room.opts : opts };
      rawSend(msg); applyStart(msg);
    };
    room.again = opts => { if (room.closed) return; if (room.isHost) room.start(opts); else room.send({ t: 'again' }); };
    room.name = i => (room.players[i] ? room.players[i].name : '');
    room.close = () => {
      if (room.closed) return;
      room.closed = true; clearInterval(beat); waiter = null;
      conns.forEach(c => { try { c.conn.close(); } catch (e) { /* なにもしない */ } });
      conns.clear();
      setTimeout(() => { try { peer.destroy(); } catch (e) { /* なにもしない */ } }, 300);
      if (Net.room === room) Net.room = null;
    };
    return room;
  }

  function createRoom(game, name, max) {
    return loadLib().then(() => new Promise((res, rej) => {
      let tries = 0;
      const attempt = () => {
        const code = String(Math.floor(1000 + Math.random() * 9000));
        const peer = new window.Peer(PREFIX + game + '-' + code, peerOpts());
        let ok = false;
        peer.on('open', () => {
          ok = true;
          const room = makeRoom(peer, game, true, name);
          room.code = code; room.max = max;
          peer.on('connection', conn => conn.on('open', () => room.watch(conn.peer, conn)));
          peer.on('disconnected', () => { if (!room.closed && !room.started) { try { peer.reconnect(); } catch (e) { /* なにもしない */ } } });
          res(room);
        });
        peer.on('error', e => {
          if (ok) return;
          try { peer.destroy(); } catch (x) { /* なにもしない */ }
          if (e.type === 'unavailable-id' && ++tries < 4) return attempt();
          rej(e);
        });
      };
      attempt();
    }));
  }
  function joinRoom(game, code, name, onLobby) {
    return loadLib().then(() => new Promise((res, rej) => {
      const peer = new window.Peer(peerOpts());
      let done = false;
      const fail = e => { if (done) return; done = true; clearTimeout(timer); try { peer.destroy(); } catch (x) { /* なにもしない */ } rej(e); };
      const timer = setTimeout(() => fail({ type: 'timeout' }), CONNECT_TIMEOUT);
      peer.on('error', e => fail(e));
      peer.on('open', () => {
        const conn = peer.connect(PREFIX + game + '-' + code, { reliable: true, serialization: 'json' });
        conn.on('open', () => {
          const room = makeRoom(peer, game, false, name);
          room.code = code; room.players = [];
          room.onLobby = onLobby;
          room.watch(conn.peer, conn);
          conn.on('data', msg => {
            if (msg && msg.t === 'deny') { room.close(); fail({ type: msg.why }); }
            else if (msg && msg.t === 'lobby' && !done) { done = true; clearTimeout(timer); res(room); }
          });
          conn.send({ t: 'hello', name });
        });
        conn.on('error', e => fail(e));
      });
    }));
  }

  /* ---------- へやの画面 ---------- */
  const css = document.createElement('style');
  css.textContent = `
    .n-code { font-family: var(--display); font-size: clamp(2.6rem, 14vw, 3.6rem); letter-spacing: .18em; text-align: center; line-height: 1.1; }
    .n-code-in { font-family: var(--display); font-size: 2.2rem; letter-spacing: .3em; text-align: center; width: 100%; }
    .n-ppl { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; min-height: 44px; }
    .n-ppl span { padding: 6px 12px; border: 3px solid var(--line); border-radius: 999px; background: var(--card); font-weight: 900; }
    .n-ppl span.me { background: var(--sun); color: var(--on-color); }
    .n-ppl span.empty { border-style: dashed; opacity: .45; }
    .n-err { color: var(--berry); font-weight: 900; text-align: center; margin: 0; }
    .n-hint { text-align: center; margin: 0; color: var(--muted); font-size: .9rem; }
    .n-big { display: grid; gap: 10px; }
    .n-dots::after { content: ""; animation: n-dots 1.2s steps(4) infinite; }
    @keyframes n-dots { 0% { content: ""; } 25% { content: "・"; } 50% { content: "・・"; } 75% { content: "・・・"; } }`;
  document.head.appendChild(css);

  function open(cfg) {
    const { game, min = 2, max = 2 } = cfg;
    if (Net.room) { Net.room.close(); Net.room = null; }
    const back = Kit.el('<div class="k-modal-back"><div class="k-modal" role="dialog" aria-modal="true"></div></div>');
    const box = back.firstElementChild;
    document.body.appendChild(back);
    let room = null, view = 'home', err = '', alive = true;
    let name = Kit.store.get('net:name', '') || '';
    const close = () => { alive = false; back.remove(); };
    const cancel = () => { if (room) room.close(); room = null; Net.room = null; close(); if (cfg.onCancel) cfg.onCancel(); };
    const fail = e => { if (!alive) return; room = null; err = errText(e && e.type); view = view === 'joining' ? 'join' : 'home'; Kit.sfx('bad'); render(); };

    function people() {
      const ppl = (room ? room.players : []).map(p => `<span class="${p.id === (room && room.peerId) ? 'me' : ''}">${Kit.esc(p.name)}</span>`);
      for (let i = ppl.length; i < min; i++) ppl.push(`<span class="empty">？</span>`);
      return `<div class="n-ppl">${ppl.join('')}</div>`;
    }
    function render() {
      if (!alive) return;
      const errHtml = err ? `<p class="n-err">⚠️ ${Kit.esc(err)}</p>` : '';
      let h = '';
      if (view === 'home') {
        h = `<h2>📡 ${T('オンライン', 'オンライン対戦')}</h2>
          <div class="n-big">
            <span class="k-label">${T('なまえ', '名前')}</span>
            <input class="k-input" id="nName" maxlength="10" value="${Kit.esc(name)}" placeholder="${T('なまえ', '名前')}">
            <button class="k-btn is-sun is-big" id="nHost">🏠 ${T('へやを つくる', 'ルームを作る')}</button>
            <button class="k-btn is-sky is-big" id="nJoin">🚪 ${T('へやに はいる', 'ルームに入る')}</button>
            ${errHtml}
          </div>
          <div class="k-actions"><button class="k-btn" id="nX">${T('やめる', 'やめる')}</button></div>`;
      } else if (view === 'creating' || view === 'joining') {
        h = `<h2 class="n-dots">${T('つないでいます', '接続しています')}</h2>
          <div class="k-actions"><button class="k-btn" id="nX">${T('やめる', 'やめる')}</button></div>`;
      } else if (view === 'host') {
        const n = room.players.length;
        h = `<span class="k-label" style="text-align:center">${T('へやばんごう', 'ルーム番号')}</span>
          <div class="n-code">${room.code}</div>
          ${people()}
          <p class="n-hint">${n < min ? T('ほかの人は このばんごうで はいってね', '相手はこの番号で入室') : `${n}${T('人', '人')} ✓`}</p>
          ${errHtml}
          <div class="k-actions">
            <button class="k-btn" id="nX">${T('やめる', 'やめる')}</button>
            <button class="k-btn" id="nShare">🔗 ${T('さそう', '招待')}</button>
            <button class="k-btn is-sun" id="nGo" ${n < min ? 'disabled' : ''}>${T('スタート', '開始')}</button>
          </div>`;
      } else if (view === 'join') {
        h = `<span class="k-label">${T('なまえ', '名前')}</span>
          <input class="k-input" id="nName" maxlength="10" value="${Kit.esc(name)}" placeholder="${T('なまえ', '名前')}">
          <span class="k-label">🚪 ${T('へやばんごう', 'ルーム番号')}</span>
          <input class="k-input n-code-in" id="nCode" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" placeholder="0000" value="${Kit.esc(cfg._code || '')}">
          ${errHtml}
          <div class="k-actions">
            <button class="k-btn" id="nBack">${T('もどる', '戻る')}</button>
            <button class="k-btn is-sun" id="nEnter">${T('はいる', '入る')}</button>
          </div>`;
      } else if (view === 'wait') {
        h = `<span class="k-label" style="text-align:center">${T('へやばんごう', 'ルーム番号')}</span>
          <div class="n-code">${room.code}</div>
          ${people()}
          <p class="n-hint n-dots">${T('へやを つくった人が スタートするのを まってね', '開始を待っています')}</p>
          <div class="k-actions"><button class="k-btn" id="nX">${T('やめる', 'やめる')}</button></div>`;
      }
      box.innerHTML = h;
      const on = (id, f) => { const b = box.querySelector('#' + id); if (b) b.onclick = () => { Kit.sfx('tap'); f(); }; };
      const nm = box.querySelector('#nName');
      if (nm) nm.oninput = () => { name = nm.value; };
      const takeName = () => { name = (name || '').trim() || T('なまえなし', 'ゲスト'); Kit.store.set('net:name', name); };
      on('nX', cancel);
      on('nHost', () => {
        takeName(); err = ''; view = 'creating'; render();
        createRoom(game, name, max).then(r => {
          if (!alive) { r.close(); return; }
          room = r; Net.room = r;
          r.onLobby = () => { Kit.sfx('pop'); render(); };
          view = 'host'; render();
        }, fail);
      });
      on('nJoin', () => { takeName(); err = ''; view = 'join'; render(); });
      on('nBack', () => { err = ''; view = 'home'; render(); });
      on('nShare', () => {
        const url = location.origin + location.pathname + '#join=' + room.code;
        const text = T(`あそびばこで いっしょに あそぼう！ へやばんごう ${room.code}`, `ルーム番号 ${room.code}`);
        if (navigator.share) navigator.share({ title: document.title, text, url }).catch(() => {});
        else if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => Kit.toast(T('リンクを コピーしたよ', 'リンクをコピーしました')), () => {});
      });
      on('nGo', () => {
        if (room.players.length < min) return;
        room.onLobby = null; close();
        bind(room, cfg);
        room.start(cfg.opts ? cfg.opts() : null);
      });
      const code = box.querySelector('#nCode');
      if (code) {
        const enter = () => {
          const c = code.value.replace(/\D/g, '');
          if (c.length !== 4) { err = T('4けたの ばんごうを 入れてね', '4桁の番号を入力してください'); render(); return; }
          takeName(); cfg._code = c; err = ''; view = 'joining'; render();
          let ready = false;
          joinRoom(game, c, name, () => { if (ready) render(); }).then(r => {
            if (!alive) { r.close(); return; }
            room = r; Net.room = r; ready = true;
            bind(r, cfg, () => close());
            r.onError = e => { if (alive) { room = null; err = errText(e); view = 'home'; render(); } };
            view = 'wait'; render();
          }, fail);
        };
        code.oninput = () => { code.value = code.value.replace(/\D/g, '').slice(0, 4); if (code.value.length === 4) enter(); };
        code.onkeydown = e => { if (e.key === 'Enter') enter(); };
        on('nEnter', enter);
        if (!cfg._code) setTimeout(() => code.focus(), 50);
      }
    }
    if (cfg.joinCode) { name = name || ''; cfg._code = cfg.joinCode; view = 'join'; }
    render();
  }
  function bind(room, cfg, onFirstStart) {
    room.onStart = r => {
      if (onFirstStart) { onFirstStart(); onFirstStart = null; }
      // 「もう一回」：前の回の結果まどが出ていたら、しまう
      document.querySelectorAll('.k-modal-back').forEach(m => m.remove());
      cfg.onStart(r);
    };
    room.onLeave = who => {
      Kit.sfx('bad');
      Kit.modal({
        title: T(`${who ? who + 'さんと' : ''}つながりが きれたよ`, `${who ? who + ' さんとの' : ''}接続が切れました`),
        body: '', dismissable: false,
        actions: [{ label: T('メニューへ', 'メニューへ'), primary: true, onClick: () => { if (cfg.onLeave) cfg.onLeave(who); } }],
      });
    };
  }
  /* #join=1234 のリンクで開いたとき */
  function joinCode() {
    const m = /join=(\d{4})/.exec(location.hash);
    if (!m) return null;
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* なにもしない */ }
    return m[1];
  }

  const Net = window.Net = { open, joinCode, shuffleWith, room: null, errText };
})();
