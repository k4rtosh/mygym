// Domain helpers — body weight series (no DOM)
(function () {
  function normalizeEntries(entries) {
    return (entries || [])
      .map((e) => ({
        id: e.id,
        date: e.measured_on || e.measuredOn || e.date,
        weightKg: Number(e.weight_kg != null ? e.weight_kg : e.weightKg),
        source: e.source || null,
        sessionId: e.session_id || e.sessionId || null
      }))
      .filter((e) => e.date && Number.isFinite(e.weightKg) && e.weightKg > 0)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }

  function summarize(entries) {
    const points = normalizeEntries(entries);
    if (!points.length) {
      return {
        points: [],
        count: 0,
        first: null,
        last: null,
        min: null,
        max: null,
        delta: null
      };
    }
    const first = points[0];
    const last = points[points.length - 1];
    let min = points[0];
    let max = points[0];
    for (const p of points) {
      if (p.weightKg < min.weightKg) min = p;
      if (p.weightKg > max.weightKg) max = p;
    }
    return {
      points,
      count: points.length,
      first,
      last,
      min,
      max,
      delta: Number((last.weightKg - first.weightKg).toFixed(2))
    };
  }

  window.AnalyticsBodyWeight = {
    normalizeEntries,
    summarize
  };
})();
