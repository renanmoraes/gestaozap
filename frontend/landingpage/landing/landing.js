/* GestãoZap landing — interactions & 3D engine (vanilla, no deps) */
(function () {
  'use strict';
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* ---- Nav scrolled state ---- */
  const nav = document.querySelector('.nav');
  const onScrollNav = () => nav.classList.toggle('scrolled', window.scrollY > 40);
  onScrollNav();
  window.addEventListener('scroll', onScrollNav, { passive: true });

  /* ---- Lucide icons ---- */
  function icons() { if (window.lucide) window.lucide.createIcons(); }
  icons();

  /* ---- Scroll reveal ---- */
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
  document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

  /* ---- HERO 3D: mouse parallax + scroll rotation ---- */
  const stageInner = document.querySelector('.stage-inner');
  const stage = document.querySelector('.stage');
  const chips = Array.from(document.querySelectorAll('.chip'));
  const glows = Array.from(document.querySelectorAll('.hero .glow'));

  let mx = 0, my = 0;          // target mouse (-1..1)
  let cmx = 0, cmy = 0;        // current (eased)
  let scrollT = 0;            // 0 at hero top → grows

  if (stage && !reduce) {
    const hero = document.querySelector('.hero');
    hero.addEventListener('pointermove', (e) => {
      const r = hero.getBoundingClientRect();
      mx = ((e.clientX - r.left) / r.width - 0.5) * 2;
      my = ((e.clientY - r.top) / r.height - 0.5) * 2;
    });
    hero.addEventListener('pointerleave', () => { mx = 0; my = 0; });
  }

  function computeScroll() {
    const hero = document.querySelector('.hero');
    if (!hero) return;
    const h = hero.offsetHeight;
    scrollT = clamp(window.scrollY / h, 0, 1);
  }
  computeScroll();
  window.addEventListener('scroll', computeScroll, { passive: true });

  function raf() {
    cmx = lerp(cmx, mx, 0.07);
    cmy = lerp(cmy, my, 0.07);

    if (stageInner) {
      // base tilt + mouse + scroll flattening
      const k = (window.LANDING_TW && typeof window.LANDING_TW.intensity === 'number') ? window.LANDING_TW.intensity : 1;
      const baseRY = -13;          // start angle
      const ry = reduce ? 0 : (baseRY + cmx * 7 + scrollT * 12) * k;
      const rx = reduce ? 0 : (6 + (-cmy * 5) - scrollT * 8) * k;
      const ty = reduce ? 0 : -scrollT * 40 * k;
      const sc = reduce ? 1 : 0.95;
      stageInner.style.transform =
        `translateY(${ty}px) scale(${sc}) rotateX(${rx}deg) rotateY(${ry}deg)`;
    }

    const k2 = (window.LANDING_TW && typeof window.LANDING_TW.intensity === 'number') ? window.LANDING_TW.intensity : 1;
    // chips float at different depths
    chips.forEach((c, i) => {
      const depth = (i + 1) * 14;
      const dir = i % 2 === 0 ? 1 : -1;
      const tx = reduce ? 0 : cmx * depth * dir * k2;
      const ty = reduce ? 0 : (cmy * depth * dir - scrollT * (30 + i * 14)) * k2;
      c.style.transform = `translate3d(${tx}px, ${ty}px, ${(40 + i * 18) * k2}px)`;
    });

    // glows drift
    glows.forEach((g, i) => {
      const d = (i + 1) * 12;
      g.style.transform = `translate3d(${cmx * d}px, ${cmy * d - scrollT * 30}px, 0)`;
    });

    requestAnimationFrame(raf);
  }
  requestAnimationFrame(raf);

  /* ---- Benefit card tilt (per-card) ---- */
  if (!reduce) {
    document.querySelectorAll('.bcard').forEach((card) => {
      card.style.perspective = '700px';
      card.addEventListener('pointermove', (e) => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        card.style.transform = `rotateY(${px * 9}deg) rotateX(${-py * 9}deg) translateY(-4px)`;
      });
      card.addEventListener('pointerleave', () => { card.style.transform = ''; });
    });
  }

  /* ---- Decorative QR (deterministic, not a real code) ---- */
  document.querySelectorAll('[data-qr]').forEach((box) => {
    const N = 25, cell = 100 / N;
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    let seed = 7;
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    const finder = (ox, oy) => {
      const add = (x, y, w, h, fill) => {
        const r = document.createElementNS(svgNS, 'rect');
        r.setAttribute('x', x); r.setAttribute('y', y);
        r.setAttribute('width', w); r.setAttribute('height', h);
        r.setAttribute('fill', fill); r.setAttribute('rx', cell * 0.5);
        svg.appendChild(r);
      };
      add(ox * cell, oy * cell, cell * 7, cell * 7, '#0f172a');
      add((ox + 1) * cell, (oy + 1) * cell, cell * 5, cell * 5, '#fff');
      add((ox + 2) * cell, (oy + 2) * cell, cell * 3, cell * 3, '#10b981');
    };
    // random modules
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const inFinder = (x < 8 && y < 8) || (x > N - 9 && y < 8) || (x < 8 && y > N - 9);
      if (inFinder) continue;
      if (rnd() > 0.56) {
        const r = document.createElementNS(svgNS, 'rect');
        r.setAttribute('x', x * cell + cell * 0.1); r.setAttribute('y', y * cell + cell * 0.1);
        r.setAttribute('width', cell * 0.8); r.setAttribute('height', cell * 0.8);
        r.setAttribute('rx', cell * 0.22); r.setAttribute('fill', '#0f172a');
        svg.appendChild(r);
      }
    }
    finder(0, 0); finder(N - 7, 0); finder(0, N - 7);
    box.appendChild(svg);
  });

  /* ---- FAQ accordion ---- */
  document.querySelectorAll('.faq-item').forEach((item) => {
    const q = item.querySelector('.faq-q');
    const a = item.querySelector('.faq-a');
    q.addEventListener('click', () => {
      const open = item.classList.contains('open');
      document.querySelectorAll('.faq-item.open').forEach((o) => {
        o.classList.remove('open'); o.querySelector('.faq-a').style.maxHeight = '0px';
      });
      if (!open) { item.classList.add('open'); a.style.maxHeight = a.scrollHeight + 'px'; }
    });
  });

  /* ---- Animated number count-up in security stats ---- */
  const countEls = document.querySelectorAll('[data-count]');
  const cio = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      const el = e.target;
      const target = parseFloat(el.dataset.count);
      const suffix = el.dataset.suffix || '';
      const dur = 1100; const t0 = performance.now();
      function step(now) {
        const p = clamp((now - t0) / dur, 0, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        const val = target % 1 === 0 ? Math.round(target * eased) : (target * eased).toFixed(0);
        el.textContent = val + suffix;
        if (p < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
      cio.unobserve(el);
    });
  }, { threshold: 0.5 });
  countEls.forEach((el) => cio.observe(el));
})();
