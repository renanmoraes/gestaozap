import { useState, useEffect } from 'react';

const QUERY = '(max-width: 767px)';

export function useIsMobile() {
  const [mobile, setMobile] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia(QUERY).matches
  ));

  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const onChange = (e) => setMobile(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return mobile;
}
