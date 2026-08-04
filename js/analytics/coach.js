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

  function daysBetween(a, b) {
    return Math.round((toDate(b) - toDate(a)) / DAY_MS);
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
    const softMode = window.CoachGoal?.isSoftMode
      ? CoachGoal.isSoftMode(ctx.mode)
      : (ctx.mode === 'pause' || ctx.mode === 'injury');

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
          ? `За ${FREQ_WINDOW_DAYS} дн. ~${rounded} трен./нед. при мягком ориентире ${target}. В простое это нормально — главное зафиксировать период и вернуться без рывка.`
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
    const softMode = window.CoachGoal?.isSoftMode
      ? CoachGoal.isSoftMode(ctx.mode)
      : (ctx.mode === 'pause' || ctx.mode === 'injury');

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
          ? `Сейчас простой / щадящий режим — не гонись за максимумом в «${catalog.get(focusId).name}». Вернёшься к прогрессии после периода.`
          : 'Сейчас простой / щадящий режим — плато по рабочим весам не приоритет. Зафиксируем паузу и сравним результат после возврата.',
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

  function sessionVolume(session) {
    let total = 0;
    for (const ex of session.exercises || []) {
      for (const set of ex.sets || []) {
        const w = Number(set.weight);
        const r = Number(set.reps);
        if (!Number.isFinite(w) || !Number.isFinite(r) || w < 0 || r < 0) continue;
        total += w * r;
      }
    }
    return total;
  }

  function maxFocusWeight(sessions, exerciseId) {
    if (!exerciseId) return null;
    let max = 0;
    let hits = 0;
    for (const s of sessions) {
      for (const ex of s.exercises || []) {
        if (ex.exerciseId !== exerciseId) continue;
        const w = maxSetWeight(ex);
        if (w > 0) {
          hits += 1;
          if (w > max) max = w;
        }
      }
    }
    return hits ? max : null;
  }

  function formatShort(dateStr) {
    if (!dateStr || dateStr.length < 10) return dateStr || '';
    return `${dateStr.slice(8, 10)}.${dateStr.slice(5, 7)}`;
  }

  /**
   * After a completed pause: compare ~21d before vs after period.
   * @returns {object|null} card or null if not applicable
   */
  function pauseReturnCard(sessions, exercises, ctx, today) {
    const pause = window.CoachGoal?.resolveCompletedPause
      ? CoachGoal.resolveCompletedPause(ctx.goal, today)
      : null;
    if (!pause) return null;

    // Too old — don't spam forever (user can still have dismissed earlier)
    const age = daysBetween(pause.periodTo, today);
    if (age > 60) return null;

    const done = completedSessions(sessions);
    const after = done.filter((s) => s.date > pause.periodTo && s.date <= today);
    const beforeTo = addDays(pause.periodFrom, -1);
    const beforeFrom = addDays(beforeTo, -20);
    const before = done.filter((s) => s.date >= beforeFrom && s.date <= beforeTo);

    const reason = pause.reason && window.CoachGoal?.PAUSE_REASON_LABELS
      ? CoachGoal.PAUSE_REASON_LABELS[pause.reason]
      : null;
    const periodLabel = `${formatShort(pause.periodFrom)}–${formatShort(pause.periodTo)}`;
    const reasonBit = reason ? ` (${reason})` : '';

    if (!after.length) {
      return {
        id: 'coach-pause-return',
        kind: 'coach',
        severity: 'info',
        title: 'Простой закончился',
        body: `Пауза${reasonBit} ${periodLabel} позади. Закрой первую тренировку после возврата — сравним объём и фокус с тем, что было до.`,
        meta: 'Ждём первую сессию',
        cta: 'templates'
      };
    }

    const beforeVol = before.reduce((s, x) => s + sessionVolume(x), 0);
    const afterVol = after.reduce((s, x) => s + sessionVolume(x), 0);
    const beforeCount = before.length;
    const afterCount = after.length;

    const focusId = ctx.goal?.focusExerciseId || null;
    const focusName = focusId
      ? ((exercises || []).find((e) => e.id === focusId)?.name || window._coachFocusName || 'фокус')
      : null;
    const beforeFocus = maxFocusWeight(before, focusId);
    const afterFocus = maxFocusWeight(after, focusId);

    const bits = [];
    bits.push(`тренировок ${afterCount} после vs ${beforeCount} до`);
    if (beforeVol > 0 || afterVol > 0) {
      const pct = beforeVol > 0 ? Math.round((afterVol / beforeVol) * 100) : null;
      bits.push(
        pct != null
          ? `объём ~${pct}% от окна до простоя`
          : `объём после: ${Math.round(afterVol)}`
      );
    }
    if (focusName && beforeFocus != null && afterFocus != null) {
      const delta = Math.round((afterFocus - beforeFocus) * 10) / 10;
      const sign = delta > 0 ? '+' : '';
      bits.push(`${focusName}: ${afterFocus} кг (${sign}${delta} к до)`);
    } else if (focusName && afterFocus != null) {
      bits.push(`${focusName}: ${afterFocus} кг после`);
    }

    const volRatio = beforeVol > 0 ? afterVol / beforeVol : 1;
    const focusDrop = beforeFocus != null && afterFocus != null && afterFocus < beforeFocus * 0.92;
    const thinReturn = afterCount === 1;

    let severity = 'ok';
    let title = 'Возврат после простоя';
    let body;

    if (thinReturn && age <= 21) {
      severity = 'info';
      title = 'Первая сессия после простоя';
      body = `Пауза${reasonBit} ${periodLabel}. ${bits.join(' · ')}. Не гонись за старым максимумом — набери 1–2 спокойные тренировки.`;
    } else if (volRatio < 0.7 || focusDrop) {
      severity = 'warn';
      title = 'После простоя ещё ниже базы';
      body = `Пауза${reasonBit} ${periodLabel}. ${bits.join(' · ')}. Нормально после паузы — верни рабочие веса постепенно, без рекордов на первой неделе.`;
    } else if (volRatio >= 0.9 && (!focusId || (afterFocus != null && beforeFocus != null && afterFocus >= beforeFocus * 0.95))) {
      severity = 'ok';
      title = 'После простоя форма рядом';
      body = `Пауза${reasonBit} ${periodLabel}. ${bits.join(' · ')}. Хороший возврат — можно снова опираться на цель.`;
    } else {
      severity = 'info';
      title = 'Возврат после простоя';
      body = `Пауза${reasonBit} ${periodLabel}. ${bits.join(' · ')}. Держи ритм ещё пару сессий — картина стабилизируется.`;
    }

    return {
      id: 'coach-pause-return',
      kind: 'coach',
      severity,
      title,
      body,
      meta: `+${age} дн. после паузы`,
      cta: focusId ? 'exercises' : 'templates'
    };
  }

  function nextMoveCard(insightCards, sessions, templates, planned, today, ctx) {
    const warns = (insightCards || []).filter((c) => c.severity === 'warn');
    const done = completedSessions(sessions);
    const last = done.slice().sort((a, b) => b.date.localeCompare(a.date))[0];
    const softMode = window.CoachGoal?.isSoftMode
      ? CoachGoal.isSoftMode(ctx.mode)
      : (ctx.mode === 'pause' || ctx.mode === 'injury');
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
      const reason = ctx.goal?.pauseReason && window.CoachGoal?.PAUSE_REASON_LABELS
        ? CoachGoal.PAUSE_REASON_LABELS[ctx.goal.pauseReason]
        : null;
      const reasonBit = reason ? ` (${reason})` : '';
      return {
        id: 'coach-next',
        kind: 'coach',
        severity: 'info',
        title: 'Следующий шаг',
        body: ctx.mode === 'pause'
          ? `Простой без зала${reasonBit}${until}: это пауза, не провал плана. Коуч зафиксирует период — после возврата сравним объём и фокус с тем, что было до.`
          : `Щадящий режим${until}: убери тяжёлые максимумы, оставь лёгкий объём и восстановление. Вернёмся к прогрессу после периода.`,
        meta: upcoming[0] ? `План: ${upcoming[0].slice(8, 10)}.${upcoming[0].slice(5, 7)}` : 'План на простой можно набросать позже',
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

    if (ctx.mode === 'pause' || ctx.mode === 'injury') {
      return {
        id: 'coach-brief',
        kind: 'coach',
        severity: 'info',
        title: 'Фокус коуча',
        body: ctx.mode === 'pause'
          ? 'Сейчас вектор — простой без зала. Не давим на силу и объём; ниже — что фиксируем в этом периоде. Цель можно сменить в любой момент.'
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
    if (!(window.CoachGoal?.isSoftMode ? CoachGoal.isSoftMode(mode) : (mode === 'pause' || mode === 'injury'))) {
      return cards;
    }
    return cards.map((c) => {
      if (c.id === 'volume-regression' && c.severity === 'warn') {
        return {
          ...c,
          severity: 'info',
          title: 'Объём ниже обычного',
          body: 'В простое / щадящем режиме падение тоннажа ожидаемо. Это не провал плана — другой вектор на период.'
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
      pauseReturnCard(input.sessions, input.exercises, ctx, today),
      nextMoveCard(insightCards, input.sessions, input.templates, input.planned, today, ctx)
    ].filter(Boolean);

    let withoutBrief = [...insightCards, ...coachExtras];

    const latestSessionId = window.CoachGoal?.latestCompletedSessionId
      ? CoachGoal.latestCompletedSessionId(input.sessions)
      : null;
    const dismissed = window.CoachGoal?.activeDismissedIds
      ? CoachGoal.activeDismissedIds(input.inbox, latestSessionId)
      : [];
    const dismissedSet = new Set(dismissed);
    if (dismissedSet.size) {
      withoutBrief = withoutBrief.filter((c) => !dismissedSet.has(c.id));
    }

    const brief = briefCard(withoutBrief, ctx, input.exercises);
    // If user dismissed everything actionable, brief explains the quiet state
    if (dismissedSet.size && !withoutBrief.length) {
      brief.severity = 'ok';
      brief.body = 'Замечания прочитаны. Обновлённый разбор появится после следующей завершённой тренировки.';
      brief.meta = 'Входящие очищены';
      brief.cta = 'goal';
    }

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
          : dismissedSet.size && !withoutBrief.length
            ? 'Прочитано · ждём тренировку'
            : (window.CoachGoal?.isSoftMode ? CoachGoal.isSoftMode(ctx.mode) : false)
              ? 'Режим простоя'
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
      goal: ctx.goal,
      latestSessionId,
      dismissedIds: dismissed
    };
  }

  window.AnalyticsCoach = {
    buildPack,
    _internal: {
      frequencyCard,
      plateauCard,
      pauseReturnCard,
      nextMoveCard,
      briefCard,
      resolveGoal
    }
  };
})();
