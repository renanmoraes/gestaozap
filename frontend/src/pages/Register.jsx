import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Zap, Tag, AlertCircle, CheckCircle2, ArrowRight, Loader2 } from 'lucide-react';
import api from '../api';
import { formatPhone, maskPhoneInput } from '../utils/phone';

export default function Register() {
  const [params] = useSearchParams();
  const navigate  = useNavigate();
  const refCode   = params.get('ref')?.toUpperCase() || '';

  const [affiliate, setAffiliate] = useState(null);
  const [plans, setPlans]         = useState([]);
  const [loadingRef, setLoadingRef] = useState(Boolean(refCode));
  const [refError, setRefError]   = useState(null);

  const [form, setForm] = useState({
    slug: '', name: '', registeredPhone: '', planSlug: '', affiliateCode: refCode,
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [done, setDone] = useState(null);

  // Valida o código de afiliado e carrega planos com preços calculados
  useEffect(() => {
    const code = (form.affiliateCode || refCode).toUpperCase();
    if (!code) {
      // Sem código — carrega planos normais
      api.get('/api/affiliates/validate/NOCODE').catch(() => {});
      return;
    }
    setLoadingRef(true);
    setRefError(null);
    api.get(`/api/affiliates/validate/${code}`)
      .then(({ data }) => {
        setAffiliate(data.affiliate);
        setPlans(data.plans);
        if (!form.planSlug && data.plans.length) setForm((f) => ({ ...f, planSlug: data.plans[0].slug }));
      })
      .catch((err) => {
        setAffiliate(null);
        setRefError(err.response?.data?.error || 'Código inválido');
        setPlans([]);
      })
      .finally(() => setLoadingRef(false));
  }, [form.affiliateCode]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true); setSubmitError(null);
    try {
      const { data } = await api.post('/api/affiliates/register', {
        ...form,
        affiliateCode: form.affiliateCode.toUpperCase() || null,
      });
      setDone(data);
    } catch (err) {
      setSubmitError(err.response?.data?.error || 'Erro ao criar conta. Tente novamente.');
    } finally { setSubmitting(false); }
  };

  if (done) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="card p-8 max-w-md text-center shadow-sm">
          <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-7 h-7 text-emerald-600" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">Conta criada com sucesso!</h1>
          <p className="text-sm text-slate-500 mb-4">
            Seu acesso ao plano <strong>{done.plan}</strong> foi configurado.
          </p>
          {done.affiliateCode && (
            <div className="bg-emerald-50 rounded-lg p-4 mb-5 text-sm text-emerald-700">
              <strong>Desconto aplicado:</strong> −R$ {Number(done.discountBrl).toFixed(2)}<br />
              Valor final: <strong>R$ {Number(done.finalPriceBrl).toFixed(2)}/mês</strong>
            </div>
          )}
          <p className="text-xs text-slate-400 mb-5">
            Acesse <code className="bg-slate-100 px-1.5 py-0.5 rounded">{done.slug}.gestaozap.digital</code> para entrar.
          </p>
          <button
            onClick={() => window.location.href = `/${done.slug}`}
            className="btn-primary flex items-center justify-center gap-2 w-full"
          >
            Ir para minha conta <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  const selectedPlan = plans.find((p) => p.slug === form.planSlug);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="flex items-center gap-3 justify-center mb-8">
          <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="font-bold text-slate-900 text-lg">GestãoZap</div>
            <div className="text-xs text-slate-400">Disparos profissionais via WhatsApp</div>
          </div>
        </div>

        {/* Banner de afiliado */}
        {affiliate && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-brand-50 border border-brand-200 mb-5">
            <Tag className="w-5 h-5 text-brand-600 shrink-0" />
            <div>
              <div className="text-sm font-semibold text-brand-800">
                Indicação de {affiliate.name}
              </div>
              <div className="text-xs text-brand-600 mt-0.5">
                Código <strong>{affiliate.code}</strong> — {affiliate.discountPct}% de desconto no primeiro mês de qualquer plano
              </div>
            </div>
          </div>
        )}

        <div className="card p-7 shadow-sm">
          <h1 className="text-lg font-bold text-slate-900 mb-5">Criar minha conta</h1>

          {submitError && (
            <div className="flex gap-2 p-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm mb-4">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{submitError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Código de afiliado */}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Código de afiliado <span className="text-slate-400 font-normal">(opcional)</span>
              </label>
              <div className="flex gap-2">
                <input
                  className="input flex-1 font-mono uppercase"
                  placeholder="EX: JOAO25"
                  value={form.affiliateCode}
                  onChange={(e) => setForm({ ...form, affiliateCode: e.target.value.toUpperCase() })}
                />
                {loadingRef && <Loader2 className="w-5 h-5 text-slate-400 mt-2.5 animate-spin" />}
                {affiliate && <CheckCircle2 className="w-5 h-5 text-emerald-500 mt-2.5" />}
              </div>
              {refError && <p className="text-xs text-red-500 mt-1">{refError}</p>}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">Nome da empresa</label>
              <input className="input" placeholder="Farmácia Vida Plena" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Slug único (URL da sua conta)
              </label>
              <div className="flex items-center gap-0">
                <span className="px-3 py-2.5 bg-slate-100 border border-r-0 border-slate-300 rounded-l-lg text-sm text-slate-500 shrink-0">
                  gestaozap.digital/
                </span>
                <input className="input rounded-l-none flex-1" placeholder="farmacia-vida-plena" value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
                  required />
              </div>
              <p className="text-xs text-slate-400 mt-1">Apenas letras minúsculas, números e hífens</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">Número WhatsApp</label>
              <input className="input font-mono" placeholder="(11) 98765-4321"
                value={formatPhone(form.registeredPhone)}
                onChange={(e) => setForm({ ...form, registeredPhone: maskPhoneInput(e.target.value) })} required />
              <p className="text-xs text-slate-400 mt-1">Com DDD. Para Brasil, adicione 55 no começo se preferir.</p>
            </div>

            {/* Seleção de plano */}
            {plans.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-2">Escolha seu plano</label>
                <div className="space-y-2">
                  {plans.map((p) => (
                    <label key={p.slug}
                      className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                        form.planSlug === p.slug
                          ? 'border-brand-500 bg-brand-50'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <input type="radio" name="plan" value={p.slug} checked={form.planSlug === p.slug}
                        onChange={() => setForm({ ...form, planSlug: p.slug })} className="text-brand-600" />
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-slate-800">{p.name}</span>
                          <div className="text-right">
                            {Number(p.discountBrl) > 0 && (
                              <div className="text-xs text-slate-400 line-through">
                                R$ {Number(p.originalPriceBrl).toFixed(2)}
                              </div>
                            )}
                            <div className="text-sm font-bold text-slate-900">
                              R$ {Number(p.finalPriceBrl).toFixed(2)}
                              <span className="text-xs font-normal text-slate-400">/mês</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {p.messagesPerMonth ? `${p.messagesPerMonth.toLocaleString('pt-BR')} mensagens/mês` : 'Mensagens ilimitadas'}
                          {Number(p.discountBrl) > 0 && (
                            <span className="ml-2 text-emerald-600 font-medium">
                              −R$ {Number(p.discountBrl).toFixed(2)} de desconto
                            </span>
                          )}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {!plans.length && !loadingRef && (
              <div className="text-center py-4 text-sm text-slate-400">
                Carregando planos… (ou insira um código de afiliado acima)
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !form.planSlug || !form.name || !form.slug || !form.registeredPhone}
              className="btn-primary w-full flex items-center justify-center gap-2 py-3 mt-2 disabled:opacity-50"
            >
              {submitting
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <ArrowRight className="w-4 h-4" />}
              {submitting ? 'Criando conta…' : 'Criar minha conta'}
            </button>
          </form>
        </div>

        <p className="text-xs text-center text-slate-400 mt-4">
          Já tem uma conta?{' '}
          <button onClick={() => navigate('/')} className="text-brand-600 underline">Entrar</button>
        </p>
      </div>
    </div>
  );
}
