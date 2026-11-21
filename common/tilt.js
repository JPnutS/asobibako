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
  const IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  // 下むきの ベクトル（きかいの むき：x 右、y 上、z 手前）を 画面の むきに なおす
  function setDown(dx, dy, dz) {
    const a = screenAngle() * D;
    T._t.gx = dx * Math.cos(a) + dy * Math.sin(a);
    T._t.gy = dx * Math.sin(a) - dy * Math.cos(a);
    T._t.flat = Math.abs(dz);
  }
  // ① 加速度（重力こみ）：スマホを たてに もっても くるわない
  let motionAt = 0;
  function onMotion(e) {
    const g = e.accelerationIncludingGravity; if (!g || g.x == null || g.y == null) return;
    let x = g.x, y = g.y, z = g.z || 0; const m = Math.hypot(x, y, z); if (m < 2) return;
    if (IOS) { x = -x; y = -y; z = -z; }   // iPhone は むきが はんたい
    T.ok = true; motionAt = performance.now(); if (T.manualOn) return;
    setDown(-x / m, -y / m, -z / m);
  }
  // ② かたむき（角度）：加速度が こない きかい むけ
  function onOri(e) {
    if (e.beta == null || e.gamma == null) return;
    if (performance.now() - motionAt < 1000) return;
    T.ok = true; if (T.manualOn) return;
    const b = e.beta * D, g = e.gamma * D;
    setDown(Math.sin(g) * Math.cos(b), -Math.sin(b), -Math.cos(g) * Math.cos(b));
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
    T.roll = r * w;   // 右（時計まわり）に かたむけると、下が 画面の 右に よる → +
  }
  requestAnimationFrame(tick);
  window.addEventListener('devicemotion', onMotion);
  window.addEventListener('deviceorientation', onOri);
  T.start = async function (opts = {}) {
    try {
      if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') await DeviceOrientationEvent.requestPermission();
      if (window.DeviceMotionEvent && typeof DeviceMotionEvent.requestPermission === 'function') await DeviceMotionEvent.requestPermission();
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
    T._t.gx = Math.sin(deg * D); T._t.gy = Math.cos(deg * D); T._t.flat = 0;
  };
  T.auto = function () { T.manualOn = false; };
  window.Tilt = T;
})();
