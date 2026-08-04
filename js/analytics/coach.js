// Domain — rule-based coach on top of AnalyticsInsights. No DOM, no LLM.
(function () {
  const DAY_MS = 86400000;
  const FREQ_WINDOW_DAYS = 28;
  const FREQ_TARGET_DEFAULT = 3;
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

  function resolveGoal(raw, today) {
    const g = window.CoachGoal?.normalize ? CoachGoal.normalize(raw) : raw;
    if (!g) return { goal: null, mode: 'normal', freq: FREQ_TARGET_DEFAULT };
    const mode = window.CoachGoal?.effectiveMode
      ? CoachGoal.effectiveMode(g, today)
      : (g.mode || 'normal');
    const freq = window.CoachGoal?.effectiveFrequency
      ? CoachGoal.effectiveFrequency(g, FREQ_TARGET_DEFAULT)
      : (g.targetFrequency ?? FREQ_TARGET_DEFAULT);
    return { goal: g, mode, freq };
  }

  function frequencyCard(sessions, today, ctx) {
    const done = completedSessions(sessions);
    const from = addDays(today, -(FREQ_WINDOW_DAYS - 1));
    const recent = done.filter((s) => s.date >= from && s.date <= today);
    const weeks = FREQ_WINDOW_DAYS / 7;
    const perWeek = recent.length / weeks;
    const rounded = Math.round(perWeek * 10) / 10;
    const target = ctx.freq;
    const softMode = ctx.mode === 'travel' || ctx.mode === 'injury';

    if (done.length < 3) {
      return {
        id: 'coach-frequency',
        kind: 'coach',
        severity: 'info',
        title: 'Набираем ритм',
        body: softMode
          ? `В режиме поддержки ориентир ~${target} трен./нед. Нужно чуть больше завершённых сессий в дневнике.`
          : `Коучу нужно чуть больше завершённых тренировок. Ориентир по цели — около ${target} сессий в неделю.`,
        meta: `Готово: ${done.length}`,
        cta: 'templates'
      };
    }

    if (perWeek < target - 0.6) {
      return {
        id: 'coach-frequency',
        kind: 'coach',
        severity: softMode ? 'info' : 'warn',
        title: softMode ? 'Частота ниже поддержки' : 'Частота ниже цели',
        body: softMode
          ? `За ${FREQ_WINDOW_DAYS} дн. ~${rounded} трен./нед. при мягком ориентире ${target}. Даже короткая домашняя сессия лучше нуля.`
          : `За ${FREQ_WINDOW_DAYS} дн. вышло ~${rounded} трен./нед. при ориентире ${target}. Лучше короткая сессия, чем ещё один пропуск.`,
        meta: `${recent.length} ${plural(recent.length, ['тренировка', 'тренировки', 'тренировок'])}`,
        cta: 'templates'
      };
    }

    if (!softMode && perWeek >= target + 1.2) {
      return {
        id: 'coach-frequency',
        kind: 'coach',
        severity: 'info',
        title: 'Плотный график',
        body: `~${rounded} трен./нед. — выше ориентира ${target}. Следи за сном и лёгкими днями, чтобы не выгореть.`,
        meta: `${recent.length} за ${FREQ_WINDOW_DAYS} дн.`,
        cta: null
      };
    }

    return {
      id: 'coach-frequency',
      kind: 'coach',
      severity: 'ok',
      title: 'Ритм в норме',
      body: `Около ${rounded} трен./нед. — рядом с ориентиром ${target}${softMode ? ' (режим поддержки)' : ''}.`,
      meta: `${recent.length} за ${FREQ_WINDOW_DAYS} дн.`,
      cta: null
    };
  }

  function plateauCard(sessions, exercises, ctx) {
    const done = completedSessions(sessions).slice().sort((a, b) => a.date.localeCompare(b.date));
    const catalog = new Map((exercises || []).map((e) => [e.id, e]));
    const byEx = new Map();
    const focusId = ctx.goal?.focusExerciseId || null;
    const softMode = ctx.mode === 'travel' || ctx.mode === 'injury';

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
        days: Math.round((toDate(tail[tail.length - 1].date) - toDate(tail[0].date)) / DAY_MS),
        isFocus: focusId === id
      });
    }
    plateaus.sort((a, b) => {
      if (a.isFocus !== b.isFocus) return a.isFocus ? -1 : 1;
      return b.days - a.days;
    });

    if (softMode) {
      return {
        id: 'coach-plateau',
        kind: 'coach',
        severity: 'info',
        title: 'Сила подождёт',
        body: focusId && catalog.get(focusId)
          ? `Сейчас режим поддержки — не гонись за максимумом в «${catalog.get(focusId).name}». Вернёшься к прогрессии после периода.`
          : 'Сейчас режим поддержки — плато по рабочим весам не приоритет. Держи движение и объём по самочувствию.',
        meta: null,
        cta: null
      };
    }

    if (!plateaus.length) {
      return {
        id: 'coach-plateau',
        kind: 'coach',
        severity: 'ok',
        title: 'Веса двигаются',
        body: focusId && catalog.get(focusId)
          ? `По фокусу «${catalog.get(focusId).name}» и другим упражнениям максимум не застрял — прогрессия или вариация есть.`
          : 'По основным упражнениям максимум в подходах не застрял на одном месте — прогрессия или вариация есть.',
        meta: null,
        cta: 'exercises'
      };
    }

    const focusHit = plateaus.find((p) => p.isFocus);
    if (focusHit && (ctx.goal?.intent === 'strength' || ctx.goal?.intent === 'hypertrophy')) {
      return {
        id: 'coach-plateau',
        kind: 'coach',
        severity: 'warn',
        title: 'Плато на фокус-упражнении',
        body: `${focusHit.name}: ${focusHit.weight} кг без роста (${PLATEAU_APPEARANCES} визита). Для цели по силе это главный сигнал — микрошаг веса или +1–2 повтора.`,
        meta: `Фокус цели`,
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

  function nextMoveCard(insightCards, sessions, templates, planned, today, ctx) {
    const warns = (insightCards || []).filter((c) => c.severity === 'warn');
    const done = completedSessions(sessions);
    const last = done.slice().sort((a, b) => b.date.localeCompare(a.date))[0];
    const softMode = ctx.mode === 'travel' || ctx.mode === 'injury';
    const focusName = ctx.goal?.focusExerciseId
      ? (window._coachFocusName || null)
      : null;

    const upcoming = (planned || [])
      .map((p) => p.workout_date || p.date)
      .filter((d) => d && d >= today)
      .sort();

    if (softMode) {
      const until = ctx.goal?.periodTo
        ? ` до ${ctx.goal.periodTo.slice(8, 10)}.${ctx.goal.periodTo.slice(5, 7)}`
        : '';
      return {
        id: 'coach-next',
        kind: 'coach',
        severity: 'info',
        title: 'Следующий шаг',
        body: ctx.mode === 'travel'
          ? `Командировка/без зала${until}: короткие сессии с собственным весом или что есть под рукой. Цель — не потерять привычку, не ставить рекорды.`
          : `Щадящий режим${until}: убери тяжёлые максимумы, оставь лёгкий объём и восстановление. Вернёмся к прогрессу после периода.`,
        meta: upcoming[0] ? `План: ${upcoming[0].slice(8, 10)}.${upcoming[0].slice(5, 7)}` : 'Можно набросать план вручную',
        cta: 'templates'
      };
    }

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

    if (ctx.goal?.intent === 'strength' && ctx.goal.focusExerciseId) {
      const recentFocus = done.some((s) =>
        s.date >= addDays(today, -10)
        && (s.exercises || []).some((e) => e.exerciseId === ctx.goal.focusExerciseId)
      );
      if (!recentFocus) {
        const name = focusName || 'фокус-упражнение';
        return {
          id: 'coach-next',
          kind: 'coach',
          severity: 'warn',
          title: 'Следующий шаг',
          body: `Цель — сила, а «${name}» давно не было в дневнике. Поставь его в ближайший шаблон или отдельную сессию.`,
          meta: null,
          cta: 'templates'
        };
      }
    }

    if (warns.some((c) => c.id === 'idle-groups') && ctx.goal?.intent !== 'strength') {
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
        body: ctx.goal?.intent === 'strength'
          ? 'Объём просел — на ближайшей сессии верни рабочие подходы, особенно в фокус-упражнении, без гонки за новым максимумом.'
          : 'Объём просел — на ближайшей сессии верни рабочие подходы к обычному весу, без гонки за новым максимумом.',
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

  function briefCard(allCards, ctx, exercises) {
    const warns = allCards.filter((c) => c.severity === 'warn');
    const goalLine = window.CoachGoal?.summaryLine
      ? CoachGoal.summaryLine(ctx.goal, exercises)
      : null;

    if (!ctx.goal) {
      return {
        id: 'coach-brief',
        kind: 'coach',
        severity: 'info',
        title: 'Фокус коуча',
        body: 'Цель ещё не задана — советы общие (ритм и объём). Задай цель: сила, масса, привычка или поддержка формы — и приоритеты станут точнее.',
        meta: 'Нужна цель',
        cta: 'goal'
      };
    }

    if (ctx.mode === 'travel' || ctx.mode === 'injury') {
      return {
        id: 'coach-brief',
        kind: 'coach',
        severity: 'info',
        title: 'Фокус коуча',
        body: ctx.mode === 'travel'
          ? 'Сейчас вектор — поддержка формы без гонки за силой. Ниже советы под этот режим; цель можно сменить в любой момент.'
          : 'Сейчас вектор — щадящий режим. Не давим на максимумы; ниже — что делать в этом периоде.',
        meta: goalLine || 'Режим поддержки',
        cta: 'goal'
      };
    }

    if (warns.length) {
      const top = warns[0];
      return {
        id: 'coach-brief',
        kind: 'coach',
        severity: 'warn',
        title: 'Фокус коуча',
        body: warns.length === 1
          ? `Главное сейчас: «${top.title}». Остальное подождёт.`
          : `Сначала разбери «${top.title}» — всего замечаний: ${warns.length}. Ниже детали и следующий шаг.`,
        meta: goalLine || 'Правила · без ИИ',
        cta: top.cta || 'goal'
      };
    }

    return {
      id: 'coach-brief',
      kind: 'coach',
      severity: 'ok',
      title: 'Фокус коуча',
      body: ctx.goal.intent === 'strength' && ctx.goal.focusExerciseId
        ? 'По цели всё ровно. Держи фокус-упражнение в плане и чуть двигай рабочие веса — коуч подсветит плато или срыв ритма.'
        : 'По дневнику и цели всё ровно. Держи план — коуч подсветит, если что-то поедет.',
      meta: goalLine || 'Правила · без ИИ',
      cta: 'goal'
    };
  }

  function softInsightSeverity(cards, mode) {
    if (mode !== 'travel' && mode !== 'injury') return cards;
    return cards.map((c) => {
      if (c.id === 'volume-regression' && c.severity === 'warn') {
        return {
          ...c,
          severity: 'info',
          title: 'Объём ниже обычного',
          body: 'В режиме поддержки падение тоннажа ожидаемо. Это не провал плана — просто другой вектор.'
        };
      }
      if (c.id === 'weight-vs-training' && c.severity === 'warn') {
        return {
          ...c,
          severity: 'info',
          body: `${c.body} В периоде без зала смотри на самочувствие, не на «идеальный» график.`
        };
      }
      return c;
    });
  }

  /**
   * @returns {{ cards: Array, hubHint: string, counts: object, insights: object|null, goal: object|null }}
   */
  function buildPack(input = {}) {
    const today = input.today || todayFallback();
    const ctx = resolveGoal(input.goal, today);

    if (ctx.goal?.focusExerciseId && input.exercises) {
      const hit = (input.exercises || []).find((e) => e.id === ctx.goal.focusExerciseId);
      window._coachFocusName = hit?.name || null;
    } else {
      window._coachFocusName = null;
    }

    const insights = window.AnalyticsInsights?.buildCards
      ? AnalyticsInsights.buildCards({ ...input, today })
      : { cards: [], hubHint: '', counts: { warn: 0, info: 0, ok: 0 } };

    let insightCards = (insights.cards || []).map((c) => ({ ...c, kind: c.kind || 'insight' }));
    insightCards = softInsightSeverity(insightCards, ctx.mode);

    const coachExtras = [
      frequencyCard(input.sessions, today, ctx),
      plateauCard(input.sessions, input.exercises, ctx),
      nextMoveCard(insightCards, input.sessions, input.templates, input.planned, today, ctx)
    ];

    const withoutBrief = [...insightCards, ...coachExtras];
    const brief = briefCard(withoutBrief, ctx, input.exercises);
    const rest = withoutBrief.slice().sort((a, b) => {
      const severityRank = { warn: 0, info: 1, ok: 2 };
      const sr = (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9);
      if (sr !== 0) return sr;
      if (a.kind === 'coach' && b.kind !== 'coach') return -1;
      if (b.kind === 'coach' && a.kind !== 'coach') return 1;
      return 0;
    });
    const ordered = [brief, ...rest];

    const warns = ordered.filter((c) => c.severity === 'warn');
    const hubHint = !ctx.goal
      ? 'Задай цель коучу'
      : warns.length === 1
        ? warns[0].title
        : warns.length > 1
          ? `Коуч: ${warns.length} ${plural(warns.length, ['замечание', 'замечания', 'замечаний'])}`
          : (ctx.mode === 'travel' || ctx.mode === 'injury')
            ? 'Режим поддержки'
            : 'Коуч: всё ровно';

    return {
      cards: ordered,
      hubHint,
      counts: {
        warn: warns.length,
        info: ordered.filter((c) => c.severity === 'info').length,
        ok: ordered.filter((c) => c.severity === 'ok').length
      },
      insights,
      goal: ctx.goal
    };
  }

  window.AnalyticsCoach = {
    buildPack,
    _internal: {
      frequencyCard,
      plateauCard,
      nextMoveCard,
      briefCard,
      resolveGoal
    }
  };
})();
