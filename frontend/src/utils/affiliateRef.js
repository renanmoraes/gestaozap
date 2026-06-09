const REF_KEY = 'gz_aff_ref';
const LOCKED_KEY = 'gz_aff_locked';

export function persistAffiliateRef(code) {
  const normalized = String(code || '').trim().toUpperCase();
  if (!normalized) return;
  try {
    sessionStorage.setItem(REF_KEY, normalized);
    sessionStorage.setItem(LOCKED_KEY, '1');
  } catch {
    /* sessionStorage indisponível */
  }
}

export function getPersistedAffiliateRef() {
  try {
    return sessionStorage.getItem(REF_KEY) || '';
  } catch {
    return '';
  }
}

export function isAffiliateRefLocked() {
  try {
    return sessionStorage.getItem(LOCKED_KEY) === '1' && Boolean(getPersistedAffiliateRef());
  } catch {
    return false;
  }
}

export function clearAffiliateRef() {
  try {
    sessionStorage.removeItem(REF_KEY);
    sessionStorage.removeItem(LOCKED_KEY);
  } catch {
    /* ignore */
  }
}
