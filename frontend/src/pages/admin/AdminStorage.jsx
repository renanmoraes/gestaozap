import React, { useState, useEffect } from 'react';
import {
  Cloud, HardDrive, CheckCircle2, XCircle, AlertCircle,
  Save, RefreshCw, ExternalLink, Database, ArrowRight, Loader2,
  Eye, EyeOff, Upload,
} from 'lucide-react';
import api from '../../api';
import { dialog } from '../../utils/dialog';
import { apiErrorMessage, MSG } from '../../utils/messages';

const FIELDS = [
  { key: 'r2_account_id', label: 'Account ID',     placeholder: 'ex: abc123def456',         secret: false },
  { key: 'r2_access_key', label: 'Access Key ID',  placeholder: 'ex: a1b2c3d4e5f6...',      secret: false },
  { key: 'r2_secret_key', label: 'Secret Access Key', placeholder: 'guarde em segredo',     secret: true },
  { key: 'r2_bucket',     label: 'Bucket',         placeholder: 'ex: gestaozap-media',     secret: false },
  { key: 'r2_public_url', label: 'URL pública',    placeholder: 'https://pub-xxx.r2.dev',   secret: false },
];

function StatusBadge({ active, provider }) {
  if (active && provider === 'r2') {
    return (
      <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold px-2.5 py-1 rounded-full">
        <CheckCircle2 className="w-3.5 h-3.5" />
        R2 ativo
      </span>
    );
  }
  if (provider === 'r2') {
    return (
      <span className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-700 border border-amber-200 text-xs font-semibold px-2.5 py-1 rounded-full">
        <AlertCircle className="w-3.5 h-3.5" />
        R2 incompleto
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 bg-slate-50 text-slate-600 border border-slate-200 text-xs font-semibold px-2.5 py-1 rounded-full">
      <HardDrive className="w-3.5 h-3.5" />
      Local
    </span>
  );
}

export default function AdminStorage() {
  const [status, setStatus]   = useState(null);
  const [config, setConfig]   = useState({});
  const [values, setValues]   = useState({ storage_provider: 'local' });
  const [showSecret, setShow] = useState(false);
  const [loading, setLoad]    = useState(true);
  const [saving, setSaving]   = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTest] = useState(null);
  const [backfilling, setBf]  = useState(false);
  const [error, setError]     = useState(null);

  const load = async () => {
    setLoad(true);
    try {
      const [{ data: st }, { data: cfgs }] = await Promise.all([
        api.get('/api/admin/storage'),
        api.get('/api/admin/config'),
      ]);
      setStatus(st);
      const byKey = Object.fromEntries(cfgs.map((c) => [c.key, c.value]));
      setConfig(byKey);
      setValues({
        storage_provider: byKey.storage_provider || 'local',
        r2_account_id:    byKey.r2_account_id    || '',
        r2_access_key:    byKey.r2_access_key    || '',
        r2_secret_key:    byKey.r2_secret_key    || '',
        r2_bucket:        byKey.r2_bucket        || '',
        r2_public_url:    byKey.r2_public_url    || '',
      });
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao carregar');
    } finally {
      setLoad(false);
    }
  };

  useEffect(load, []);

  const saveAll = async () => {
    setSaving(true); setError(null); setTest(null);
    try {
      for (const key of Object.keys(values)) {
        if (config[key] !== values[key]) {
          await api.patch(`/api/admin/config/${key}`, { value: values[key] });
        }
      }
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setTesting(true); setTest(null);
    try {
      // Garante que a config foi salva antes de testar
      await saveAll();
      const { data } = await api.post('/api/admin/storage/test');
      setTest(data);
    } catch (err) {
      setTest({ ok: false, error: err.response?.data?.error || err.message });
    } finally {
      setTesting(false);
    }
  };

  const startBackfill = async () => {
    if (!(await dialog.confirm({ title: 'Migrar para R2', message: MSG.migrateStorage }))) return;
    setBf(true);
    try {
      await api.post('/api/admin/storage/backfill');
      dialog.toast.success(MSG.migrationStarted);
    } catch (err) {
      dialog.toast.error(apiErrorMessage(err, 'Não conseguimos iniciar a migração.'));
    } finally {
      setBf(false);
    }
  };

  if (loading) {
    return (
      <div className="py-12 text-center">
        <RefreshCw className="w-6 h-6 text-brand-600 animate-spin inline-block" />
      </div>
    );
  }

  const dirty = Object.keys(values).some((k) => (config[k] || '') !== (values[k] || ''));

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Armazenamento de mídia</h2>
          <p className="text-sm text-slate-500">
            Onde fotos, áudios e anexos são guardados. Use Cloudflare R2 para escala e durabilidade.
          </p>
        </div>
        <StatusBadge active={status?.active} provider={status?.provider} />
      </div>

      {/* Card de explicação */}
      <div className="card p-5 bg-gradient-to-br from-brand-50 to-emerald-50 border-brand-100">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-white shadow-sm flex items-center justify-center shrink-0">
            <Cloud className="w-6 h-6 text-brand-600" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-slate-900 mb-1">Por que usar o Cloudflare R2?</h3>
            <ul className="text-sm text-slate-700 space-y-1">
              <li>• <strong>Egress grátis</strong> — você não paga banda para servir os arquivos</li>
              <li>• Custa ~R$ 0,08/GB por mês, sem taxa de operação</li>
              <li>• Arquivos sobrevivem a reinício de servidor e deploy</li>
              <li>• Mantém retrocompatibilidade — arquivos locais continuam funcionando</li>
            </ul>
            <a
              href="https://developers.cloudflare.com/r2/get-started/"
              target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium mt-2"
            >
              Como criar a conta R2 <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>

      {error && (
        <div className="card p-3 bg-red-50 border-red-200 text-sm text-red-700 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{error}
        </div>
      )}

      {/* Toggle provider */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">Onde guardar os arquivos</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { id: 'local', label: 'Disco local', desc: 'No próprio servidor (padrão)', icon: HardDrive },
            { id: 'r2',    label: 'Cloudflare R2', desc: 'Storage na nuvem, escalável', icon: Cloud },
          ].map((opt) => (
            <button
              key={opt.id}
              onClick={() => setValues({ ...values, storage_provider: opt.id })}
              className={`p-4 rounded-xl border text-left transition-all ${
                values.storage_provider === opt.id
                  ? 'border-brand-500 bg-brand-50'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  values.storage_provider === opt.id ? 'bg-brand-100 text-brand-600' : 'bg-slate-100 text-slate-500'
                }`}>
                  <opt.icon className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-slate-900">{opt.label}</div>
                  <div className="text-xs text-slate-500">{opt.desc}</div>
                </div>
                {values.storage_provider === opt.id && (
                  <CheckCircle2 className="w-5 h-5 text-brand-600 shrink-0" />
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Form R2 */}
      {values.storage_provider === 'r2' && (
        <div className="card p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 mb-1">Credenciais R2</h3>
            <p className="text-xs text-slate-500">
              Encontre essas chaves no dashboard do Cloudflare em R2 → Manage R2 API Tokens.
            </p>
          </div>
          {FIELDS.map((f) => (
            <div key={f.key}>
              <label className="block text-xs font-medium text-slate-700 mb-1">{f.label}</label>
              <div className="relative">
                <input
                  type={f.secret && !showSecret ? 'password' : 'text'}
                  className="input font-mono text-xs"
                  placeholder={f.placeholder}
                  value={values[f.key] || ''}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                />
                {f.secret && (
                  <button
                    type="button"
                    onClick={() => setShow((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
                  >
                    {showSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>
            </div>
          ))}

          {testResult && (
            <div className={`p-3 rounded-lg text-sm flex items-start gap-2 ${
              testResult.ok
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}>
              {testResult.ok ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <XCircle className="w-4 h-4 shrink-0 mt-0.5" />}
              <div>
                <div className="font-medium">
                  {testResult.ok ? `Conectado com sucesso ao bucket "${testResult.bucket}"` : 'Falha na conexão'}
                </div>
                {testResult.error && <div className="text-xs mt-0.5">{testResult.error}</div>}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <button
              onClick={testConnection}
              disabled={testing || !values.r2_account_id}
              className="btn-secondary text-sm flex items-center gap-1.5"
            >
              {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              Salvar e testar
            </button>
            <button
              onClick={saveAll}
              disabled={saving || !dirty}
              className="btn-primary text-sm flex items-center gap-1.5 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Salvar configuração
            </button>
          </div>
        </div>
      )}

      {/* Botão de salvar quando usando local */}
      {values.storage_provider === 'local' && dirty && (
        <div className="card p-4 flex items-center justify-between">
          <span className="text-sm text-slate-600">Você mudou para storage local.</span>
          <button onClick={saveAll} disabled={saving} className="btn-primary text-sm flex items-center gap-1.5">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Salvar
          </button>
        </div>
      )}

      {/* Backfill — só aparece quando R2 está ativo */}
      {status?.active && status?.provider === 'r2' && (
        <div className="card p-5 border-amber-200 bg-amber-50/30">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
              <Upload className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-slate-900 mb-1">Migrar arquivos antigos</h3>
              <p className="text-xs text-slate-600">
                Move todos os anexos que ainda estão no disco local (mensagens e templates antigos) para o R2.
                Após migrar, o disco local é liberado e as URLs no banco são atualizadas para apontar para o R2.
                <strong> Roda em segundo plano</strong> — acompanhe pelos logs.
              </p>
            </div>
          </div>
          <button
            onClick={startBackfill}
            disabled={backfilling}
            className="text-sm flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {backfilling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
            Iniciar migração agora
          </button>
        </div>
      )}
    </div>
  );
}
