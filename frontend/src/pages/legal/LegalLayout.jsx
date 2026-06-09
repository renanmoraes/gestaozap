import React, { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Zap, ArrowLeft } from 'lucide-react';

const DOCS = [
  { to: '/termos', label: 'Termos de Uso' },
  { to: '/privacidade', label: 'Política de Privacidade' },
  { to: '/lgpd', label: 'LGPD' },
];

/* ── Helpers de tipografia (mantêm as páginas legíveis e consistentes) ── */
export function H2({ id, children }) {
  return (
    <h2 id={id} className="scroll-mt-24 text-lg font-semibold text-slate-900 mt-10 mb-3 pb-1.5 border-b border-slate-100">
      {children}
    </h2>
  );
}
export function H3({ children }) {
  return <h3 className="text-sm font-semibold text-slate-800 mt-5 mb-2">{children}</h3>;
}
export function P({ children }) {
  return <p className="text-[15px] leading-7 text-slate-600 mb-3">{children}</p>;
}
export function UL({ children }) {
  return <ul className="list-disc pl-5 space-y-1.5 text-[15px] leading-7 text-slate-600 mb-3">{children}</ul>;
}
export function Callout({ children, tone = 'brand' }) {
  const tones = {
    brand: 'bg-brand-50 border-brand-200 text-brand-800',
    amber: 'bg-amber-50 border-amber-200 text-amber-800',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  };
  return <div className={`rounded-xl border p-4 text-[15px] leading-7 mb-4 ${tones[tone]}`}>{children}</div>;
}

export default function LegalLayout({ title, updated, intro, toc, children }) {
  const { pathname } = useLocation();

  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/85 backdrop-blur border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-5 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </span>
            <span className="font-bold text-slate-900">GestãoZap</span>
          </Link>
          <Link to="/" className="text-sm text-slate-500 hover:text-slate-800 inline-flex items-center gap-1.5">
            <ArrowLeft className="w-4 h-4" /> Voltar ao site
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-10">
        {/* Título */}
        <div className="mb-6">
          <div className="inline-flex items-center gap-2 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1 mb-3">
            Documento legal · GestãoZap
          </div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">{title}</h1>
          {updated && <p className="text-sm text-slate-400 mt-2">Última atualização: {updated}</p>}
          {intro && <p className="text-[15px] leading-7 text-slate-600 mt-4">{intro}</p>}
        </div>

        {/* Navegação entre documentos legais */}
        <nav className="flex flex-wrap gap-2 mb-8">
          {DOCS.map((d) => {
            const active = pathname === d.to;
            return (
              <Link
                key={d.to}
                to={d.to}
                className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${
                  active
                    ? 'bg-brand-600 text-white border-brand-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                }`}
              >
                {d.label}
              </Link>
            );
          })}
        </nav>

        {/* Sumário (âncoras) */}
        {toc?.length > 0 && (
          <div className="card p-5 mb-8">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">Nesta página</div>
            <ol className="space-y-1.5">
              {toc.map((t, i) => (
                <li key={t.id}>
                  <a href={`#${t.id}`} className="text-sm text-brand-600 hover:text-brand-700">
                    {i + 1}. {t.label}
                  </a>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* Conteúdo */}
        <article>{children}</article>

        {/* Rodapé */}
        <footer className="mt-12 pt-6 border-t border-slate-200 text-sm text-slate-500">
          <p className="mb-2">
            Dúvidas sobre este documento? Fale com a gente pelo WhatsApp{' '}
            <a href="https://wa.me/5531995637020" className="text-brand-600" target="_blank" rel="noopener noreferrer">
              (31) 99563-7020
            </a>{' '}
            ou por <a href="mailto:contato@gestaozap.digital" className="text-brand-600">contato@gestaozap.digital</a>.
          </p>
          <p className="text-slate-400">© {new Date().getFullYear()} GestãoZap · gestaozap.digital</p>
        </footer>
      </main>
    </div>
  );
}
