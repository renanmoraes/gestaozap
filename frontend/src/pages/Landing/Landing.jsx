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
    const cleanup = initLandingEffects(rootRef.current);
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
