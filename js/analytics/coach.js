// Domain — rule-based coach on top of AnalyticsInsights. No DOM, no LLM.
(function () {
  const DAY_MS = 86400000;
  const FREQ_WINDOW_DAYS = 28;
  const FREQ_TARGET = 3; // sessions / week aspiration
  const PLATEAU_APPEARANCES = 4;

  function todayFallback() {
    return typeof Utils !== 'undefined'
      ? Utils.getTodayStr()
      : new Date().toISOString().slice(0, 10);
  }

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

  function completedSessions(sessions) {
    return (sessions || []).filter((s) => s && s.completed && s.endTime && s.date);
  }

  function plural(n, forms) {
    if (window.Utils?.pluralRu) return Utils.pluralRu(n, forms);
    return forms[n === 1 ? 0 : 1];
  }

  function maxSetWeight(ex) {
    let max = 0;
    for (const set of ex.sets || []) {
      const w = Number(set.weight);
      if (Number.isFinite(w) && w > max) max = w;
    }
    return max;
  }

  function frequencyCard(sessions, today) {
    const done = completedSessions(sessions);
    const from = addDays(today, -(FREQ_WINDOW_DAYS - 1));
    const recent = done.filter((s) => s.date >= from && s.date <= today);
    const weeks = FREQ_WINDOW_DAYS / 7;
    const perWeek = recent.length / weeks;
    const rounded = Math.round(perWeek * 10) / 10;

    if (done.length < 3) {
      return {
        id: 'coach-frequency',
        kind: 'coach',
        severity: 'info',
        title: 'Набираем ритм',
        body: 'Коучу нужно чуть больше завершённых тренировок, чтобы оценить частоту. Цель на старте — около 3 сессий в неделю.',
        meta: `Готово: ${done.length}`,
        cta: 'templates'
      };
    }

    if (perWeek < FREQ_TARGET - 0.6) {
      return {
        id: 'coach-frequency',
        kind: 'coach',
        severity: 'warn',
        title: 'Частота ниже цели',
        body: `За ${FREQ_WINDOW_DAYS} дн. вышло ~${rounded} трен./нед. при ориентире ${FREQ_TARGET}. Лучше короткая сессия, чем ещё один пропуск.`,
        meta: `${recent.length} ${plural(recent.length, ['тренировка', 'тренировки', 'тренировок'])}`,
        cta: 'templates'
      };
    }

    if (perWeek >= FREQ_TARGET + 1.2) {
      return {
        id: 'coach-frequency',
        kind: 'coach',
        severity: 'info',
        title: 'Плотный график',
        body: `~${rounded} трен./нед. — выше обычной цели. Следи за сном и лёгкими днями, чтобы не выгореть.`,
        meta: `${recent.length} за ${FREQ_WINDOW_DAYS} дн.`,
        cta: null
      };
    }

    return {
      id: 'coach-frequency',
      kind: 'coach',
      severity: 'ok',
      title: 'Ритм в норме',
      body: `Около ${rounded} трен./нед. за последний месяц — рядом с ориентиром ${FREQ_TARGET}.`,
      meta: `${recent.length} за ${FREQ_WINDOW_DAYS} дн.`,
      cta: null
    };
  }

  function plateauCard(sessions, exercises) {
    const done = completedSessions(sessions).slice().sort((a, b) => a.date.localeCompare(b.date));
    const catalog = new Map((exercises || []).map((e) => [e.id, e]));
    const byEx = new Map(); // id -> [{date, maxW}]

    for (const s of done) {
      for (const ex of s.exercises || []) {
        const id = ex.exerciseId;
        if (!id) continue;
        const maxW = maxSetWeight(ex);
        if (maxW <= 0) continue;
        if (!byEx.has(id)) byEx.set(id, []);
        byEx.get(id).push({ date: s.date, maxW });
      }
    }

    const plateaus = [];
    for (const [id, rows] of byEx.entries()) {
      if (rows.length < PLATEAU_APPEARANCES) continue;
      const tail = rows.slice(-PLATEAU_APPEARANCES);
      const first = tail[0].maxW;
      const flat = tail.every((r) => Math.abs(r.maxW - first) < 0.05);
      if (!flat) continue;
      const name = catalog.get(id)?.name || 'Упражнение';
      plateaus.push({
        id,
        name,
        weight: first,
        days: Math.round((toDate(tail[tail.length - 1].date) - toDate(tail[0].date)) / DAY_MS)
      });
    }
    plateaus.sort((a, b) => b.days - a.days);

    if (!plateaus.length) {
      return {
        id: 'coach-plateau',
        kind: 'coach',
        severity: 'ok',
        title: 'Веса двигаются',
        body: 'По основным упражнениям максимум в подходах не застрял на одном месте — прогрессия или вариация есть.',
        meta: null,
        cta: 'exercises'
      };
    }

    const top = plateaus.slice(0, 2);
    return {
      id: 'coach-plateau',
      kind: 'coach',
      severity: 'info',
      title: 'Плато по весу',
      body: top
        .map((p) => `${p.name}: ${p.weight} кг без роста (${PLATEAU_APPEARANCES} визита)`)
        .join('. ') + '. Попробуй +1–2 повтора или микрошаг веса.',
      meta: `Найдено: ${plateaus.length}`,
      cta: 'exercises'
    };
  }

  function nextMoveCard(insightCards, sessions, templates, planned, today) {
    const warns = (insightCards || []).filter((c) => c.severity === 'warn');
    const done = completedSessions(sessions);
    const last = done.slice().sort((a, b) => b.date.localeCompare(a.date))[0];

    const upcoming = (planned || [])
      .map((p) => p.workout_date || p.date)
      .filter((d) => d && d >= today)
      .sort();

    if (warns.some((c) => c.id === 'miss-streak')) {
      return {
        id: 'coach-next',
        kind: 'coach',
        severity: 'warn',
        title: 'Следующий шаг',
        body: 'Сейчас важнее закрыть ритм, чем ставить рекорд. Возьми короткий шаблон (или одну группу) и отметь день в календаре.',
        meta: upcoming[0] ? `План: ${upcoming[0].slice(8, 10)}.${upcoming[0].slice(5, 7)}` : null,
        cta: 'templates'
      };
    }

    if (warns.some((c) => c.id === 'idle-groups')) {
      const idle = warns.find((c) => c.id === 'idle-groups');
      return {
        id: 'coach-next',
        kind: 'coach',
        severity: 'warn',
        title: 'Следующий шаг',
        body: idle?.body
          ? `Верни «остывшие» группы в план. ${idle.body}`
          : 'В истории есть группы мышц, которые давно не тренировал — добавь их в ближайший шаблон.',
        meta: null,
        cta: 'templates'
      };
    }

    if (warns.some((c) => c.id === 'volume-regression')) {
      return {
        id: 'coach-next',
        kind: 'coach',
        severity: 'info',
        title: 'Следующий шаг',
        body: 'Объём просел — на ближайшей сессии верни рабочие подходы к обычному весу, без гонки за новым максимумом.',
        meta: last ? `Последняя: ${last.templateName || last.date}` : null,
        cta: 'exercises'
      };
    }

    const tplCount = (templates || []).length;
    if (!tplCount) {
      return {
        id: 'coach-next',
        kind: 'coach',
        severity: 'info',
        title: 'Следующий шаг',
        body: 'Собери первый шаблон под день тренировки — коучу будет на что опираться.',
        meta: null,
        cta: 'templates'
      };
    }

    return {
      id: 'coach-next',
      kind: 'coach',
      severity: 'ok',
      title: 'Следующий шаг',
      body: upcoming[0]
        ? 'По плану всё ясно — просто приди и закрой день. Если тяжело, урежь до 2–3 упражнений.'
        : 'Картина ровная. Запланируй ближайшую тренировку в календаре, чтобы не потерять ритм.',
      meta: last ? `Последняя: ${last.templateName || last.date}` : null,
      cta: upcoming[0] ? null : 'templates'
    };
  }

  function briefCard(allCards) {
    const warns = allCards.filter((c) => c.severity === 'warn');
    const infos = allCards.filter((c) => c.severity === 'info');

    if (warns.length) {
      const top = warns[0];
      return {
        id: 'coach-brief',
        kind: 'coach',
        severity: 'warn',
        title: 'Фокус коуча',
        body: warns.length === 1
          ? `Главное сейчас: «${top.title}». Остальное подождёт.`
          : `Сначала разбери «${top.title}» — всего замечаний: ${warns.length}. Ниже детали и конкретный следующий шаг.`,
        meta: 'Правила · без ИИ',
        cta: top.cta || null
      };
    }

    if (infos.length && !allCards.some((c) => c.severity === 'ok')) {
      return {
        id: 'coach-brief',
        kind: 'coach',
        severity: 'info',
        title: 'Фокус коуча',
        body: 'Критических замечаний нет — копим данные. Смотри заметки ниже и держи регулярность.',
        meta: 'Правила · без ИИ',
        cta: null
      };
    }

    return {
      id: 'coach-brief',
      kind: 'coach',
      severity: 'ok',
      title: 'Фокус коуча',
      body: 'По дневнику всё ровно. Держи план и чуть двигай рабочие веса — коуч подсветит, если что-то поедет.',
      meta: 'Правила · без ИИ',
      cta: null
    };
  }

  /**
   * @returns {{ cards: Array, hubHint: string, counts: object, insights: object|null }}
   */
  function buildPack(input = {}) {
    const today = input.today || todayFallback();
    const insights = window.AnalyticsInsights?.buildCards
      ? AnalyticsInsights.buildCards({ ...input, today })
      : { cards: [], hubHint: '', counts: { warn: 0, info: 0, ok: 0 } };

    const insightCards = (insights.cards || []).map((c) => ({ ...c, kind: c.kind || 'insight' }));

    const coachExtras = [
      frequencyCard(input.sessions, today),
      plateauCard(input.sessions, input.exercises),
      nextMoveCard(insightCards, input.sessions, input.templates, input.planned, today)
    ];

    const withoutBrief = [...insightCards, ...coachExtras];
    const brief = briefCard(withoutBrief);
    const cards = [brief, ...withoutBrief];

    const severityRank = { warn: 0, info: 1, ok: 2 };
    // Keep brief first; sort the rest
    const rest = cards.slice(1).sort((a, b) => {
      const sr = (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9);
      if (sr !== 0) return sr;
      if (a.kind === 'coach' && b.kind !== 'coach') return -1;
      if (b.kind === 'coach' && a.kind !== 'coach') return 1;
      return 0;
    });
    const ordered = [brief, ...rest];

    const warns = ordered.filter((c) => c.severity === 'warn');
    const hubHint = warns.length === 1
      ? warns[0].title
      : warns.length > 1
        ? `Коуч: ${warns.length} ${plural(warns.length, ['замечание', 'замечания', 'замечаний'])}`
        : ordered.some((c) => c.severity === 'ok')
          ? 'Коуч: всё ровно'
          : 'Коуч собирает картину';

    return {
      cards: ordered,
      hubHint,
      counts: {
        warn: warns.length,
        info: ordered.filter((c) => c.severity === 'info').length,
        ok: ordered.filter((c) => c.severity === 'ok').length
      },
      insights
    };
  }

  window.AnalyticsCoach = {
    buildPack,
    _internal: {
      frequencyCard,
      plateauCard,
      nextMoveCard,
      briefCard
    }
  };
})();
