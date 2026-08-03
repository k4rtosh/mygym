// Domain helpers — insight cards ("analyze my mistakes"). No DOM.
(function () {
  const DAY_MS = 86400000;
  const RECENT_DAYS = 21;
  const PRIOR_DAYS = 21;
  const IDLE_DAYS = 21;
  const MIN_SESSIONS_FOR_VOLUME = 4;
  const MIN_WEIGHT_POINTS = 3;

  function toDate(dateStr) {
    return new Date(`${dateStr}T12:00:00`);
  }

  function addDays(dateStr, delta) {
    const d = toDate(dateStr);
    d.setDate(d.getDate() + delta);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function daysBetween(a, b) {
    return Math.round((toDate(b) - toDate(a)) / DAY_MS);
  }

  function completedSessions(sessions) {
    return (sessions || []).filter((s) => s && s.completed && s.endTime && s.date);
  }

  function sessionVolume(session) {
    let total = 0;
    for (const ex of session.exercises || []) {
      for (const set of ex.sets || []) {
        const w = Number(set.weight);
        const r = Number(set.reps);
        if (!Number.isFinite(w) || !Number.isFinite(r)) continue;
        if (w < 0 || r < 0) continue;
        total += w * r;
      }
    }
    return total;
  }

  function exerciseNameMap(exercises) {
    const map = new Map();
    for (const e of exercises || []) {
      if (e?.id) map.set(e.id, e);
    }
    return map;
  }

  function categoryRoot(raw) {
    const c = String(raw || '').trim();
    if (!c) return 'Прочее';
    const lower = c.toLowerCase();
    if (lower.includes('груд')) return 'Грудные';
    if (lower.includes('спин')) return 'Спина';
    if (lower.includes('ног') || lower.includes('квадр') || lower.includes('бедр')) return 'Ноги';
    if (lower.includes('плеч') || lower.includes('дельт')) return 'Плечи';
    if (lower.includes('бицеп')) return 'Бицепс';
    if (lower.includes('трицеп')) return 'Трицепс';
    if (lower.includes('пресс') || lower.includes('кор')) return 'Кор';
    if (lower.includes('ягодиц')) return 'Ноги';
    if (lower.includes('икр')) return 'Ноги';
    if (lower.includes('трапец')) return 'Трапеции';
    if (lower.includes('предплеч')) return 'Предплечья';
    if (lower.includes('кардио')) return 'Кардио';
    return c.split(/[\s/·,—-]+/)[0] || c;
  }

  function formatKg(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return '—';
    return Number.isInteger(v) ? String(v) : v.toFixed(1);
  }

  function formatDateShort(dateStr) {
    if (!dateStr || dateStr.length < 10) return dateStr || '';
    return `${dateStr.slice(8, 10)}.${dateStr.slice(5, 7)}`;
  }

  /** Longest + current consecutive miss streaks from sorted missedDates. */
  function missStreaks(missedDates, today) {
    const dates = (missedDates || []).slice().sort();
    if (!dates.length) {
      return { current: 0, longest: 0, dates: [] };
    }

    let longest = 1;
    let run = 1;
    for (let i = 1; i < dates.length; i++) {
      if (daysBetween(dates[i - 1], dates[i]) === 1) {
        run += 1;
        if (run > longest) longest = run;
      } else {
        run = 1;
      }
    }

    let current = 0;
    const yesterday = addDays(today, -1);
    // Current streak: unbroken misses ending yesterday or today (if today missed — rare)
    let cursor = dates.includes(today) ? today : (dates.includes(yesterday) ? yesterday : null);
    if (cursor) {
      const set = new Set(dates);
      while (set.has(cursor)) {
        current += 1;
        cursor = addDays(cursor, -1);
      }
    }

    return { current, longest: Math.max(longest, current), dates };
  }

  function missStreakCard(adherence, today) {
    const missed = adherence?.missedDates || [];
    const planned = adherence?.totals?.planned || 0;
    if (!planned) {
      return {
        id: 'miss-streak',
        severity: 'info',
        title: 'План ещё не задан',
        body: 'Без плана в календаре сложно заметить срывы ритма. Поставь шаблон на ближайшие дни — подсказки станут полезнее.',
        meta: null,
        cta: 'missed'
      };
    }

    const streaks = missStreaks(missed, today);
    if (!missed.length) {
      return {
        id: 'miss-streak',
        severity: 'ok',
        title: 'Пропусков нет',
        body: 'За выбранный период все запланированные дни закрыты тренировкой. Так держать.',
        meta: `План: ${planned}`,
        cta: 'missed'
      };
    }

    if (streaks.current >= 2) {
      return {
        id: 'miss-streak',
        severity: 'warn',
        title: `Серия пропусков: ${streaks.current}`,
        body: `Сейчас подряд пропущено ${streaks.current} ${window.Utils ? Utils.pluralRu(streaks.current, ['день', 'дня', 'дней']) : 'дн.'} по плану. Самая длинная серия за период — ${streaks.longest}. Верни ритм с короткой сессии.`,
        meta: `Всего пропусков: ${missed.length}`,
        cta: 'missed'
      };
    }

    return {
      id: 'miss-streak',
      severity: missed.length >= 3 ? 'warn' : 'info',
      title: `Пропусков: ${missed.length}`,
        body: streaks.longest >= 2
        ? `Самая длинная серия подряд — ${streaks.longest}. Последний пропуск: ${formatDateShort(missed[missed.length - 1])}.`
        : `Пока без длинных серий. Последний пропуск: ${formatDateShort(missed[missed.length - 1])}.`,
      meta: `В плане ${planned} ${window.Utils ? Utils.pluralRu(planned, ['день', 'дня', 'дней']) : 'дн.'}`,
      cta: 'missed'
    };
  }

  function volumeByExercise(sessions, from, to) {
    const map = new Map(); // exerciseId -> { volume, sessions }
    for (const s of sessions) {
      if (s.date < from || s.date > to) continue;
      const seen = new Set();
      for (const ex of s.exercises || []) {
        const id = ex.exerciseId;
        if (!id) continue;
        let vol = 0;
        for (const set of ex.sets || []) {
          const w = Number(set.weight) || 0;
          const r = Number(set.reps) || 0;
          vol += w * r;
        }
        if (vol <= 0) continue;
        if (!map.has(id)) map.set(id, { volume: 0, sessions: 0 });
        const row = map.get(id);
        row.volume += vol;
        if (!seen.has(id)) {
          row.sessions += 1;
          seen.add(id);
        }
      }
    }
    return map;
  }

  function volumeRegressionCard(sessions, exercises, today) {
    const done = completedSessions(sessions);
    if (done.length < MIN_SESSIONS_FOR_VOLUME) {
      return {
        id: 'volume-regression',
        severity: 'info',
        title: 'Мало данных по объёму',
        body: `Нужно хотя бы ${MIN_SESSIONS_FOR_VOLUME} завершённых тренировок, чтобы сравнить недавний объём с предыдущим окном.`,
        meta: `Сейчас: ${done.length}`,
        cta: 'exercises'
      };
    }

    const recentTo = today;
    const recentFrom = addDays(today, -(RECENT_DAYS - 1));
    const priorTo = addDays(recentFrom, -1);
    const priorFrom = addDays(priorTo, -(PRIOR_DAYS - 1));

    const recentTotal = done
      .filter((s) => s.date >= recentFrom && s.date <= recentTo)
      .reduce((sum, s) => sum + sessionVolume(s), 0);
    const priorTotal = done
      .filter((s) => s.date >= priorFrom && s.date <= priorTo)
      .reduce((sum, s) => sum + sessionVolume(s), 0);

    const catalog = exerciseNameMap(exercises);
    const recentMap = volumeByExercise(done, recentFrom, recentTo);
    const priorMap = volumeByExercise(done, priorFrom, priorTo);

    const drops = [];
    for (const [id, prior] of priorMap.entries()) {
      if (prior.volume < 500 || prior.sessions < 2) continue;
      const recent = recentMap.get(id) || { volume: 0, sessions: 0 };
      const ratio = prior.volume > 0 ? recent.volume / prior.volume : 1;
      if (ratio > 0.75) continue;
      const name = catalog.get(id)?.name || 'Упражнение';
      drops.push({
        id,
        name,
        dropPct: Math.round((1 - ratio) * 100),
        prior: prior.volume,
        recent: recent.volume
      });
    }
    drops.sort((a, b) => b.dropPct - a.dropPct);

    const totalRatio = priorTotal > 0 ? recentTotal / priorTotal : 1;
    const top = drops.slice(0, 3);

    if (priorTotal <= 0 && recentTotal <= 0) {
      return {
        id: 'volume-regression',
        severity: 'info',
        title: 'Объём пока не считается',
        body: 'В подходах нет веса×повторов — заполни рабочие подходы, и сравнение появится.',
        meta: null,
        cta: 'exercises'
      };
    }

    if (totalRatio < 0.7 || top.length) {
      const names = top.map((d) => `${d.name} (−${d.dropPct}%)`).join(', ');
      return {
        id: 'volume-regression',
        severity: 'warn',
        title: totalRatio < 0.7 ? 'Объём просел' : 'Есть просадка по упражнениям',
        body: top.length
          ? `За ${RECENT_DAYS} дн. слабее, чем в предыдущие ${PRIOR_DAYS}: ${names}.`
          : `Суммарный тоннаж за ${RECENT_DAYS} дн. ≈ ${Math.round(totalRatio * 100)}% от прошлого окна.`,
        meta: `Недавно ${Math.round(recentTotal)} · ранее ${Math.round(priorTotal)}`,
        cta: 'exercises'
      };
    }

    return {
      id: 'volume-regression',
      severity: 'ok',
      title: 'Объём держится',
      body: `За последние ${RECENT_DAYS} дней тоннаж на уровне прошлого окна (~${Math.round(totalRatio * 100)}%).`,
      meta: `Недавно ${Math.round(recentTotal)} · ранее ${Math.round(priorTotal)}`,
      cta: 'exercises'
    };
  }

  function idleGroupsCard(sessions, exercises, today) {
    const done = completedSessions(sessions);
    const catalog = exerciseNameMap(exercises);
    const lastByGroup = new Map();

    for (const s of done) {
      for (const ex of s.exercises || []) {
        const info = catalog.get(ex.exerciseId);
        if (!info) continue;
        const hasWork = (ex.sets || []).some((set) => (Number(set.reps) || 0) > 0);
        if (!hasWork && !(ex.sets || []).length) continue;
        const group = categoryRoot(info.category);
        const prev = lastByGroup.get(group);
        if (!prev || s.date > prev) lastByGroup.set(group, s.date);
      }
    }

    if (lastByGroup.size < 2) {
      return {
        id: 'idle-groups',
        severity: 'info',
        title: 'Группы мышц: мало истории',
        body: 'Когда в дневнике появятся разные категории упражнений, здесь будет видно, что давно не трогал.',
        meta: null,
        cta: 'exercises'
      };
    }

    const idle = [];
    for (const [group, last] of lastByGroup.entries()) {
      const age = daysBetween(last, today);
      if (age >= IDLE_DAYS) idle.push({ group, last, age });
    }
    idle.sort((a, b) => b.age - a.age);

    if (!idle.length) {
      return {
        id: 'idle-groups',
        severity: 'ok',
        title: 'Группы в работе',
        body: `За ${IDLE_DAYS} дней все знакомые тебе категории мышц хотя бы раз попадали в тренировку.`,
        meta: `Категорий в истории: ${lastByGroup.size}`,
        cta: 'exercises'
      };
    }

    const top = idle.slice(0, 3);
    return {
      id: 'idle-groups',
      severity: 'warn',
      title: 'Давно не было',
      body: top.map((g) => `${g.group} — ${g.age} дн. (с ${formatDateShort(g.last)})`).join('. ') + '.',
      meta: `Порог простоя: ${IDLE_DAYS} дн.`,
      cta: 'exercises'
    };
  }

  function weightVsTrainingCard(sessions, bodyWeightEntries, today) {
    const bw = window.AnalyticsBodyWeight
      ? AnalyticsBodyWeight.summarize(bodyWeightEntries)
      : { points: [], count: 0, delta: null, first: null, last: null };

    if (bw.count < MIN_WEIGHT_POINTS) {
      return {
        id: 'weight-vs-training',
        severity: 'info',
        title: 'Мало замеров веса',
        body: `Нужно ≥${MIN_WEIGHT_POINTS} точки веса (после тренировок), чтобы сравнить динамику тела и частоту зала.`,
        meta: `Замеров: ${bw.count}`,
        cta: 'body-weight'
      };
    }

    const done = completedSessions(sessions);
    const recentFrom = addDays(today, -27);
    const mid = addDays(today, -13);
    const recentSessions = done.filter((s) => s.date >= mid && s.date <= today).length;
    const priorSessions = done.filter((s) => s.date >= recentFrom && s.date < mid).length;

    const recentPoints = bw.points.filter((p) => p.date >= mid);
    const priorPoints = bw.points.filter((p) => p.date >= recentFrom && p.date < mid);
    const recentAvg = recentPoints.length
      ? recentPoints.reduce((s, p) => s + p.weightKg, 0) / recentPoints.length
      : bw.last.weightKg;
    const priorAvg = priorPoints.length
      ? priorPoints.reduce((s, p) => s + p.weightKg, 0) / priorPoints.length
      : bw.first.weightKg;
    const weightDelta = Number((recentAvg - priorAvg).toFixed(1));

    const trainingDown = priorSessions >= 2 && recentSessions <= priorSessions - 2;
    const weightUp = weightDelta >= 0.8;

    if (weightUp && trainingDown) {
      return {
        id: 'weight-vs-training',
        severity: 'warn',
        title: 'Вес растёт, зал реже',
        body: `Средний вес ~+${formatKg(weightDelta)} кг при меньшей частоте тренировок (${recentSessions} vs ${priorSessions} за ~2 нед.). Не диагноз — просто повод сверить питание и план.`,
        meta: `Сейчас ${formatKg(bw.last.weightKg)} кг`,
        cta: 'body-weight'
      };
    }

    if (Math.abs(weightDelta) < 0.4 && recentSessions >= priorSessions) {
      return {
        id: 'weight-vs-training',
        severity: 'ok',
        title: 'Вес и ритм стабильны',
        body: `За месяц вес меняется слабо (${weightDelta >= 0 ? '+' : ''}${formatKg(weightDelta)} кг), частота зала не просела.`,
        meta: `Сейчас ${formatKg(bw.last.weightKg)} кг`,
        cta: 'body-weight'
      };
    }

    return {
      id: 'weight-vs-training',
      severity: 'info',
      title: 'Вес и тренировки',
      body: `Δ веса ≈ ${weightDelta >= 0 ? '+' : ''}${formatKg(weightDelta)} кг · тренировок ${recentSessions} за 2 нед. (было ${priorSessions}). Смотри график веса рядом с объёмом.`,
      meta: `Всего замеров: ${bw.count}`,
      cta: 'body-weight'
    };
  }

  /**
   * @returns {{ cards: Array, hubHint: string, counts: object }}
   */
  function buildCards({
    planned = [],
    sessions = [],
    bodyWeightEntries = [],
    exercises = [],
    from,
    to,
    today
  } = {}) {
    const todayStr = today
      || (typeof Utils !== 'undefined' ? Utils.getTodayStr() : new Date().toISOString().slice(0, 10));

    let fromStr = from;
    let toStr = to || todayStr;
    if (!fromStr) {
      const d = toDate(todayStr);
      d.setMonth(d.getMonth() - 5);
      d.setDate(1);
      fromStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    }

    const adherence = window.AnalyticsAdherence
      ? AnalyticsAdherence.summarize({ planned, sessions, from: fromStr, to: toStr, today: todayStr })
      : { totals: { planned: 0, completed: 0, missed: 0 }, missedDates: [] };

    const cards = [
      missStreakCard(adherence, todayStr),
      volumeRegressionCard(sessions, exercises, todayStr),
      idleGroupsCard(sessions, exercises, todayStr),
      weightVsTrainingCard(sessions, bodyWeightEntries, todayStr)
    ];

    const severityRank = { warn: 0, info: 1, ok: 2 };
    cards.sort((a, b) => (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9));

    const warns = cards.filter((c) => c.severity === 'warn');
    const hubHint = warns.length === 1
      ? warns[0].title
      : warns.length > 1
        ? `Есть ${warns.length} замечания`
        : cards.some((c) => c.severity === 'ok')
          ? 'Пока всё ровно'
          : 'Пока собираем картину';

    return {
      cards,
      hubHint,
      counts: {
        warn: warns.length,
        info: cards.filter((c) => c.severity === 'info').length,
        ok: cards.filter((c) => c.severity === 'ok').length
      }
    };
  }

  window.AnalyticsInsights = {
    missStreaks,
    categoryRoot,
    buildCards,
    // exposed for tests / reuse
    _internal: {
      sessionVolume,
      addDays,
      daysBetween,
      volumeByExercise
    }
  };
})();
