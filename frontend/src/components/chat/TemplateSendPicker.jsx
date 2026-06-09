import React, { useState, useEffect } from 'react';
import { X, FileText, Send, Loader2 } from 'lucide-react';
import api from '../../api';
import { dialog } from '../../utils/dialog';
import { apiErrorMessage, MSG } from '../../utils/messages';

export default function TemplateSendPicker({ chatId, onClose, onSent }) {
  const [campaigns, setCampaigns] = useState([]);
  const [selected, setSelected]   = useState(null);
  const [vars, setVars]           = useState({ evento: '', data: '', horario: '', local: '' });
  const [loading, setLoading]     = useState(true);
  const [sending, setSending]     = useState(false);

  useEffect(() => {
    api.get('/api/campaigns').then((r) => {
      setCampaigns(r.data);
      if (r.data.length) setSelected(r.data[0]);
    }).finally(() => setLoading(false));
  }, []);

  const preview = selected ? String(selected.text || '')
    .replace(/\{nome\}/gi, '[Nome do cliente]')
    .replace(/\{evento\}/gi, vars.evento || '[evento]')
    .replace(/\{data\}/gi, vars.data || '[data]')
    .replace(/\{horario\}/gi, vars.horario || '[horário]')
    .replace(/\{local\}/gi, vars.local || '[local]') : '';

  const send = async () => {
    if (!selected) return;
    setSending(true);
    try {
      await api.post(`/api/chats/${chatId}/send-template`, {
        campaignId: selected.id,
        variables: vars,
      });
      onSent?.();
      onClose();
    } catch (err) {
      dialog.toast.error(apiErrorMessage(err, MSG.templateSendFailed));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <FileText className="w-4 h-4 text-brand-600" />
              Enviar template
            </h2>
            <p className="text-xs text-slate-500">Escolha um template existente e personalize antes de mandar.</p>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="text-center py-8"><Loader2 className="w-6 h-6 text-brand-600 animate-spin mx-auto" /></div>
          ) : !campaigns.length ? (
            <p className="text-sm text-slate-500 text-center py-8">
              Você ainda não tem templates. Vá em <strong>Templates</strong> para criar o primeiro.
            </p>
          ) : (
            <div className="space-y-4">
              {/* Lista */}
              <div>
                <div className="text-xs font-medium text-slate-600 mb-2">Template</div>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {campaigns.map((c) => (
                    <label key={c.id}
                      className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-all ${
                        selected?.id === c.id ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <input type="radio" name="tpl" checked={selected?.id === c.id}
                        onChange={() => setSelected(c)} className="text-brand-600" />
                      <span className="text-sm font-medium text-slate-800">{c.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Variáveis */}
              {selected && /(\{evento\}|\{data\}|\{horario\}|\{local\})/i.test(selected.text || '') && (
                <div>
                  <div className="text-xs font-medium text-slate-600 mb-2">Variáveis</div>
                  <div className="grid grid-cols-2 gap-2">
                    {['evento', 'data', 'horario', 'local'].map((k) => (
                      selected.text?.toLowerCase().includes(`{${k}}`) ? (
                        <input
                          key={k}
                          placeholder={k}
                          value={vars[k]}
                          onChange={(e) => setVars((v) => ({ ...v, [k]: e.target.value }))}
                          className="px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
                        />
                      ) : null
                    ))}
                  </div>
                </div>
              )}

              {/* Preview */}
              {selected && (
                <div>
                  <div className="text-xs font-medium text-slate-600 mb-2">Preview</div>
                  <div className="bg-emerald-50 border border-emerald-100 rounded-xl rounded-br-sm p-3 text-sm text-emerald-900 whitespace-pre-wrap">
                    {preview}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
            Cancelar
          </button>
          <button onClick={send} disabled={!selected || sending}
            className="px-4 py-2 bg-brand-600 text-white text-sm rounded-lg hover:bg-brand-700 disabled:opacity-50 flex items-center gap-2"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Enviar agora
          </button>
        </div>
      </div>
    </div>
  );
}
