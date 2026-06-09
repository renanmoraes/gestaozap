import React, {
  createContext, useCallback, useContext, useEffect, useRef, useState,
} from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

const DialogContext = createContext(null);

let externalApi = null;

export function getDialogApi() {
  return externalApi;
}

function ToastStack({ toasts, onDismiss }) {
  if (!toasts.length) return null;
  return createPortal(
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none px-4 sm:px-0">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-start gap-2.5 px-4 py-3 rounded-xl border shadow-lg text-sm ${
            t.variant === 'error'
              ? 'bg-red-50 border-red-200 text-red-800'
              : t.variant === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-white border-slate-200 text-slate-800'
          }`}
        >
          {t.variant === 'error' ? (
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          ) : t.variant === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          ) : (
            <Info className="w-4 h-4 shrink-0 mt-0.5 text-brand-600" />
          )}
          <span className="flex-1 whitespace-pre-wrap">{t.message}</span>
          <button type="button" onClick={() => onDismiss(t.id)} className="shrink-0 opacity-60 hover:opacity-100">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}

function Modal({ dialog, onResolve }) {
  if (!dialog) return null;

  const { type, title, message, confirmLabel, cancelLabel, danger } = dialog;
  const isConfirm = type === 'confirm';

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-[2px]">
      <div
        className="card w-full max-w-md p-5 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
      >
        <h2 id="dialog-title" className="text-base font-semibold text-slate-900 mb-2">
          {title}
        </h2>
        {message && (
          <p className="text-sm text-slate-600 whitespace-pre-wrap mb-5">{message}</p>
        )}
        <div className="flex gap-2 justify-end">
          {isConfirm && (
            <button
              type="button"
              className="btn-secondary py-2 px-4 text-sm"
              onClick={() => onResolve(false)}
            >
              {cancelLabel || 'Cancelar'}
            </button>
          )}
          <button
            type="button"
            className={`py-2 px-4 text-sm rounded-lg font-medium transition-colors ${
              danger
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'btn-primary'
            }`}
            onClick={() => onResolve(isConfirm ? true : undefined)}
          >
            {confirmLabel || (isConfirm ? 'Confirmar' : 'OK')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function DialogProvider({ children }) {
  const [modal, setModal] = useState(null);
  const [toasts, setToasts] = useState([]);
  const resolveRef = useRef(null);
  const toastId = useRef(0);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message, variant = 'info', duration = 4000) => {
    const id = ++toastId.current;
    setToasts((prev) => [...prev, { id, message, variant }]);
    if (duration > 0) {
      setTimeout(() => dismissToast(id), duration);
    }
  }, [dismissToast]);

  const showAlert = useCallback(({ title, message, confirmLabel }) => new Promise((resolve) => {
    resolveRef.current = resolve;
    setModal({ type: 'alert', title: title || 'Aviso', message, confirmLabel });
  }), []);

  const showConfirm = useCallback(({ title, message, confirmLabel, cancelLabel, danger }) => new Promise((resolve) => {
    resolveRef.current = resolve;
    setModal({
      type: 'confirm', title: title || 'Confirmar', message, confirmLabel, cancelLabel, danger,
    });
  }), []);

  const handleResolve = useCallback((value) => {
    setModal(null);
    const fn = resolveRef.current;
    resolveRef.current = null;
    if (fn) fn(value);
  }, []);

  useEffect(() => {
    externalApi = {
      alert: showAlert,
      confirm: showConfirm,
      toast: {
        success: (msg) => showToast(msg, 'success'),
        error: (msg) => showToast(msg, 'error'),
        info: (msg) => showToast(msg, 'info'),
      },
    };
    return () => { externalApi = null; };
  }, [showAlert, showConfirm, showToast]);

  return (
    <DialogContext.Provider value={externalApi}>
      {children}
      <Modal dialog={modal} onResolve={handleResolve} />
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </DialogContext.Provider>
  );
}

export function useDialog() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialog precisa estar dentro de DialogProvider');
  return ctx;
}
