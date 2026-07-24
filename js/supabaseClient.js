// Supabase client (loaded after CDN + config.js)
(function () {
  const cfg = window.MYGYM_CONFIG;
  if (!cfg || !window.supabase) {
    console.error('Supabase SDK or config missing');
    return;
  }
  window.supabaseClient = window.supabase.createClient(
    cfg.SUPABASE_URL,
    cfg.SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    }
  );
})();
