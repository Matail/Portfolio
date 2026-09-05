/* ==========================================================================
   Warp — the turn between pages.

   Scrolling flies the camera straight ahead. Following a link banks it into a
   turn: the view swings to one side, the horizon rolls, the flight surges
   forward, and the screen washes out to the void. The next page picks the
   turn up where it left off and levels out on the new heading.

   Each page's render loop reads Warp.turn (-1..1, the bank) and Warp.surge
   (0..1, extra forward push) and folds them into its own camera.

   Links opt in with data-warp="left" | "right" — the direction of the turn.
   ========================================================================== */
(function () {
  'use strict';

  function noop() {}

  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var KEY = 'wonchan:warp';
  var OUT = 700, IN = 900;                    /* ms: bank away, then level out */

  var W = { turn: 0, surge: 0, busy: false, ready: noop };
  window.Warp = W;

  /* ---------- the wash ----------
     #warp is in the markup and opaque from the first paint (see each page's
     head), so the incoming document never shows itself before we are ready. */
  var veil = null;
  function chrome() {
    if (veil) return;
    veil = document.getElementById('warp');
    if (!veil) {                                /* markup missing - build it */
      veil = document.createElement('div');
      veil.id = 'warp';
      veil.setAttribute('aria-hidden', 'true');
      veil.style.cssText = 'position:fixed;inset:0;z-index:50;pointer-events:none;opacity:0;background:#0b0b0a';
      document.body.appendChild(veil);
    }
  }

  var mainEl = null;
  function content() { return mainEl || (mainEl = document.querySelector('main')); }

  /* content leans with the turn - kept small so the page does not lurch */
  function lean(k, dir) {
    var m = content(); if (!m) return;
    m.style.transform = k ? 'translate3d(' + (-dir * k * 2.6).toFixed(2) + 'vw,0,0) scale(' + (1 - k * .012).toFixed(3) + ')' : '';
    m.style.opacity = k ? (1 - k).toFixed(3) : '';
    m.style.filter = k ? 'blur(' + (k * 2).toFixed(1) + 'px)' : '';
  }

  function easeOut(x) { return 1 - Math.pow(1 - x, 3); }
  /* smoothstep, not a cubic ease-in: the old curve dumped most of the swing
     into the last 150ms, which is what made the turn feel like a whip */
  function easeIn(x) { return x * x * (3 - 2 * x); }

  /* ---------- outbound: bank away, then hand over ---------- */
  function leave(href, dir) {
    if (W.busy) return;
    W.busy = true;
    chrome();
    document.documentElement.classList.add('warping');
    try { sessionStorage.setItem(KEY, JSON.stringify({ dir: dir, at: Date.now() })); } catch (e) {}
    var t0 = performance.now();
    (function step(now) {
      var k = Math.min(1, (now - t0) / OUT);
      var e = easeIn(k);                       /* accelerating into the turn */
      W.turn = dir * e;
      W.surge = e;
      veil.style.opacity = Math.min(1, k * 1.45).toFixed(3);   /* covered well before the swap */
      lean(e, dir);
      if (k < 1) requestAnimationFrame(step);
      else location.href = href;
    })(t0);
  }

  /* ---------- inbound: still banked, level out on the new heading ---------- */
  function arrive() {
    var raw = null;
    try { raw = sessionStorage.getItem(KEY); sessionStorage.removeItem(KEY); } catch (e) {}
    if (!raw || reduce) return;
    var s; try { s = JSON.parse(raw); } catch (e) { return; }
    if (!s || Date.now() - s.at > 8000) return;   /* a stale key is not a turn */

    chrome();
    var dir = s.dir;
    W.turn = dir; W.surge = 1;
    veil.style.opacity = '1';
    lean(1, dir);

    /* hold the bank until the scene has actually drawn a frame, otherwise the
       whole level-out happens while the canvas is still coming up and the
       arrival looks like it was already straight */
    var started = false;
    function level() {
      if (started) return;
      started = true;
      W.ready = noop;
      document.documentElement.classList.remove('warping-in');
      var t0 = performance.now();
      (function step(now) {
        var k = Math.min(1, (now - t0) / IN);
        var e = 1 - easeOut(k);                /* decelerating out of the turn */
        W.turn = dir * e;
        W.surge = e;
        veil.style.opacity = Math.max(0, 1 - easeOut(Math.min(1, k * 1.6))).toFixed(3);
        lean(e * e, dir);                      /* the copy settles first */
        if (k < 1) requestAnimationFrame(step);
        else { W.turn = 0; W.surge = 0; lean(0, dir); veil.style.opacity = '0'; }
      })(performance.now());
    }
    W.ready = level;                           /* the render loop calls this */
    setTimeout(level, 1400);                   /* ...or we give up waiting */
  }

  /* ---------- links ---------- */
  addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest && e.target.closest('a[data-warp][href]');
    if (!a || a.target === '_blank') return;
    var href = a.getAttribute('href');
    if (!href || href.charAt(0) === '#') return;
    if (reduce) return;                        /* let the plain navigation happen */
    e.preventDefault();
    leave(href, a.getAttribute('data-warp') === 'left' ? -1 : 1);
  });

  /* coming back with the back button must not leave the page washed out */
  addEventListener('pageshow', function (e) {
    if (e.persisted) {
      W.turn = 0; W.surge = 0; W.busy = false;
      document.documentElement.classList.remove('warping');
      if (veil) veil.style.opacity = '0';
      lean(0, 1);
    }
  });

  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', arrive);
  else arrive();
})();
