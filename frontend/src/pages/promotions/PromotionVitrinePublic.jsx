import React, { useEffect, useState, useCallback, useRef } from 'react';
import { ExternalLink, MapPin } from 'lucide-react';
import PromotionLayoutRenderer from '../../components/promotions/PromotionLayoutRenderer';
import { defaultCtaMessage } from '../../utils/whatsappLink';
import { resolveCampaignImageUrl } from '../../utils/upload';
import './vitrine.css';

function formatAddress(addr) {
  if (!addr) return null;
  const parts = [addr.line1, addr.neighborhood, addr.city, addr.state].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

function availabilityBadge(profile) {
  if (!profile) return null;
  if (profile.availabilityStatus === 'closed_today') {
    return { text: 'Fechado hoje', tone: 'closed' };
  }
  if (profile.availabilityStatus === 'delivery_only') {
    return { text: 'Delivery / remoto', tone: 'delivery' };
  }
  if (profile.isOpenNow === true) {
    return { text: 'Aberto agora', tone: 'open' };
  }
  if (profile.isOpenNow === false && profile.availabilityStatus === 'open') {
    return { text: 'Fechado no momento', tone: 'closed' };
  }
  if (profile.availabilityStatus === 'custom' && profile.availabilityNote) {
    return { text: profile.availabilityNote, tone: 'custom' };
  }
  return null;
}

function VitrineHeader({ tenantName, profile }) {
  const logoSrc = profile?.logoUrl ? resolveCampaignImageUrl(profile.logoUrl) : null;
  const address = formatAddress(profile?.address);
  const badge = availabilityBadge(profile);
  const instagram = profile?.instagramUrl?.trim();

  return (
    <header className="promo-vitrine-header">
      {logoSrc && (
        <div className="promo-vitrine-logo-wrap">
          <img src={logoSrc} alt="" className="promo-vitrine-logo" />
        </div>
      )}
      <h1>{tenantName}</h1>
      {profile?.tagline && <p className="promo-vitrine-tagline">{profile.tagline}</p>}
      <p className="promo-vitrine-subtitle">Promoção do dia</p>

      {(badge || profile?.todayHoursLabel) && (
        <div className="promo-vitrine-meta">
          {badge && (
            <span className={`promo-vitrine-badge promo-vitrine-badge--${badge.tone}`}>
              {badge.text}
            </span>
          )}
          {profile?.todayHoursLabel && (
            <span className="promo-vitrine-hours">{profile.todayHoursLabel}</span>
          )}
        </div>
      )}

      {profile?.availabilityNote && profile.availabilityStatus !== 'custom' && (
        <p className="promo-vitrine-note">{profile.availabilityNote}</p>
      )}

      {(address || instagram) && (
        <div className="promo-vitrine-contact">
          {address && (
            <span className="promo-vitrine-address">
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              {address}
            </span>
          )}
          {instagram && (
            <a
              href={instagram.startsWith('http') ? instagram : `https://${instagram}`}
              target="_blank"
              rel="noopener noreferrer"
              className="promo-vitrine-instagram"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Instagram
            </a>
          )}
        </div>
      )}
    </header>
  );
}

const REDIRECT_URL = 'https://gestaozap.digital';

function getVisitorSession() {
  const key = 'gz_promo_session';
  let id = localStorage.getItem(key);
  if (!id) {
    id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(key, id);
  }
  return id;
}

async function fetchVitrine() {
  const res = await fetch('/api/public/promotions/vitrine', {
    credentials: 'include',
    redirect: 'manual',
  });
  if (res.status === 302 || res.type === 'opaqueredirect') {
    window.location.replace(REDIRECT_URL);
    return null;
  }
  if (res.status === 403) {
    const data = await res.json().catch(() => ({}));
    if (data.inactive || data.redirectUrl) {
      window.location.replace(data.redirectUrl || REDIRECT_URL);
      return null;
    }
  }
  if (!res.ok) throw new Error('Não foi possível carregar a vitrine');
  return res.json();
}

async function postEvent(body) {
  try {
    await fetch('/api/public/promotions/events', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (_) {}
}

async function postLead(body) {
  try {
    await fetch('/api/public/promotions/leads', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (_) {}
}

export default function PromotionVitrinePublic() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const sessionId = useRef(getVisitorSession());
  const viewed = useRef(false);

  useEffect(() => {
    fetchVitrine()
      .then((json) => {
        if (!json) return;
        setData(json);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!data || data.empty || viewed.current) return;
    viewed.current = true;
    postEvent({
      eventType: 'page_view',
      sessionId: sessionId.current,
    });
  }, [data]);

  const handleCta = useCallback((promotion, itemId) => {
    const slot = promotion.slots?.find((s) => s.slotKey === itemId);
    const items = promotion.contentJson?.items || [];
    const item = items.find((i) => i.id === itemId);
    const label = item?.title || slot?.label || itemId;
    const message = item?.ctaText || slot?.ctaText || defaultCtaMessage(label);

    postEvent({
      eventType: 'cta_click',
      promotionId: promotion.id,
      slotId: slot?.id,
      sessionId: sessionId.current,
      metadata: { itemId },
    });

    postLead({
      promotionId: promotion.id,
      slotId: slot?.id,
      message,
      source: 'whatsapp_cta',
      visitorSession: sessionId.current,
    });
  }, []);

  if (loading) {
    return (
      <div className="promo-vitrine-page flex items-center justify-center">
        <span className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="promo-vitrine-page promo-vitrine-body">
        <p className="text-center text-slate-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="promo-vitrine-page">
      <VitrineHeader tenantName={data.tenantName} profile={data.profile} />

      <main className="promo-vitrine-body">
        {data.empty ? (
          <div className="promo-vitrine-empty">
            <h2>Nenhuma promoção esta semana</h2>
            <p>Volte em breve — sempre tem novidade por aqui.</p>
          </div>
        ) : (
          data.promotions.map((promo) => (
            <article key={promo.id} className="promo-promotion-block">
              <h2 className="promo-promotion-title">{promo.title}</h2>
              <PromotionLayoutRenderer
                promotion={promo}
                phone={data.phone}
                onCta={(itemId) => handleCta(promo, itemId)}
              />
            </article>
          ))
        )}
      </main>
    </div>
  );
}
