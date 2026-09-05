/* ==========================================================================
   Shared background + type engine for the project case studies.

   Same world as the main flight, trimmed to what a document needs: the
   terraced landscape, two dust fields that react to the cursor (Canvas UI's
   Particle Object push: ray from the camera through the pointer, radial push
   plus tangential swirl, then a spring home under damping), the word-level
   reveal and the cipher labels.
   ========================================================================== */
(function () {
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------------------------------------------------------- type */
  var splits = [];
  [].forEach.call(document.querySelectorAll('[data-split]'), function (el) {
    var items = [];
    (function walk(node) {
      [].slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 3) {
          var frag = document.createDocumentFragment();
          n.nodeValue.split(/(\s+)/).forEach(function (tok) {
            if (!tok) return;
            if (/^\s+$/.test(tok)) { frag.appendChild(document.createTextNode(tok)); return; }
            var s = document.createElement('span');
            s.className = 'rv'; s.textContent = tok;
            frag.appendChild(s); items.push(s);
          });
          node.replaceChild(frag, n);
        } else if (n.nodeType === 1 && n.tagName !== 'BR') walk(n);
      });
    })(el);
    if (items.length) splits.push({ el: el, items: items });
  });

  function applyReveal(list, p) {
    for (var i = 0; i < list.length; i++) {
      var d = i / Math.max(1, list.length) * 0.5;
      var k = Math.max(0, Math.min(1, (p - d) / 0.5));
      k = 1 - Math.pow(1 - k, 3);
      var s = list[i].style;
      s.opacity = k.toFixed(3);
      s.transform = 'translate3d(0,' + ((1 - k) * 0.6).toFixed(3) + 'em,0)';
      s.filter = k > .995 ? 'none' : 'blur(' + ((1 - k) * 8).toFixed(2) + 'px)';
    }
  }

  var CH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/\\<>*#+=-';
  var ciphers = [].map.call(document.querySelectorAll('[data-scramble]'), function (el) {
    return { el: el, text: el.textContent, shown: -2 };
  });
  function applyCipher(c, p) {
    var t = c.text, reveal = Math.floor(t.length * Math.min(1, p * 1.4));
    if (p <= 0) { if (c.shown !== -1) { c.el.textContent = ''; c.shown = -1; } return; }
    if (reveal === c.shown && reveal >= t.length) return;
    c.shown = reveal;
    var out = '';
    for (var i = 0; i < t.length; i++) {
      out += (i < reveal || t[i] === ' ' || t[i] === '/') ? t[i] : CH[(Math.random() * CH.length) | 0];
    }
    c.el.textContent = out;
  }

  if (reduce) {
    splits.forEach(function (s) { applyReveal(s.items, 1); });
    ciphers.forEach(function (c) { c.el.textContent = c.text; });
  }

  /* --------------------------------------------------------------- scene */
  var cv = document.getElementById('back');
  var VOID = 0x0b0b0a, R = null;
  try {
    if (cv && window.THREE) {
      R = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: false,
                                    powerPreference: 'high-performance' });
    }
  } catch (e) { R = null; }
  if (!R) document.documentElement.className += ' no-gl';

  var scene, camera, landUni, land, fields = [];
  var meter = document.getElementById('meter'), bars = [];
  if (meter) for (var b = 0; b < 40; b++) { var e = document.createElement('i'); meter.appendChild(e); bars.push(e); }
  var rnd = function (a) { return (Math.random() - .5) * a; };

  if (R) {
    R.setClearColor(VOID, 1);
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(58, 1, 0.5, 900);

    var NOISE = [
      'vec3 hash3(vec2 p){ vec3 q = vec3(dot(p,vec2(127.1,311.7)), dot(p,vec2(269.5,183.3)), dot(p,vec2(419.2,371.9))); return fract(sin(q)*43758.5453); }',
      'float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);',
      '  float a=hash3(i).x, b=hash3(i+vec2(1.0,0.0)).x, c=hash3(i+vec2(0.0,1.0)).x, d=hash3(i+vec2(1.0,1.0)).x;',
      '  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y); }',
      'float fbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<5;i++){ s+=a*vnoise(p); p*=2.03; a*=0.5; } return s; }'
    ].join('\n');
    landUni = { uT: { value: 0 }, uZ: { value: 0 }, uFog: { value: new THREE.Color(VOID) }, uLift: { value: 0 },
                uLandTint: { value: new THREE.Vector3(1, 1, 1) } };
    /* each project keeps the cast its beat had on the main flight */
    var tintAttr = (document.body.getAttribute('data-tint') || '').split(',');
    if (tintAttr.length === 3) landUni.uLandTint.value.set(+tintAttr[0], +tintAttr[1], +tintAttr[2]);
    land = new THREE.Mesh(new THREE.PlaneGeometry(460, 900, 220, 360), new THREE.ShaderMaterial({
      uniforms: landUni,
      vertexShader: NOISE + [
        'uniform float uT; uniform float uZ; uniform float uLift;',
        'varying float vH; varying vec3 vW; varying vec2 vG;',
        'void main(){',
        '  vec3 p = position; vec2 w = vec2(p.x, uZ - p.y);',
        '  float h = fbm(w * 0.0125 + vec2(0.0, uT * 0.006));',
        '  h += 0.35 * fbm(w * 0.045 + vec2(uT * 0.02, 0.0));',
        '  h = floor(h * 11.0) / 11.0; h *= 30.0 + uLift * 10.0;',
        '  p.z = h; vH = h; vG = w;',
        '  vec4 mv = modelViewMatrix * vec4(p,1.0); vW = mv.xyz;',
        '  gl_Position = projectionMatrix * mv;',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 uFog; uniform vec3 uLandTint; varying float vH; varying vec3 vW; varying vec2 vG;',
        'void main(){',
        '  float k = clamp(vH / 30.0, 0.0, 1.0);',
        '  vec3 c = mix(vec3(0.042,0.042,0.040), vec3(0.42,0.42,0.408), pow(k,1.6));',
        '  vec2 g = abs(fract(vG * 0.25) - 0.5);',
        '  c += (1.0 - smoothstep(0.0,0.055,min(g.x,g.y))) * 0.060 * (0.22 + k);',
        '  float e = abs(fract(vH / (30.0/11.0) + 0.5) - 0.5);',
        '  c += (1.0 - smoothstep(0.0,0.07,e)) * 0.080 * (0.3 + k);',
        '  c *= uLandTint;',
        '  float d = length(vW);',
        '  float fog = 1.0 - exp(-pow(d * 0.0038, 2.0));',
        '  c *= smoothstep(28.0, 110.0, d);',
        '  gl_FragColor = vec4(mix(c, uFog, clamp(fog,0.0,1.0)), 1.0);',
        '}'
      ].join('\n')
    }));
    land.rotation.x = -Math.PI / 2;
    scene.add(land);

    var PT_VERT = [
      'attribute float aSize; attribute float aSeed;',
      'uniform float uPR; uniform float uT; uniform float uDrift; uniform float uFar;',
      'varying float vFade;',
      'void main(){',
      '  vec3 p = position;',
      '  p.x += sin(uT * 1.7 + aSeed * 61.0) * uDrift;',
      '  p.y += cos(uT * 1.3 + aSeed * 23.0) * uDrift;',
      '  vec4 mv = modelViewMatrix * vec4(p,1.0);',
      '  float d = -mv.z;',
      '  vFade = smoothstep(uFar, uFar * 0.22, d) * smoothstep(10.0, 42.0, d);',
      '  gl_PointSize = clamp(aSize * uPR * (130.0 / max(d, 10.0)), 1.0, 24.0 * uPR);',
      '  gl_Position = projectionMatrix * mv;',
      '}'
    ].join('\n');
    var PT_FRAG = [
      'uniform float uOpacity; uniform vec3 uTint; varying float vFade;',
      'void main(){',
      '  vec2 q = abs(gl_PointCoord - 0.5);',
      '  if (max(q.x, q.y) > 0.5) discard;',
      '  float e = 1.0 - smoothstep(0.30, 0.5, max(q.x, q.y));',
      '  gl_FragColor = vec4(uTint, uOpacity * vFade * (0.35 + 0.65 * e));',
      '}'
    ].join('\n');

    function field(opt) {
      var n = opt.count, home = new Float32Array(n * 3), pos = new Float32Array(n * 3),
          vel = new Float32Array(n * 3), siz = new Float32Array(n), seed = new Float32Array(n);
      for (var i = 0; i < n; i++) {
        var q = opt.place();
        home[i * 3] = pos[i * 3] = q[0];
        home[i * 3 + 1] = pos[i * 3 + 1] = q[1];
        home[i * 3 + 2] = pos[i * 3 + 2] = q[2];
        siz[i] = opt.lo + Math.random() * (opt.hi - opt.lo);
        seed[i] = Math.random();
      }
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('aSize', new THREE.BufferAttribute(siz, 1));
      g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
      var u = { uPR: { value: 1 }, uT: { value: 0 }, uDrift: { value: opt.drift },
                uOpacity: { value: opt.opacity }, uTint: { value: new THREE.Color(0xeeede9) },
                uFar: { value: opt.far } };
      var pts = new THREE.Points(g, new THREE.ShaderMaterial({
        uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        vertexShader: PT_VERT, fragmentShader: PT_FRAG
      }));
      pts.frustumCulled = false;
      scene.add(pts);
      return { pts: pts, u: u, home: home, pos: pos, vel: vel, n: n, depth: opt.depth,
               radius: opt.radius, strength: opt.strength, swirl: opt.swirl,
               spring: opt.spring, damping: opt.damping };
    }

    fields.push(field({ count: 2000, far: 640, depth: 640, lo: 1.0, hi: 2.4, opacity: .46, drift: .9,
      radius: 80, strength: 260, swirl: .5, spring: 2.2, damping: .40,
      place: function () { return [rnd(560), Math.random() * 80 - 6, -Math.random() * 640]; } }));
    fields.push(field({ count: 760, far: 320, depth: 320, lo: 1.8, hi: 4.0, opacity: .42, drift: .6,
      radius: 120, strength: 780, swirl: .9, spring: 2.6, damping: .34,
      place: function () { return [rnd(320), Math.random() * 70 - 4, -Math.random() * 320]; } }));
  }

  /* ------------------------------------------------------------- pointer */
  var ptr = { x: 0, y: 0, has: false, vx: 0, vy: 0 };
  var look = { x: 0, y: 0, tx: 0, ty: 0 };
  addEventListener('pointermove', function (ev) {
    var nx = (ev.clientX / innerWidth) * 2 - 1, ny = -((ev.clientY / innerHeight) * 2 - 1);
    ptr.vx += nx - ptr.x; ptr.vy += ny - ptr.y;
    ptr.x = nx; ptr.y = ny; ptr.has = true;
    look.tx = nx; look.ty = ny;
  }, { passive: true });
  addEventListener('pointerleave', function () { ptr.has = false; look.tx = 0; look.ty = 0; });

  var ZERO_WARP = { turn: 0, surge: 0 };
  var prog = 0, target = 0;
  function readScroll() {
    var max = document.body.scrollHeight - innerHeight;
    target = max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0;
  }
  addEventListener('scroll', readScroll, { passive: true });
  readScroll(); prog = target;

  var pxToWorld = 0.0012;
  function resize() {
    if (!R) return;
    var w = innerWidth, h = innerHeight, pr = Math.min(devicePixelRatio || 1, 2);
    R.setPixelRatio(pr); R.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    pxToWorld = 2 * Math.tan(camera.fov * Math.PI / 360) / h;
    fields.forEach(function (f) { f.u.uPR.value = pr; });
  }
  addEventListener('resize', resize, { passive: true });
  resize();

  var rayO = null, rayD = null, tmp = null;
  if (R) { rayO = new THREE.Vector3(); rayD = new THREE.Vector3(); tmp = new THREE.Vector3(); }

  function simulate(f, dt, pushing, shove) {
    var p = f.pos, v = f.vel, h = f.home, n = f.n;
    var ox = rayO.x, oy = rayO.y, oz = rayO.z, dx = rayD.x, dy = rayD.y, dz = rayD.z;
    var radPx = f.radius, accelPx = f.strength, sw = f.swirl;
    var stiff = f.spring * 12, decay = Math.pow(f.damping, dt * 6), k = pxToWorld;
    for (var i = 0; i < n; i++) {
      var ix = i * 3, iy = ix + 1, iz = ix + 2;
      var vx = v[ix], vy = v[iy], vz = v[iz];
      if (pushing) {
        var wx = p[ix] - ox, wy = p[iy] - oy, wz = p[iz] - oz;
        var t = wx * dx + wy * dy + wz * dz;
        if (t > 0) {
          var lr = t * k * radPx;
          var rx = wx - dx * t, ry = wy - dy * t, rz = wz - dz * t;
          var d2 = rx * rx + ry * ry + rz * rz;
          if (d2 < lr * lr) {
            var dist = Math.sqrt(d2), invd = 1 / Math.max(dist, 1e-5);
            rx *= invd; ry *= invd; rz *= invd;
            var accel = accelPx * t * k;
            var fall = 1 - dist / lr, ff = fall * fall * dt;
            var tx = dy * rz - dz * ry, ty = dz * rx - dx * rz, tz = dx * ry - dy * rx;
            var sh = shove * accel * 0.6;
            vx += (rx + tx * sw) * accel * ff + rx * sh * ff;
            vy += (ry + ty * sw) * accel * ff + ry * sh * ff;
            vz += (rz + tz * sw) * accel * ff;
          }
        }
      }
      vx += (h[ix] - p[ix]) * stiff * dt;
      vy += (h[iy] - p[iy]) * stiff * dt;
      vz += (h[iz] - p[iz]) * stiff * dt;
      vx *= decay; vy *= decay; vz *= decay;
      p[ix] += vx * dt; p[iy] += vy * dt; p[iz] += vz * dt;
      v[ix] = vx; v[iy] = vy; v[iz] = vz;
    }
    f.pts.geometry.attributes.position.needsUpdate = true;
  }
  function recycle(f, camZ) {
    var h = f.home, p = f.pos, n = f.n, D = f.depth;
    for (var i = 0; i < n; i++) {
      var iz = i * 3 + 2;
      if (h[iz] > camZ + 24) { h[iz] -= D; p[iz] -= D; }
      else if (h[iz] < camZ - D - 24) { h[iz] += D; p[iz] += D; }
    }
  }

  var raf = 0, running = true, t0 = 0, last = 0;
  function frame(now) {
    raf = 0;
    if (!running) return;
    if (!t0) { t0 = now; last = now; }
    var dt = Math.min((now - last) / 1000, 1 / 30); last = now;
    var t = (now - t0) * 0.001;
    prog += (target - prog) * (reduce ? 1 : (Math.abs(target - prog) > 0.15 ? 0.17 : 0.075));
    look.x += (look.tx - look.x) * 0.05;
    look.y += (look.ty - look.y) * 0.05;

    if (R) {
      /* same flight the main page flies, plus the banked turn we arrived on */
      var wp = window.Warp || ZERO_WARP, wt = wp.turn, ws = wp.surge;
      var z = 60 - prog * 560 - ws * 34;
      camera.up.set(Math.sin(wt * -0.13), Math.cos(wt * 0.13), 0);
      camera.position.set(Math.sin(prog * 4.4) * 26 + look.x * 12 + wt * 12,
                          58 + Math.sin(prog * 3.1) * 9 + Math.sin(t * .35) * .8 - look.y * 7 + ws * 4, z);
      camera.lookAt(Math.sin(prog * 4.4 + .7) * 34 + look.x * 34 + wt * 46,
                    41 + Math.sin(prog * 2.4) * 6 + look.y * 16, z - 150);
      camera.updateMatrixWorld();

      land.position.z = Math.round(z / 40) * 40 - 324;
      landUni.uZ.value = land.position.z;
      landUni.uT.value = t;
      landUni.uLift.value = Math.sin(prog * 6.0) * .5 + .5;

      var pushing = ptr.has && !reduce;
      if (pushing) {
        tmp.set(ptr.x, ptr.y, 0.5).unproject(camera);
        rayO.copy(camera.position);
        rayD.copy(tmp).sub(rayO).normalize();
      }
      var shove = Math.min(1, Math.hypot(ptr.vx, ptr.vy) * 22);
      ptr.vx *= Math.exp(-5 * dt); ptr.vy *= Math.exp(-5 * dt);

      for (var i = 0; i < fields.length; i++) {
        fields[i].u.uT.value = t;
        recycle(fields[i], z);
        if (dt > 0) simulate(fields[i], dt, pushing, shove);
      }
      R.render(scene, camera);
      if (window.Warp) Warp.ready();   /* the arrival turn starts on the first drawn frame */
    }

    if (!reduce) {
      for (var s = 0; s < splits.length; s++) {
        var sp = splits[s], r = sp.el.getBoundingClientRect();
        var c = (r.top + r.height * 0.35) / innerHeight;
        applyReveal(sp.items, Math.max(0, Math.min(1, (0.94 - c) * 2.2)));
      }
      for (var q = 0; q < ciphers.length; q++) {
        var ci = ciphers[q], rr = ci.el.getBoundingClientRect();
        var cc = (rr.top + rr.height / 2) / innerHeight;
        applyCipher(ci, Math.max(0, Math.min(1, (0.96 - cc) * 2.6)));
      }
    }

    for (var m = 0; m < bars.length; m++) {
      var vv = Math.abs(Math.sin(t * 1.7 + m * .45) * Math.sin(t * .6 + m * .21));
      bars[m].style.height = (2 + vv * (6 + prog * 24)).toFixed(1) + 'px';
      bars[m].style.opacity = (.16 + vv * .38).toFixed(2);
    }

    raf = requestAnimationFrame(frame);
  }
  function start() { if (!raf && running) raf = requestAnimationFrame(frame); }
  function stop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }

  frame(performance.now());
  if (reduce) stop();
  document.addEventListener('visibilitychange', function () {
    running = !document.hidden;
    if (running && !reduce) { last = performance.now(); start(); } else stop();
  });
})();
