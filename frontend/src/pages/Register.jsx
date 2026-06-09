import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Zap, Tag, AlertCircle, CheckCircle2, ArrowRight, Loader2, Clock } from 'lucide-react';
import api from '../api';
import { formatPhone, maskPhoneInput } from '../utils/phone';

// Slugify espelhando o backend (apenas preview informativo).
function slugify(name) {
  const s = String(name || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63)
    .replace(/-+$/g, '');
  return s || 'cliente';
}

// Máscara progressiva de documento conforme o tipo.
function maskDocument(value, type) {
  const d = String(value || '').replace(/\D/g, '').slice(0, type === 'cpf' ? 11 : 14);
  if (type === 'cpf') {
    return d
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1-$2');
  }
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

export default function Register() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const refCode = params.get('ref')?.toUpperCase() || '';

  const [affiliate, setAffiliate] = useState(null);
  const [loadingRef, setLoadingRef] = useState(Boolean(refCode));
  const [refError, setRefError] = useState(null);

  const [form, setForm] = useState({
    documentType: 'cnpj',
    document: '',
    name: '',
    registeredPhone: '',
    email: '',
    password: '',
    affiliateCode: refCode,
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [done, setDone] = useState(false);

  // Valida o código de afiliado para exibir o banner de indicação/desconto.
  useEffect(() => {
    const code = (form.affiliateCode || '').toUpperCase();
    if (!code) { setAffiliate(null); setRefError(null); return; }
    setLoadingRef(true);
    setRefError(null);
    api.get(`/api/affiliates/validate/${code}`)
      .then(({ data }) => setAffiliate(data.affiliate))
      .catch((err) => {
        setAffiliate(null);
        setRefError(err.response?.data?.error || 'Código inválido');
      })
      .finally(() => setLoadingRef(false));
  }, [form.affiliateCode]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true); setSubmitError(null);
    try {
      await api.post('/api/signup', {
        documentType: form.documentType,
        document: form.document,
        name: form.name,
        whatsapp: form.registeredPhone,
        email: form.email,
        password: form.password,
        affiliateCode: form.affiliateCode.toUpperCase() || null,
      });
      setDone(true);
    } catch (err) {
      setSubmitError(err.response?.data?.error || 'Erro ao criar conta. Tente novamente.');
    } finally { setSubmitting(false); }
  };

  if (done) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="card p-8 max-w-md text-center shadow-sm">
          <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
            <Clock className="w-7 h-7 text-amber-600" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">Cadastro enviado!</h1>
          <p className="text-sm text-slate-500 mb-5">
            Sua conta está <strong>em análise</strong>. Assim que for aprovada, você receberá um
            email e seu período de teste grátis começa — aí é só entrar com o email e a senha
            que você acabou de cadastrar.
          </p>
          <button
            onClick={() => navigate('/')}
            className="btn-primary flex items-center justify-center gap-2 w-full"
          >
            Voltar ao início <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  const slugPreview = slugify(form.name);
  const canSubmit = form.documentType && form.document && form.name
    && form.registeredPhone && form.email && form.password.length >= 8;

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
                Código <strong>{affiliate.code}</strong> — {affiliate.discountPct}% de desconto no primeiro mês
              </div>
            </div>
          </div>
        )}

        <div className="card p-7 shadow-sm">
          <h1 className="text-lg font-bold text-slate-900 mb-1">Criar minha conta</h1>
          <p className="text-sm text-slate-500 mb-5">
            Faça o pré-cadastro. Após a aprovação, seu teste grátis começa.
          </p>

          {submitError && (
            <div className="flex gap-2 p-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm mb-4">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{submitError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Tipo de pessoa */}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">Tipo de cadastro</label>
              <div className="grid grid-cols-2 gap-2">
                {[['cnpj', 'Pessoa Jurídica (CNPJ)'], ['cpf', 'Pessoa Física (CPF)']].map(([val, label]) => (
                  <button
                    type="button"
                    key={val}
                    onClick={() => setForm({ ...form, documentType: val, document: '' })}
                    className={`p-2.5 rounded-lg border text-sm font-medium transition-all ${
                      form.documentType === val
                        ? 'border-brand-500 bg-brand-50 text-brand-800'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Documento */}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                {form.documentType === 'cpf' ? 'CPF' : 'CNPJ'}
              </label>
              <input
                className="input font-mono"
                inputMode="numeric"
                placeholder={form.documentType === 'cpf' ? '000.000.000-00' : '00.000.000/0000-00'}
                value={maskDocument(form.document, form.documentType)}
                onChange={(e) => setForm({ ...form, document: e.target.value })}
                required
              />
            </div>

            {/* Nome */}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                {form.documentType === 'cpf' ? 'Nome completo' : 'Nome da empresa'}
              </label>
              <input
                className="input"
                placeholder={form.documentType === 'cpf' ? 'Maria Silva' : 'Farmácia Vida Plena'}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
              {form.name && (
                <p className="text-xs text-slate-400 mt-1">
                  Seu endereço será <code className="bg-slate-100 px-1.5 py-0.5 rounded">{slugPreview}.gestaozap.digital</code>
                </p>
              )}
            </div>

            {/* WhatsApp */}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">Número WhatsApp</label>
              <input
                className="input font-mono"
                placeholder="(11) 98765-4321"
                value={formatPhone(form.registeredPhone)}
                onChange={(e) => setForm({ ...form, registeredPhone: maskPhoneInput(e.target.value) })}
                required
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">Email de acesso</label>
              <input
                type="email"
                className="input"
                placeholder="seu@email.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>

            {/* Senha */}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">Senha</label>
              <input
                type="password"
                className="input"
                placeholder="Mínimo 8 caracteres"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
                minLength={8}
              />
            </div>

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

            <button
              type="submit"
              disabled={submitting || !canSubmit}
              className="btn-primary w-full flex items-center justify-center gap-2 py-3 mt-2 disabled:opacity-50"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              {submitting ? 'Enviando cadastro…' : 'Criar minha conta'}
            </button>

            <p className="text-xs text-center text-slate-400 leading-relaxed">
              Ao criar a conta, você concorda com os{' '}
              <a href="/termos" target="_blank" rel="noopener noreferrer" className="text-brand-600 underline">Termos de Uso</a>{' '}
              e a{' '}
              <a href="/privacidade" target="_blank" rel="noopener noreferrer" className="text-brand-600 underline">Política de Privacidade</a>.
            </p>
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
