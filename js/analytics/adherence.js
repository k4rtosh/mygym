// Domain helpers — plan adherence / missed workouts (no DOM)
(function () {
  function dayStatus(dateStr, plannedMap, completedMap, todayStr) {
    const hasCompleted = completedMap.has(dateStr);
    const hasPlan = plannedMap.has(dateStr);
    if (hasCompleted) return 'completed';
    if (hasPlan && dateStr < todayStr) return 'missed';
    if (hasPlan && dateStr >= todayStr) return 'planned';
    return 'empty';
  }

  function buildMaps(planned, sessions) {
    const plannedMap = new Map();
    for (const p of planned || []) {
      const d = p.workout_date || p.date;
      if (d) plannedMap.set(d, p);
    }
    const completedMap = new Map();
    for (const s of sessions || []) {
      const d = s.date || s.workout_date;
      if (!d) continue;
      if (s.completed) completedMap.set(d, s);
    }
    return { plannedMap, completedMap };
  }

  function eachDate(fromStr, toStr, fn) {
    const cur = new Date(fromStr + 'T12:00:00');
    const end = new Date(toStr + 'T12:00:00');
    while (cur <= end) {
      const y = cur.getFullYear();
      const m = String(cur.getMonth() + 1).padStart(2, '0');
      const d = String(cur.getDate()).padStart(2, '0');
      fn(`${y}-${m}-${d}`);
      cur.setDate(cur.getDate() + 1);
    }
  }

  function monthKey(dateStr) {
    return dateStr.slice(0, 7);
  }

  /**
   * Summarize adherence between from..to (inclusive).
   * Missed = planned day in the past without a completed session.
   */
  function summarize({ planned, sessions, from, to, today }) {
    const todayStr = today
      || (typeof Utils !== 'undefined' ? Utils.getTodayStr() : new Date().toISOString().slice(0, 10));
    const { plannedMap, completedMap } = buildMaps(planned, sessions);

    const totals = { planned: 0, completed: 0, missed: 0 };
    const missedDates = [];
    const monthBucket = new Map();

    eachDate(from, to, (dateStr) => {
      const status = dayStatus(dateStr, plannedMap, completedMap, todayStr);
      const key = monthKey(dateStr);
      if (!monthBucket.has(key)) {
        monthBucket.set(key, { month: key, planned: 0, completed: 0, missed: 0 });
      }
      const bucket = monthBucket.get(key);

      if (status === 'completed') {
        totals.completed += 1;
        bucket.completed += 1;
        if (plannedMap.has(dateStr)) {
          totals.planned += 1;
          bucket.planned += 1;
        }
      } else if (status === 'missed') {
        totals.missed += 1;
        totals.planned += 1;
        bucket.missed += 1;
        bucket.planned += 1;
        missedDates.push(dateStr);
      }
      // future "planned" days are ignored in adherence totals
    });

    const byMonth = Array.from(monthBucket.values()).sort((a, b) => (a.month < b.month ? -1 : 1));
    return { totals, missedDates, byMonth, today: todayStr };
  }

  window.AnalyticsAdherence = {
    dayStatus,
    buildMaps,
    summarize
  };
})();
