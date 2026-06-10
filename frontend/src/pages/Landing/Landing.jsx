import { useEffect, useRef } from 'react';
import { createIcons, icons } from 'lucide';
import landingBody from './landing-body.html?raw';
import { initLandingEffects } from './useLandingEffects';
import { persistAffiliateRef } from '../../utils/affiliateRef';
import api from '../../api';
import './styles.css';
import './landing.css';

// Injeta dinamicamente nos cards de plano as features pagas inclusas em cada plano.
function injectIncludedFeatures(root) {
  api.get('/api/public/landing/plan-features')
    .then(({ data }) => {
      const plans = data?.plans || {};
      let changed = false;
      root.querySelectorAll('#planos .plan').forEach((card) => {
        const slug = card.querySelector('.pname')?.textContent?.trim().toLowerCase();
        const feats = plans[slug] || [];
        const ul = card.querySelector('.plan-feat');
        if (!feats.length || !ul) return;
        feats.forEach((f) => {
          const li = document.createElement('li');
          li.className = 'plan-feat-incl';
          li.innerHTML = `<i data-lucide="check"></i>${f.name}`
            + ' <span class="plan-incl-tag">incluso</span>';
          ul.appendChild(li);
          changed = true;
        });
      });
      if (changed) createIcons({ icons, attrs: { 'stroke-width': 1.5 }, nameAttr: 'data-lucide' });
    })
    .catch(() => {});
}

export default function Landing() {
  const rootRef = useRef(null);

  useEffect(() => {
    document.documentElement.classList.add('landing-page');
    document.body.classList.add('landing-page');
    return () => {
      document.documentElement.classList.remove('landing-page');
      document.body.classList.remove('landing-page');
    };
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    // Em produção no domínio raiz, aponta "Entrar no painel" para admin.gestaozap.digital
    const h = window.location.hostname;
    const isRootProd = h === 'gestaozap.digital' || h === 'www.gestaozap.digital';
    if (isRootProd) {
      root.querySelectorAll('a[href="/admin"]').forEach((a) => {
        a.setAttribute('href', 'https://admin.gestaozap.digital');
      });
    }

    // CTAs primários (hero, final e botões de plano) → pré-cadastro self-service,
    // preservando o código de afiliado (?ref=). WhatsApp segue como canal secundário (nav/rodapé).
    const refCode = new URLSearchParams(window.location.search).get('ref');
    if (refCode) {
      const code = refCode.trim().toUpperCase();
      persistAffiliateRef(code);
      api.get(`/api/affiliates/capture/${encodeURIComponent(code)}`).catch(() => {});
    }
    // Código fica em sessionStorage; CTAs vão direto ao registro sem ?ref= na URL.
    const signupUrl = '/registrar';
    root.querySelectorAll('a.btn-wa.btn-lg, #planos a.btn').forEach((a) => {
      a.setAttribute('href', signupUrl);
      a.removeAttribute('target');
      a.removeAttribute('rel');
    });

    // Links legais do rodapé → páginas dedicadas
    const legalMap = {
      'Termos de uso': '/termos',
      'Política de privacidade': '/privacidade',
      'LGPD': '/lgpd',
    };
    root.querySelectorAll('.foot-col a[href="#"]').forEach((a) => {
      const target = legalMap[a.textContent.trim()];
      if (target) a.setAttribute('href', target);
    });

    const cleanup = initLandingEffects(root);
    injectIncludedFeatures(root);
    return cleanup;
  }, []);

  return (
    <div
      ref={rootRef}
      className="landing-root"
      dangerouslySetInnerHTML={{ __html: landingBody }}
    />
  );
}
