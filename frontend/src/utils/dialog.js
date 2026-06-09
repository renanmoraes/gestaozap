import { getDialogApi } from '../components/ui/DialogProvider';

function requireApi() {
  const api = getDialogApi();
  if (!api) {
    console.warn('[dialog] DialogProvider não montado — fallback para alert nativo');
    return null;
  }
  return api;
}

export const dialog = {
  alert({ title, message, confirmLabel } = {}) {
    const api = requireApi();
    if (!api) {
      window.alert(message || title || '');
      return Promise.resolve();
    }
    return api.alert({ title, message, confirmLabel });
  },

  confirm({ title, message, confirmLabel, cancelLabel, danger } = {}) {
    const api = requireApi();
    if (!api) {
      return Promise.resolve(window.confirm(message || title || ''));
    }
    return api.confirm({ title, message, confirmLabel, cancelLabel, danger });
  },

  toast: {
    success(message) {
      const api = requireApi();
      if (api) api.toast.success(message);
    },
    error(message) {
      const api = requireApi();
      if (api) api.toast.error(message);
    },
    info(message) {
      const api = requireApi();
      if (api) api.toast.info(message);
    },
  },
};
