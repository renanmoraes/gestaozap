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
