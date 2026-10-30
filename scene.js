/* A small, original point-cloud renderer. No images, libraries, or network calls. */
(() => {
  'use strict';

  const zh = document.documentElement.lang.startsWith('zh');
  const t = (en, cn) => zh ? cn : en;
  const canvas = document.getElementById('research-scene');
  if (!canvas) return;
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return;
  const host = document.getElementById('scene-host') || canvas.parentElement;
  const status = document.getElementById('scene-status');
  const motionButton = document.getElementById('motion-toggle');
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const modeButtons = [...document.querySelectorAll('[data-scene]')];
  const palette = ['#283b31', '#526f5c', '#7c927b', '#afba9e', '#d99943', '#bc7f35', '#e2b976'];
  const count = 6500;
  const points = [];
  let width = 600;
  let height = 540;
  let scale = 150;
  let yaw = -0.61;
  let elevation = 0.43;
  let zoom = 1;
  let frame = 0;
  let lastFrame = 0;
  let phase = 0;
  let inView = true;
  let userPaused = motionQuery.matches;
  let reduced = motionQuery.matches;
  let mode = 'reconstruction';
  let transition = 1;
  let target = [];
  let previous = [];
  let pointer = null;
  let destroyed = false;
  const cleanup = [];

  function on(element, event, listener, options) {
    if (!element) return;
    element.addEventListener(event, listener, options);
    cleanup.push(() => element.removeEventListener(event, listener, options));
  }

  function randomFactory(seed) {
    return () => {
      seed |= 0;
      seed = (seed + 0x6D2B79F5) | 0;
      let n = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
      return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeFormation(name) {
    const random = randomFactory(name === 'reconstruction' ? 17 : name === 'mapping' ? 91 : 203);
    const result = [];
    const between = (a, b) => a + (b - a) * random();
    for (let i = 0; i < count; i++) {
      let x, y, z;
      let color = random() < 0.52 ? 1 : random() < 0.68 ? 2 : 0;
      let size = between(0.55, 1.45);
      let opacity = between(0.45, 0.94);
      const section = random();
      if (name === 'reconstruction') {
        if (section < 0.29) {
          // A broad, floating roof, with its thickness and courtyard cut out.
          x = between(-1.12, 1.12);
          z = between(-0.69, 0.69);
          y = random() < 0.79 ? 0.44 : between(0.37, 0.44);
          if (Math.abs(x) < 0.35 && Math.abs(z) < 0.30) {
            y = -0.53;
            color = 3;
          } else {
            color = random() < 0.16 ? 4 : random() < 0.45 ? 0 : 2;
          }
        } else if (section < 0.46) {
          x = between(-1.26, 1.26);
          z = between(-0.82, 0.82);
          y = -0.56 + between(-0.007, 0.007);
          color = random() < 0.8 ? 2 : 4;
          opacity *= 0.7;
        } else if (section < 0.62) {
          x = between(-1.02, 1.02);
          y = between(-0.54, 0.36);
          z = -0.58 + between(-0.012, 0.012);
          const mullion = Math.abs(Math.sin(x * 13.5));
          if (mullion > 0.25 && y > -0.27 && y < 0.23) {
            opacity *= 0.35;
            color = 3;
          }
        } else if (section < 0.80) {
          const column = Math.floor(random() * 8);
          const angle = between(0, Math.PI * 2);
          x = [-0.91, -0.31, 0.31, 0.91][column % 4] + Math.cos(angle) * 0.026;
          y = between(-0.55, 0.38);
          z = (column < 4 ? -0.51 : 0.51) + Math.sin(angle) * 0.026;
          color = random() < 0.25 ? 4 : 0;
        } else if (section < 0.89) {
          const step = Math.floor(random() * 4);
          x = between(-0.92, 0.92);
          z = 0.83 + step * 0.10 + between(0, 0.1);
          y = -0.59 - step * 0.045;
          color = random() < 0.25 ? 4 : 2;
        } else if (section < 0.96) {
          x = -1.03 + between(-0.008, 0.008);
          y = between(-0.54, 0.36);
          z = between(-0.57, 0.57);
          color = 2;
          opacity *= 0.72;
        } else {
          // A compact cloud-tree makes the reconstruction read at human scale.
          const angle = between(0, Math.PI * 2);
          const radius = Math.sqrt(random()) * 0.29;
          x = 0.72 + Math.cos(angle) * radius;
          z = -0.98 + Math.sin(angle) * radius;
          y = between(0.23, 0.68) - radius * 0.35;
          if (random() < 0.20) { x = 0.72 + between(-0.012, 0.012); z = -0.98; y = between(-0.55, 0.27); }
          color = random() < 0.75 ? 1 : 4;
        }
      } else if (name === 'mapping') {
        if (section < 0.58) {
          x = between(-1.36, 1.36);
          z = between(-1.03, 1.03);
          y = -0.57 + Math.sin(x * 2.4 + z) * 0.07 + Math.cos(z * 4) * 0.035;
          const route = z - Math.sin(x * 2.5) * 0.37;
          color = Math.abs(route) < 0.075 ? 4 : random() < 0.55 ? 2 : 1;
          opacity *= Math.abs(route) < 0.075 ? 1 : 0.65;
        } else if (section < 0.90) {
          const building = Math.floor(random() * 6);
          const bx = [-0.96, -0.37, 0.36, 1.0, -0.68, 0.58][building];
          const bz = [-0.66, -0.7, -0.66, -0.57, 0.65, 0.68][building];
          const top = [-0.07, 0.14, 0.39, -0.06, -0.10, 0.05][building];
          x = bx + between(-0.20, 0.20);
          z = bz + between(-0.17, 0.17);
          y = between(-0.53, top);
          if (random() < 0.36) y = top;
          else if (random() < 0.5) x = bx + (random() < 0.5 ? -0.2 : 0.2);
          else z = bz + (random() < 0.5 ? -0.17 : 0.17);
          color = random() < 0.2 ? 3 : 0;
        } else {
          const t = between(-1.30, 1.30);
          x = t;
          z = Math.sin(t * 2.5) * 0.37 + between(-0.025, 0.025);
          y = -0.35 + between(-0.018, 0.018);
          color = random() < 0.5 ? 4 : 6;
          size *= 1.2;
        }
      } else {
        const angle = between(0, Math.PI * 2);
        if (section < 0.72) {
          const tube = between(0, Math.PI * 2);
          const minorRadius = between(0.12, 0.23);
          const radius = 0.79 + Math.cos(tube) * minorRadius;
          x = Math.cos(angle) * radius;
          y = Math.sin(angle) * radius * 0.88;
          z = Math.sin(tube) * minorRadius + Math.sin(angle * 3) * 0.12;
          color = Math.sin(angle * 12 + tube * 3) > 0.7 ? 4 : random() < 0.6 ? 0 : 2;
        } else if (section < 0.9) {
          x = between(-1.2, 1.2);
          z = between(-0.91, 0.91);
          y = -0.85;
          color = random() < 0.08 ? 4 : 2;
          opacity *= 0.45;
        } else {
          const radius = between(0.15, 0.46);
          x = Math.cos(angle) * radius;
          y = Math.sin(angle) * radius;
          z = Math.sin(angle * 2) * 0.04;
          color = 4;
          opacity *= 0.8;
        }
      }
      result.push({ x, y, z, color, size, opacity });
    }
    return result;
  }

  function project(x, y, z) {
    const a = Math.cos(yaw), b = Math.sin(yaw);
    const side = x * a - z * b;
    const depth = x * b + z * a;
    const cy = Math.cos(elevation), sy = Math.sin(elevation);
    const d = y * sy + depth * cy;
    const perspective = 1 + d * 0.025;
    return {
      x: width * 0.50 + side * scale * perspective,
      y: height * 0.49 + (-y * cy + depth * sy) * scale * perspective,
      depth: d,
      perspective
    };
  }

  function line3(a, b, stroke, lineWidth = 1) {
    const p = project(...a), q = project(...b);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(q.x, q.y);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }

  function polygon(vertices, fill, stroke) {
    ctx.beginPath();
    vertices.forEach((v, i) => { const p = project(...v); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); });
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 0.8; ctx.stroke(); }
  }

  function drawGround() {
    const y = -0.84;
    // The slab is deliberately quiet: its edge is the anchor, the cloud is the subject.
    polygon([[-1.49,y,-1.20],[1.49,y,-1.20],[1.49,y,1.24],[-1.49,y,1.24]], 'rgba(232,230,215,0.46)', 'rgba(94,112,91,0.20)');
    polygon([[-1.49,y,1.24],[1.49,y,1.24],[1.49,y-0.07,1.24],[-1.49,y-0.07,1.24]], 'rgba(120,136,120,0.10)', 'rgba(94,112,91,0.12)');
    polygon([[1.49,y,-1.20],[1.49,y,1.24],[1.49,y-0.07,1.24],[1.49,y-0.07,-1.20]], 'rgba(120,136,120,0.05)', 'rgba(94,112,91,0.12)');
    for (let i = -6; i <= 6; i++) {
      const x = i * 0.23;
      line3([x,y,-1.20],[x,y,1.24], 'rgba(94,112,91,0.09)', 0.6);
    }
    for (let i = -5; i <= 5; i++) {
      const z = i * 0.23;
      line3([-1.49,y,z],[1.49,y,z], 'rgba(94,112,91,0.09)', 0.6);
    }
    // Four registration marks, like a physical specimen held in a frame.
    [[-1.49,-1.20],[-1.49,1.24],[1.49,-1.20],[1.49,1.24]].forEach(([x,z]) => {
      line3([x-0.07,y,z],[x+0.07,y,z], 'rgba(99,119,99,0.58)', 1);
      line3([x,y,z-0.07],[x,y,z+0.07], 'rgba(99,119,99,0.58)', 1);
    });
  }

  function ringPoint(angle, offset = 0, radius = 1.22) {
    const x = Math.cos(angle) * radius;
    return [x, Math.sin(angle) * radius * 0.91 + 0.05, offset + Math.sin(angle) * 0.12];
  }

  function drawRings(front) {
    const steps = 150;
    for (let band = 0; band < 2; band++) {
      for (let i = 0; i < steps; i++) {
        const a = i / steps * Math.PI * 2;
        const b = (i + 1) / steps * Math.PI * 2;
        const p = ringPoint(a, band * 0.085, 1.22 + band * 0.045);
        const q = ringPoint(b, band * 0.085, 1.22 + band * 0.045);
        const near = project(...p).depth > 0;
        if (near !== front) continue;
        line3(p, q, band ? 'rgba(190,137,65,0.24)' : 'rgba(177,123,52,0.62)', band ? 0.7 : 1.0);
        if (i % 5 === 0) {
          const outer = ringPoint(a, band * 0.085, 1.22 + band * 0.045 + (i % 15 === 0 ? 0.045 : 0.018));
          line3(p, outer, 'rgba(177,123,52,0.48)', 0.8);
        }
      }
    }
    const a = phase * 0.17 + 1.65;
    const marker = project(...ringPoint(a));
    if ((marker.depth > 0) === front) {
      ctx.beginPath(); ctx.arc(marker.x, marker.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#c68c40'; ctx.fill();
      ctx.beginPath(); ctx.arc(marker.x, marker.y, 7, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(198,140,64,0.24)'; ctx.lineWidth = 1; ctx.stroke();
    }
  }

  function drawGlass() {
    // One floating glass section cuts through the cloud as an optical scanning plane.
    const x = 0.76 + Math.sin(phase * 0.17) * 0.18;
    const corners = [[x,-0.68,-0.97],[x,0.93,-0.97],[x,0.93,0.96],[x,-0.68,0.96]];
    polygon(corners, 'rgba(214,191,137,0.025)', 'rgba(193,147,72,0.26)');
    line3([x,0.93,-0.97],[x,0.93,0.96], 'rgba(193,147,72,0.60)', 1.1);
    for (let i = 0; i < 7; i++) {
      const y = 0.79 - i * 0.055;
      line3([x,y,-0.84],[x,y,-0.40 + (i % 3) * 0.07], 'rgba(128,133,103,0.20)', 0.7);
    }
    const p = project(x, 0.93, 0.96);
    ctx.fillStyle = '#c4924d';
    ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
  }

  function drawAxes() {
    const origin = [-1.28, -0.78, 1.10];
    const axes = [
      { p: [-0.91,-0.78,1.10], text: 'x', color: '#a57a43' },
      { p: [-1.28,-0.41,1.10], text: 'y', color: '#71856e' },
      { p: [-1.28,-0.78,0.73], text: 'z', color: '#8e988b' }
    ];
    ctx.font = '9px ui-monospace, SFMono-Regular, Consolas, monospace';
    for (const axis of axes) {
      line3(origin, axis.p, axis.color, 1);
      const p = project(...axis.p);
      ctx.fillStyle = axis.color;
      ctx.fillText(axis.text, p.x + 4, p.y - 4);
    }
  }

  function render() {
    if (destroyed || !width || !height) return;
    ctx.clearRect(0, 0, width, height);
    ctx.globalAlpha = 1;
    // A soft elliptical shadow makes the cloud hover above the paper surface.
    ctx.save();
    ctx.translate(width * 0.50, height * 0.69);
    ctx.scale(1, 0.24);
    const shadow = ctx.createRadialGradient(0, 0, 0, 0, 0, scale * 1.45);
    shadow.addColorStop(0, 'rgba(82,96,75,0.10)');
    shadow.addColorStop(1, 'rgba(82,96,75,0)');
    ctx.fillStyle = shadow;
    ctx.fillRect(-scale * 1.5, -scale * 1.5, scale * 3, scale * 3);
    ctx.restore();
    drawGround();
    drawRings(false);
    const ease = transition < 1 ? 1 - Math.pow(1 - transition, 3) : 1;
    const projected = points;
    for (let i = 0; i < count; i++) {
      const a = previous[i], b = target[i];
      const x = a.x + (b.x - a.x) * ease;
      const y = a.y + (b.y - a.y) * ease;
      const z = a.z + (b.z - a.z) * ease;
      const p = project(x, y, z);
      const out = projected[i];
      out.x = p.x; out.y = p.y; out.depth = p.depth;
      out.size = b.size * (scale / 115) * p.perspective;
      out.color = b.color;
      out.opacity = Math.min(1, b.opacity * 1.18) * Math.max(0.58, Math.min(1, 0.88 + p.depth * 0.12));
    }
    // Sorting changes only the draw order, so the morph correspondence stays stable.
    const ordered = projected.slice().sort((a, b) => a.depth - b.depth);
    for (const p of ordered) {
      ctx.fillStyle = palette[p.color];
      ctx.globalAlpha = p.opacity;
      const s = Math.max(0.5, p.size);
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
    drawGlass();
    drawRings(true);
    drawAxes();
  }

  function shouldAnimate() {
    return !destroyed && inView && !document.hidden && ((!userPaused && !reduced) || transition < 1);
  }

  function tick(now) {
    frame = 0;
    if (!shouldAnimate()) return;
    const elapsed = lastFrame ? Math.min((now - lastFrame) / 1000, 0.08) : 0.033;
    if (lastFrame && now - lastFrame < 32) { frame = requestAnimationFrame(tick); return; }
    lastFrame = now;
    if (!userPaused && !reduced) {
      phase += elapsed;
      if (!pointer) yaw += elapsed * 0.024;
    }
    if (transition < 1) transition = Math.min(1, transition + elapsed * 0.9);
    render();
    if (shouldAnimate()) frame = requestAnimationFrame(tick);
  }

  function wake() {
    if (destroyed) return;
    if (shouldAnimate() && !frame) { lastFrame = 0; frame = requestAnimationFrame(tick); }
    if (!shouldAnimate() && frame) { cancelAnimationFrame(frame); frame = 0; }
  }

  function updateMotionButton() {
    if (!motionButton) return;
    const paused = userPaused || reduced;
    motionButton.setAttribute('aria-pressed', String(paused));
    motionButton.setAttribute('aria-label', paused ? t('Resume scene motion', '继续动画') : t('Pause scene motion', '暂停动画'));
    motionButton.title = paused ? t('Resume scene motion', '继续动画') : t('Pause scene motion', '暂停动画');
    motionButton.dataset.paused = String(paused);
    const label = motionButton.querySelector('[data-motion-label]');
    if (label) label.textContent = paused ? t('Resume motion', '继续动画') : t('Pause motion', '暂停动画');
    const icon = motionButton.querySelector('[data-motion-icon]');
    if (icon) icon.textContent = paused ? '▶' : 'Ⅱ';
  }

  function pause(value = true) {
    userPaused = Boolean(value);
    // An explicit Play action may override the initial reduced-motion preference.
    if (!userPaused) reduced = false;
    if (userPaused) transition = 1;
    updateMotionButton(); render(); wake();
  }

  function setMode(next) {
    if (!['reconstruction', 'mapping', 'watermark'].includes(next) || next === mode) return;
    // Capture an interrupted morph, so changing views rapidly never jumps.
    const ease = 1 - Math.pow(1 - transition, 3);
    previous = target.map((p, i) => ({
      ...p,
      x: previous[i].x + (p.x - previous[i].x) * ease,
      y: previous[i].y + (p.y - previous[i].y) * ease,
      z: previous[i].z + (p.z - previous[i].z) * ease
    }));
    target = makeFormation(next);
    mode = next;
    transition = (reduced || userPaused) ? 1 : 0;
    canvas.dataset.mode = mode;
    for (const button of modeButtons) {
      const selected = button.dataset.scene === mode;
      button.setAttribute('aria-pressed', String(selected));
      button.classList.toggle('active', selected);
    }
    if (status) status.textContent = {
      reconstruction: t('Gaussian reconstruction · drag to explore', '高斯重建 · 拖动探索'),
      mapping: t('Spatial mapping · drag to explore', '空间建图 · 拖动探索'),
      watermark: t('Watermark field · drag to explore', '水印场 · 拖动探索')
    }[mode];
    canvas.dispatchEvent(new CustomEvent('scenechange', { detail: { mode }, bubbles: true }));
    render(); wake();
  }

  function resize() {
    const rect = host.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height || width * 0.86);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    scale = Math.min(width * 0.245, height * 0.305) * zoom;
    render();
  }

  function changeZoom(delta) {
    zoom = Math.min(1.45, Math.max(0.72, zoom + delta));
    const plus = document.getElementById('scene-zoom-in');
    const minus = document.getElementById('scene-zoom-out');
    if (plus) plus.disabled = zoom >= 1.45;
    if (minus) minus.disabled = zoom <= 0.72;
    resize();
  }

  target = makeFormation(mode);
  previous = target;
  for (let i = 0; i < count; i++) points.push({ x: 0, y: 0, depth: 0, size: 1, color: 1, opacity: 1 });
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';
  canvas.style.touchAction = 'pan-y';
  canvas.style.cursor = 'grab';
  if (!canvas.hasAttribute('tabindex')) canvas.tabIndex = 0;
  if (!canvas.hasAttribute('role')) canvas.setAttribute('role', 'img');
  if (!canvas.hasAttribute('aria-label')) canvas.setAttribute('aria-label', 'Interactive research illustration. Drag or use arrow keys to rotate. Plus and minus zoom; space pauses motion.');
  canvas.dataset.mode = mode;

  on(canvas, 'pointerdown', event => {
    if (event.button !== 0 || pointer) return;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, touch: event.pointerType === 'touch', dragging: event.pointerType !== 'touch', scroll: false };
    if (pointer.dragging) { canvas.setPointerCapture(event.pointerId); canvas.style.cursor = 'grabbing'; }
  });
  on(canvas, 'pointermove', event => {
    if (!pointer || pointer.id !== event.pointerId || pointer.scroll) return;
    const totalX = event.clientX - pointer.startX;
    const totalY = event.clientY - pointer.startY;
    if (!pointer.dragging) {
      if (Math.abs(totalY) > 7 && Math.abs(totalY) > Math.abs(totalX)) { pointer.scroll = true; return; }
      if (Math.abs(totalX) < 7) return;
      pointer.dragging = true;
      canvas.setPointerCapture(event.pointerId);
    }
    yaw += (event.clientX - pointer.x) * 0.007;
    elevation = Math.min(0.85, Math.max(0.10, elevation + (event.clientY - pointer.y) * 0.004));
    pointer.x = event.clientX; pointer.y = event.clientY;
    render();
  });
  function release(event) {
    if (!pointer || (event && event.pointerId !== pointer.id)) return;
    if (canvas.hasPointerCapture(pointer.id)) canvas.releasePointerCapture(pointer.id);
    pointer = null;
    canvas.style.cursor = 'grab';
  }
  on(canvas, 'pointerup', release);
  on(canvas, 'pointercancel', release);
  on(canvas, 'lostpointercapture', release);
  on(canvas, 'pointerleave', event => { if (pointer && !pointer.dragging) release(event); });
  on(canvas, 'keydown', event => {
    if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-',' '].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'ArrowLeft') yaw -= 0.12;
    if (event.key === 'ArrowRight') yaw += 0.12;
    if (event.key === 'ArrowUp') elevation = Math.min(0.85, elevation + 0.08);
    if (event.key === 'ArrowDown') elevation = Math.max(0.10, elevation - 0.08);
    if (event.key === '+' || event.key === '=') changeZoom(0.12);
    if (event.key === '-') changeZoom(-0.12);
    if (event.key === ' ') pause(!(userPaused || reduced));
    render();
  });
  on(document.getElementById('scene-zoom-in'), 'click', () => changeZoom(0.12));
  on(document.getElementById('scene-zoom-out'), 'click', () => changeZoom(-0.12));
  on(motionButton, 'click', () => pause(!(userPaused || reduced)));
  for (const button of modeButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.scene === mode));
    on(button, 'click', () => setMode(button.dataset.scene));
  }
  on(document, 'visibilitychange', wake);
  on(motionQuery, 'change', event => {
    reduced = event.matches;
    userPaused = event.matches;
    if (reduced) transition = 1;
    updateMotionButton(); render(); wake();
  });

  const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  if (resizeObserver) resizeObserver.observe(host);
  else on(window, 'resize', resize);
  const intersectionObserver = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(entries => {
    inView = entries[0].isIntersecting;
    wake();
  }, { rootMargin: '60px' }) : null;
  if (intersectionObserver) intersectionObserver.observe(canvas);

  window.ResearchScene = Object.freeze({
    setMode,
    pause,
    render,
    get mode() { return mode; },
    destroy() {
      destroyed = true;
      if (frame) cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      cleanup.forEach(fn => fn());
    }
  });
  updateMotionButton();
  resize();
  wake();
})();
