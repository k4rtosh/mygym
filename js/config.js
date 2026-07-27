// Supabase project config (anon / publishable key only — safe for client)
(function () {
  function detectBasePath() {
    try {
      if (window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform()) {
        return '';
      }
    } catch (_) { /* ignore */ }

    const path = window.location.pathname || '';
    if (path === '/mygym' || path.startsWith('/mygym/')) return '/mygym';
    return '';
  }

  const base = detectBasePath();

  window.MYGYM_CONFIG = {
    SUPABASE_URL: 'https://gkcjwunfgzhidqyyhhik.supabase.co',
    SUPABASE_ANON_KEY: 'sb_publishable_7il2t8elu3sEsOyx8b7x5Q_bVZWkJcj',
    APP_VERSION: '2.5.3',
    BASE_PATH: base,
    IS_NATIVE: !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform())
  };

  /** Join BASE_PATH with a root-relative path like "/js/x.js" or "js/x.js" */
  window.MYGYM_CONFIG.url = function url(path) {
    const p = String(path || '');
    if (/^https?:\/\//i.test(p)) return p;
    const cleaned = p.replace(/^\//, '');
    if (!base) return `/${cleaned}`.replace(/\/{2,}/g, '/');
    return `${base}/${cleaned}`;
  };
})();
