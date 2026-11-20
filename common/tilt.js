/* あそびばこ かたむきセンサー
   Tilt.start({lock}) … ボタンを おした ときに よぶ（iPhone は ここで きょかを きく）。lock:true で たてがめんに こていも ためす
   Tilt.gx, Tilt.gy … 画面の 中での 「下」の むき（右が +x、下が +y。たてに もつと gy≒1）
   Tilt.roll     … 画面の かたむき（度）。まっすぐ 0、右に かたむけると +（時計まわり）
   Tilt.flat     … 0（たて）〜1（ねかせている）
   Tilt.ok       … センサーが うごいている
   センサーが ない とき（パソコン など）は Tilt.manual(roll度) で かわりに うごかす */
(function () {
  'use strict';
  const T = { ok: false, gx: 0, gy: 1, roll: 0, flat: 0, _t: { gx: 0, gy: 1, flat: 0 }, manualOn: false };
  const D = Math.PI / 180;
  function screenAngle() { const o = screen.orientation; return (o && typeof o.angle === 'number') ? o.angle : (window.orientation || 0); }
  function onOri(e) {
    if (e.beta == null || e.gamma == null) return;
    T.ok = true; if (T.manualOn) return;
    const b = e.beta * D, g = e.gamma * D;
    // 下むきの ベクトル（きかいの むき：x 右、y 上、z 手前）
    const dx = Math.sin(g) * Math.cos(b), dy = -Math.sin(b), dz = -Math.cos(g) * Math.cos(b);
    const a = screenAngle() * D;
    T._t.gx = dx * Math.cos(a) + dy * Math.sin(a);
    T._t.gy = dx * Math.sin(a) - dy * Math.cos(a);
    T._t.flat = Math.abs(dz);
  }
  let last = performance.now();
  function tick(now) {
    requestAnimationFrame(tick);
    const dt = Math.min(.1, (now - last) / 1000); last = now;
    const k = Math.min(1, dt * 14);
    T.gx += (T._t.gx - T.gx) * k; T.gy += (T._t.gy - T.gy) * k; T.flat += (T._t.flat - T.flat) * k;
    const m = Math.hypot(T.gx, T.gy);
    // ねかせると むきが きまらないので、だんだん 0° に もどす
    const r = m > .05 ? Math.atan2(T.gx, T.gy) / D : 0, w = Math.min(1, Math.max(0, (m - .2) / .3));
    T.roll = -r * w;
  }
  requestAnimationFrame(tick);
  window.addEventListener('deviceorientation', onOri);
  T.start = async function (opts = {}) {
    try {
      if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') await DeviceOrientationEvent.requestPermission();
    } catch (e) { /* ことわられた ときは manual */ }
    // スマホを まわしても よこがめんに ならないように（できる きかいだけ）
    if (opts.lock) try {
      if (matchMedia('(pointer: coarse)').matches && document.documentElement.requestFullscreen && !document.fullscreenElement) {
        await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      }
      if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('portrait');
    } catch (e) { /* できない ときは そのまま */ }
  };
  T.stop = function () { try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch (e) { /* なにもしない */ } try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) { /* なにもしない */ } };
  // センサーの かわり：roll（度）を いれる
  T.manual = function (deg) {
    T.manualOn = true;
    T._t.gx = -Math.sin(deg * D); T._t.gy = Math.cos(deg * D); T._t.flat = 0;
  };
  T.auto = function () { T.manualOn = false; };
  window.Tilt = T;
})();
