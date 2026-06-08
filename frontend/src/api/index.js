import axios from 'axios';

const baseURL = import.meta.env.VITE_API_URL ?? '';

const api = axios.create({ baseURL });

// Injeta token de autenticação em todas as requisições.
// Detecta contexto admin (rotas /api/admin/* ou subdomínio admin/?admin=1)
// e usa o token correto.
api.interceptors.request.use((config) => {
  const isAdminRequest = (config.url || '').includes('/api/admin/');
  const isAdminContext = window.location.hostname.split('.')[0] === 'admin'
    || new URLSearchParams(window.location.search).get('admin') === '1';

  const tokenKey = (isAdminRequest || isAdminContext)
    ? 'gestaozap_admin_token'
    : 'gestaozap_token';

  const token = localStorage.getItem(tokenKey);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Trata erros de autenticação globalmente
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const code = error.response?.data?.code;

    if (status === 401) {
      const isAdminError = code === 'ADMIN_UNAUTHORIZED' || code === 'ADMIN_SESSION_EXPIRED';

      if (isAdminError) {
        localStorage.removeItem('gestaozap_admin_token');
        // O AdminApp detecta a falta do token e mostra o AdminLogin
        if (!window.location.pathname.includes('/login')) {
          window.location.reload();
        }
      } else {
        localStorage.removeItem('gestaozap_token');
        localStorage.removeItem('gestaozap_tenant_id');
        if (!window.location.pathname.includes('/login')) {
          window.location.href = '/login';
        }
      }
    }

    // 423 (WA_DISCONNECTED) é tratado por WaGate no componente — não redireciona
    return Promise.reject(error);
  },
);

export default api;
