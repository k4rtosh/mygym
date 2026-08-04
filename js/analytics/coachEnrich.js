// Domain — optional LLM rewrite of coach cards. Same card contract; no chat.
// Falls back to rule pack on any failure / timeout / flag off.
(function () {
  function buildFacts(pack, input = {}) {
    const goal = input.goal || pack.goal || null;
    const cards = (pack.cards || []).map((c) => ({
      id: c.id,
      severity: c.severity,
      kind: c.kind || null,
      title: c.title,
      body: c.body
    }));
    return {
      locale: 'ru',
      version: window.MYGYM_CONFIG?.APP_VERSION || null,
      goal: goal
        ? {
          intent: goal.intent,
          mode: goal.mode,
          pauseReason: goal.pauseReason || null,
          focusExerciseId: goal.focusExerciseId || null,
          targetFrequency: goal.targetFrequency ?? null
        }
        : null,
      hubHint: pack.hubHint || null,
      cardCount: cards.length,
      cards
    };
  }

  function mergeEnrichment(pack, data) {
    if (!data || !Array.isArray(data.cards)) return pack;
    const byId = new Map();
    for (const row of data.cards) {
      if (!row || !row.id) continue;
      byId.set(String(row.id), row);
    }
    if (!byId.size) return pack;

    return {
      ...pack,
      enriched: true,
      cards: (pack.cards || []).map((c) => {
        const e = byId.get(c.id);
        if (!e) return c;
        const title = typeof e.title === 'string' ? e.title.trim() : '';
        const body = typeof e.body === 'string' ? e.body.trim() : '';
        if (!title && !body) return c;
        return {
          ...c,
          title: title || c.title,
          body: body || c.body
        };
      })
    };
  }

  function resolveUrl(cfg) {
    if (cfg.COACH_LLM_URL) return String(cfg.COACH_LLM_URL);
    if (cfg.SUPABASE_URL) return `${cfg.SUPABASE_URL.replace(/\/$/, '')}/functions/v1/coach-enrich`;
    return '';
  }

  /**
   * @returns {Promise<object>} pack (possibly enriched)
   */
  async function maybeEnrich(pack, input = {}) {
    const cfg = window.MYGYM_CONFIG || {};
    if (!cfg.COACH_LLM_ENABLED || !pack?.cards?.length) return pack;

    const url = resolveUrl(cfg);
    if (!url) return pack;

    const timeoutMs = Number(cfg.COACH_LLM_TIMEOUT_MS) || 2500;
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller
      ? setTimeout(() => controller.abort(), timeoutMs)
      : null;

    try {
      let token = cfg.SUPABASE_ANON_KEY || '';
      try {
        const client = window.supabaseClient || window.Api?.client?.();
        if (client?.auth?.getSession) {
          const { data } = await client.auth.getSession();
          if (data?.session?.access_token) token = data.session.access_token;
        }
      } catch (_) { /* anon fallback */ }

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          apikey: cfg.SUPABASE_ANON_KEY || ''
        },
        body: JSON.stringify({
          facts: buildFacts(pack, input),
          cards: (pack.cards || []).map((c) => ({
            id: c.id,
            title: c.title,
            body: c.body,
            severity: c.severity,
            kind: c.kind || null
          }))
        }),
        signal: controller?.signal
      });
      if (!res.ok) return pack;
      const data = await res.json();
      return mergeEnrichment(pack, data);
    } catch (_) {
      return pack;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  window.CoachEnrich = {
    buildFacts,
    mergeEnrichment,
    maybeEnrich
  };
})();
