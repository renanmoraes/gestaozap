import { useEffect, useRef } from 'react';
import landingBody from './landing-body.html?raw';
import { initLandingEffects } from './useLandingEffects';
import './styles.css';
import './landing.css';

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
    const signupUrl = refCode ? `/registrar?ref=${encodeURIComponent(refCode)}` : '/registrar';
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
