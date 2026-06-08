/* GestãoZap landing — interactions & 3D engine (vanilla, no deps) */
import { createIcons, icons } from 'lucide';

export function initLandingEffects(root) {
  if (!root) return () => {};

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  const cleanups = [];

  /* ---- Nav scrolled state ---- */
  const nav = root.querySelector('.nav');
  const onScrollNav = () => nav?.classList.toggle('scrolled', window.scrollY > 40);
  if (nav) {
    onScrollNav();
    window.addEventListener('scroll', onScrollNav, { passive: true });
    cleanups.push(() => window.removeEventListener('scroll', onScrollNav));
  }

  /* ---- Lucide icons ---- */
  createIcons({ icons, attrs: { 'stroke-width': 1.5 }, nameAttr: 'data-lucide' });

  /* ---- Scroll reveal ---- */
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add('in');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
  root.querySelectorAll('.reveal').forEach((el) => io.observe(el));
  cleanups.push(() => io.disconnect());

  /* ---- HERO 3D: mouse parallax + scroll rotation ---- */
  const stageInner = root.querySelector('.stage-inner');
  const chips = Array.from(root.querySelectorAll('.chip'));
  const glows = Array.from(root.querySelectorAll('.hero .glow'));

  let mx = 0;
  let my = 0;
  let cmx = 0;
  let cmy = 0;
  let scrollT = 0;
  let rafId = 0;

  const hero = root.querySelector('.hero');
  if (stageInner && hero && !reduce) {
    const onMove = (e) => {
      const r = hero.getBoundingClientRect();
      mx = ((e.clientX - r.left) / r.width - 0.5) * 2;
      my = ((e.clientY - r.top) / r.height - 0.5) * 2;
    };
    const onLeave = () => { mx = 0; my = 0; };
    hero.addEventListener('pointermove', onMove);
    hero.addEventListener('pointerleave', onLeave);
    cleanups.push(() => {
      hero.removeEventListener('pointermove', onMove);
      hero.removeEventListener('pointerleave', onLeave);
    });
  }

  const computeScroll = () => {
    if (!hero) return;
    scrollT = clamp(window.scrollY / hero.offsetHeight, 0, 1);
  };
  computeScroll();
  window.addEventListener('scroll', computeScroll, { passive: true });
  cleanups.push(() => window.removeEventListener('scroll', computeScroll));

  const raf = () => {
    cmx = lerp(cmx, mx, 0.07);
    cmy = lerp(cmy, my, 0.07);

    if (stageInner) {
      const k = 1;
      const baseRY = -13;
      const ry = reduce ? 0 : baseRY + cmx * 7 + scrollT * 12;
      const rx = reduce ? 0 : 6 + (-cmy * 5) - scrollT * 8;
      const ty = reduce ? 0 : -scrollT * 40;
      const sc = reduce ? 1 : 0.95;
      stageInner.style.transform =
        `translateY(${ty}px) scale(${sc}) rotateX(${rx}deg) rotateY(${ry}deg)`;
    }

    chips.forEach((c, i) => {
      const depth = (i + 1) * 14;
      const dir = i % 2 === 0 ? 1 : -1;
      const tx = reduce ? 0 : cmx * depth * dir;
      const ty = reduce ? 0 : cmy * depth * dir - scrollT * (30 + i * 14);
      c.style.transform = `translate3d(${tx}px, ${ty}px, ${40 + i * 18}px)`;
    });

    glows.forEach((g, i) => {
      const d = (i + 1) * 12;
      g.style.transform = `translate3d(${cmx * d}px, ${cmy * d - scrollT * 30}px, 0)`;
    });

    rafId = requestAnimationFrame(raf);
  };
  rafId = requestAnimationFrame(raf);
  cleanups.push(() => cancelAnimationFrame(rafId));

  /* ---- Benefit card tilt ---- */
  if (!reduce) {
    root.querySelectorAll('.bcard').forEach((card) => {
      card.style.perspective = '700px';
      const onMove = (e) => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        card.style.transform = `rotateY(${px * 9}deg) rotateX(${-py * 9}deg) translateY(-4px)`;
      };
      const onLeave = () => { card.style.transform = ''; };
      card.addEventListener('pointermove', onMove);
      card.addEventListener('pointerleave', onLeave);
      cleanups.push(() => {
        card.removeEventListener('pointermove', onMove);
        card.removeEventListener('pointerleave', onLeave);
      });
    });
  }

  /* ---- Decorative QR ---- */
  root.querySelectorAll('[data-qr]').forEach((box) => {
    const N = 25;
    const cell = 100 / N;
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    let seed = 7;
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    const finder = (ox, oy) => {
      const add = (x, y, w, h, fill) => {
        const rect = document.createElementNS(svgNS, 'rect');
        rect.setAttribute('x', x);
        rect.setAttribute('y', y);
        rect.setAttribute('width', w);
        rect.setAttribute('height', h);
        rect.setAttribute('fill', fill);
        rect.setAttribute('rx', cell * 0.5);
        svg.appendChild(rect);
      };
      add(ox * cell, oy * cell, cell * 7, cell * 7, '#0f172a');
      add((ox + 1) * cell, (oy + 1) * cell, cell * 5, cell * 5, '#fff');
      add((ox + 2) * cell, (oy + 2) * cell, cell * 3, cell * 3, '#10b981');
    };
    for (let y = 0; y < N; y += 1) {
      for (let x = 0; x < N; x += 1) {
        const inFinder = (x < 8 && y < 8) || (x > N - 9 && y < 8) || (x < 8 && y > N - 9);
        if (inFinder) continue;
        if (rnd() > 0.56) {
          const rect = document.createElementNS(svgNS, 'rect');
          rect.setAttribute('x', x * cell + cell * 0.1);
          rect.setAttribute('y', y * cell + cell * 0.1);
          rect.setAttribute('width', cell * 0.8);
          rect.setAttribute('height', cell * 0.8);
          rect.setAttribute('rx', cell * 0.22);
          rect.setAttribute('fill', '#0f172a');
          svg.appendChild(rect);
        }
      }
    }
    finder(0, 0);
    finder(N - 7, 0);
    finder(0, N - 7);
    box.appendChild(svg);
  });

  /* ---- FAQ accordion ---- */
  root.querySelectorAll('.faq-item').forEach((item) => {
    const q = item.querySelector('.faq-q');
    const a = item.querySelector('.faq-a');
    if (!q || !a) return;
    const onClick = () => {
      const open = item.classList.contains('open');
      root.querySelectorAll('.faq-item.open').forEach((o) => {
        o.classList.remove('open');
        const ans = o.querySelector('.faq-a');
        if (ans) ans.style.maxHeight = '0px';
      });
      if (!open) {
        item.classList.add('open');
        a.style.maxHeight = `${a.scrollHeight}px`;
      }
    };
    q.addEventListener('click', onClick);
    cleanups.push(() => q.removeEventListener('click', onClick));
  });

  /* ---- Animated number count-up ---- */
  const countEls = root.querySelectorAll('[data-count]');
  const cio = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      const el = e.target;
      const target = parseFloat(el.dataset.count);
      const suffix = el.dataset.suffix || '';
      const dur = 1100;
      const t0 = performance.now();
      const step = (now) => {
        const p = clamp((now - t0) / dur, 0, 1);
        const eased = 1 - (1 - p) ** 3;
        const val = target % 1 === 0 ? Math.round(target * eased) : (target * eased).toFixed(0);
        el.textContent = val + suffix;
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
      cio.unobserve(el);
    });
  }, { threshold: 0.5 });
  countEls.forEach((el) => cio.observe(el));
  cleanups.push(() => cio.disconnect());

  return () => cleanups.forEach((fn) => fn());
}
