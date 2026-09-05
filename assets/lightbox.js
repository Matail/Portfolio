/* ==========================================================================
   Lightbox — shared by the scroll flight and the three project pages.

   Lightbox.open({src, caption, alt})   open programmatically (3D panels)
   Lightbox.bind(el, {src, caption})    make an element open it on click/Enter
   Lightbox.isOpen()                    so the 3D page can pause its cursor work

   Auto-binds every <img> inside a <figure> on load, using the figcaption as
   the caption. Zoom: wheel, click, or pinch. Drag to pan once zoomed in.
   ========================================================================== */
(function () {
  'use strict';

  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var dlg, stage, img, capEl, hintEl, zoomEl, closeBtn, built = false;
  var scale = 1, tx = 0, ty = 0, maxScale = 3, fitW = 0, fitH = 0;
  var opener = null;                 /* element to return focus to on close */
  var pointers = {}, pinch = null, dragging = false, moved = 0, dragFrom = null;
  var origin = null, flightTimer = 0;   /* where the picture flew in from */
  var openToken = 0, started = -1, maskFn = null;

  function build() {
    if (built) return;
    built = true;
    dlg = document.createElement('dialog');
    dlg.className = 'lb';
    dlg.setAttribute('aria-label', '이미지 확대 보기');
    dlg.innerHTML =
      '<div class="lb-stage"><img class="lb-img" alt=""></div>' +
      '<p class="lb-zoom mono"></p>' +
      '<p class="lb-cap"></p>' +
      '<p class="lb-hint">클릭 · 휠로 확대 &nbsp;·&nbsp; 드래그로 이동 &nbsp;·&nbsp; ESC로 닫기</p>' +
      '<button class="lb-x" type="button" aria-label="닫기">✕</button>';
    document.body.appendChild(dlg);
    stage = dlg.querySelector('.lb-stage');
    img = dlg.querySelector('.lb-img');
    capEl = dlg.querySelector('.lb-cap');
    hintEl = dlg.querySelector('.lb-hint');
    zoomEl = dlg.querySelector('.lb-zoom');
    closeBtn = dlg.querySelector('.lb-x');

    closeBtn.addEventListener('click', close);
    dlg.addEventListener('cancel', function (e) { e.preventDefault(); close(); });
    dlg.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    });
    /* click on the empty area around the picture closes; on the picture, zooms */
    stage.addEventListener('pointerdown', onDown);
    stage.addEventListener('pointermove', onMove);
    addEventListener('pointerup', onUp);
    addEventListener('pointercancel', onUp);
    stage.addEventListener('wheel', onWheel, { passive: false });
    addEventListener('resize', function () { if (dlg.open) { measure(); apply(); } });
  }

  /* ---------- transform ---------- */
  function measure() {
    fitW = img.offsetWidth; fitH = img.offsetHeight;
    var nat = img.naturalWidth || fitW;
    maxScale = Math.max(2, Math.min(5, fitW ? nat / fitW : 3));
  }
  function clampPan() {
    var mx = Math.max(0, (fitW * scale - stage.clientWidth) / 2);
    var my = Math.max(0, (fitH * scale - stage.clientHeight) / 2);
    tx = Math.max(-mx, Math.min(mx, tx));
    ty = Math.max(-my, Math.min(my, ty));
  }
  function apply() {
    clampPan();
    img.style.transform = 'translate(' + tx.toFixed(1) + 'px,' + ty.toFixed(1) + 'px) scale(' + scale.toFixed(3) + ')';
    dlg.classList.toggle('z', scale > 1.01);
    zoomEl.textContent = scale > 1.01 ? scale.toFixed(1) + '×' : '';
  }
  /* zoom so the content under (cx,cy) — stage coords from the centre — stays put */
  function zoomAt(next, cx, cy) {
    next = Math.max(1, Math.min(maxScale, next));
    var ux = (cx - tx) / scale, uy = (cy - ty) / scale;
    tx = cx - ux * next; ty = cy - uy * next;
    scale = next;
    if (scale <= 1.001) { tx = 0; ty = 0; }
    apply();
  }
  function stageXY(e) {
    var r = stage.getBoundingClientRect();
    return [e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2];
  }

  /* ---------- pointer ---------- */
  function onDown(e) {
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    var ids = Object.keys(pointers);
    if (ids.length === 2) {                              /* start pinch */
      var a = pointers[ids[0]], b = pointers[ids[1]];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s: scale };
      dragging = false;
      return;
    }
    if (ids.length > 2) return;
    moved = 0;
    dragFrom = { x: e.clientX, y: e.clientY, tx: tx, ty: ty, onImg: e.target === img };
    if (scale > 1.01) {
      dragging = true;
      dlg.classList.add('dragging');
      try { stage.setPointerCapture(e.pointerId); } catch (err) {}
    }
  }
  function onMove(e) {
    if (pointers[e.pointerId]) { pointers[e.pointerId].x = e.clientX; pointers[e.pointerId].y = e.clientY; }
    var ids = Object.keys(pointers);
    if (pinch && ids.length === 2) {
      var a = pointers[ids[0]], b = pointers[ids[1]];
      var d = Math.hypot(a.x - b.x, a.y - b.y);
      var r = stage.getBoundingClientRect();
      zoomAt(pinch.s * (d / pinch.d),
             (a.x + b.x) / 2 - r.left - r.width / 2,
             (a.y + b.y) / 2 - r.top - r.height / 2);
      return;
    }
    if (!dragFrom) return;
    var dx = e.clientX - dragFrom.x, dy = e.clientY - dragFrom.y;
    moved = Math.max(moved, Math.hypot(dx, dy));
    if (dragging) { tx = dragFrom.tx + dx; ty = dragFrom.ty + dy; apply(); }
  }
  function onUp(e) {
    delete pointers[e.pointerId];
    if (Object.keys(pointers).length < 2) pinch = null;
    if (!dragFrom) { dragging = false; dlg.classList.remove('dragging'); return; }
    var wasDrag = dragging, onImg = dragFrom.onImg, slid = moved > 6;
    dragging = false; dragFrom = null;
    dlg.classList.remove('dragging');
    if (slid || !dlg.open) return;
    if (!onImg) { close(); return; }                     /* clicked the surround */
    if (wasDrag) { zoomAt(1, 0, 0); return; }            /* zoomed already → reset */
    var p = stageXY(e);
    zoomAt(Math.min(2.5, maxScale), p[0], p[1]);
  }
  function onWheel(e) {
    e.preventDefault();
    var p = stageXY(e);
    zoomAt(scale * Math.exp(-e.deltaY * 0.0016), p[0], p[1]);
  }

  /* ---------- the approach ----------
     A FLIP: the picture starts exactly where its thumbnail (or floating panel)
     sits on screen and travels to the middle, decelerating, with the focus
     pulling in — so it reads as coming towards you rather than appearing. */
  function rectOf(from) {
    if (!from) return null;
    var r = typeof from === 'function' ? from() : from.getBoundingClientRect();
    return r && r.width > 1 && r.height > 1 ? r : null;
  }
  /* transform that lands the (already centred) lightbox image on top of `r` */
  function transformTo(r) {
    /* transform-origin is the centre, so scale never moves it: the untransformed
       centre is just the current visual centre minus the current translation */
    var t = img.getBoundingClientRect();
    var cx = t.left + t.width / 2 - tx, cy = t.top + t.height / 2 - ty;
    var k = Math.sqrt((r.width / fitW) * (r.height / fitH));              /* uniform: no squash */
    return 'translate(' + (r.left + r.width / 2 - cx).toFixed(1) + 'px,' +
                          (r.top + r.height / 2 - cy).toFixed(1) + 'px) scale(' + k.toFixed(4) + ')';
  }
  function setMask(hidden) { if (maskFn) { try { maskFn(hidden); } catch (e) {} } }
  function flyIn(r) {
    clearTimeout(flightTimer);
    dlg.classList.remove('flying');
    img.style.transition = 'none';
    img.style.transform = transformTo(r);
    img.style.filter = 'blur(6px)';
    void img.offsetWidth;                        /* commit the start frame */
    dlg.classList.add('flying');
    img.style.transition = '';
    img.style.filter = 'blur(0px)';
    apply();                                     /* -> identity */
    flightTimer = setTimeout(function () { dlg.classList.remove('flying'); }, 660);
  }

  /* ---------- open / close ---------- */
  function open(o) {
    build();
    opener = document.activeElement;
    origin = o.from || null;
    maskFn = o.mask || null;
    scale = 1; tx = 0; ty = 0;
    img.style.transition = 'none';
    img.style.transform = 'translate(0px,0px) scale(1)';
    img.style.filter = '';
    img.alt = o.alt || o.caption || '';
    capEl.textContent = o.caption || '';
    capEl.style.display = o.caption ? '' : 'none';
    dlg.classList.remove('z', 'dragging', 'closing', 'ready', 'flying');
    zoomEl.textContent = '';
    var token = ++openToken;
    var start = function () {
      if (token !== openToken || started === token) return;
      started = token;
      measure(); apply();
      var r0 = rectOf(origin);                   /* where it is, right before it goes */
      setMask(true);
      if (reduce || !r0) { requestAnimationFrame(function () { img.style.transition = ''; }); }
      else flyIn(r0);
      dlg.classList.add('ready');
    };
    img.onload = start;
    img.src = o.src;
    if (!dlg.open) {
      /* showModal does not stop the page behind from scrolling; pad out the
         scrollbar we remove so the thumbnail we are flying from stays put */
      /* body carries overflow-x:hidden, so the viewport takes its overflow from
         body, not html - lock both and pad out the scrollbar we remove */
      var sbw = window.innerWidth - document.documentElement.clientWidth;
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
      if (sbw > 0) document.body.style.paddingRight = sbw + 'px';
      dlg.showModal();
    }
    if (img.complete) start();
    closeBtn.focus({ preventScroll: true });
  }
  function close() {
    if (!dlg || !dlg.open || dlg.classList.contains('closing')) return;
    var done = function () {
      clearTimeout(flightTimer);
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
      dlg.classList.remove('closing', 'ready', 'flying', 'z');
      dlg.close();
      img.removeAttribute('src');
      img.style.filter = '';
      setMask(false); maskFn = null;
      if (opener && opener.focus) opener.focus({ preventScroll: true });
      opener = null; origin = null;
    };
    if (reduce) return done();
    var r = rectOf(origin);
    dlg.classList.add('closing');
    dlg.classList.remove('flying');
    if (r) {                                     /* retreat to where it came from */
      img.style.transition = '';
      img.style.transform = transformTo(r);
      img.style.filter = 'blur(4px)';
      /* wait for the retreat itself, not a guessed duration */
      var fin = function (e) {
        if (e && e.propertyName !== 'transform') return;
        img.removeEventListener('transitionend', fin);
        clearTimeout(flightTimer); done();
      };
      img.addEventListener('transitionend', fin);
      flightTimer = setTimeout(fin, 460);
    } else {
      setTimeout(done, 240);
    }
  }

  /* ---------- binding ---------- */
  function bind(el, o) {
    if (!el || el.dataset.lb) return;
    el.dataset.lb = '1';
    if (!el.hasAttribute('tabindex')) el.tabIndex = 0;
    if (!el.hasAttribute('role')) el.setAttribute('role', 'button');
    var label = (o && o.caption) || el.getAttribute('alt') || '이미지';
    el.setAttribute('aria-label', label + ' — 클릭해서 확대');
    var host = el.closest('figure') || el;
    var fire = function () {
      open({ src: (o && o.src) || el.currentSrc || el.src, caption: o && o.caption, alt: el.alt,
             from: el, mask: function (h) { host.style.visibility = h ? 'hidden' : ''; } });
    };
    el.addEventListener('click', fire);
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fire(); }
    });
  }

  function autoBind(root) {
    (root || document).querySelectorAll('figure img').forEach(function (im) {
      var fc = im.closest('figure').querySelector('figcaption');
      bind(im, { caption: fc ? fc.textContent.trim() : '' });
    });
  }

  window.Lightbox = { open: open, close: close, bind: bind, autoBind: autoBind, isOpen: function () { return !!(dlg && dlg.open); } };

  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', function () { autoBind(); });
  else autoBind();
})();
