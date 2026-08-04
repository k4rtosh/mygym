// Domain — coach goal normalize / labels. No DOM.
(function () {
  const INTENTS = ['strength', 'hypertrophy', 'habit', 'maintain'];
  /** `travel` accepted as alias → normalized to `pause`. */
  const MODES = ['normal', 'pause', 'injury'];
  const PAUSE_REASONS = ['travel', 'work', 'illness', 'vacation', 'other'];

  const INTENT_LABELS = {
    strength: 'Прогресс в силе',
    hypertrophy: 'Набор массы',
    habit: 'Привычка ходить в зал',
    maintain: 'Поддержка формы'
  };

  const MODE_LABELS = {
    normal: 'Обычный режим',
    pause: 'Простой (без зала)',
    injury: 'Восстановление / щадящий',
    // legacy label if raw slips through before normalize
    travel: 'Простой (без зала)'
  };

  const PAUSE_REASON_LABELS = {
    travel: 'Командировка',
    work: 'Работа / загрузка',
    illness: 'Болезнь',
    vacation: 'Отпуск',
    other: 'Другое'
  };

  function todayStr() {
    return typeof Utils !== 'undefined'
      ? Utils.getTodayStr()
      : new Date().toISOString().slice(0, 10);
  }

  function mapMode(rawMode) {
    if (rawMode === 'travel') return 'pause';
    if (MODES.includes(rawMode)) return rawMode;
    return 'normal';
  }

  /**
   * @returns {null|{
   *   intent: string,
   *   mode: string,
   *   pauseReason: string|null,
   *   focusExerciseId: string|null,
   *   periodFrom: string|null,
   *   periodTo: string|null,
   *   targetFrequency: number|null,
   *   updatedAt: string|null
   * }}
   */
  function normalize(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const intent = INTENTS.includes(raw.intent) ? raw.intent : null;
    if (!intent) return null;
    const mode = mapMode(raw.mode);
    let targetFrequency = raw.targetFrequency != null ? Number(raw.targetFrequency) : null;
    if (targetFrequency != null) {
      if (!Number.isFinite(targetFrequency) || targetFrequency < 0 || targetFrequency > 14) {
        targetFrequency = null;
      } else {
        targetFrequency = Math.round(targetFrequency * 10) / 10;
      }
    }
    const focusExerciseId = raw.focusExerciseId
      ? String(raw.focusExerciseId).trim() || null
      : null;
    const periodFrom = raw.periodFrom ? String(raw.periodFrom).slice(0, 10) : null;
    const periodTo = raw.periodTo ? String(raw.periodTo).slice(0, 10) : null;
    let pauseReason = raw.pauseReason ? String(raw.pauseReason) : null;
    if (pauseReason && !PAUSE_REASONS.includes(pauseReason)) pauseReason = 'other';
    if (mode !== 'pause') pauseReason = null;

    return {
      intent,
      mode,
      pauseReason,
      focusExerciseId,
      periodFrom: periodFrom && /^\d{4}-\d{2}-\d{2}$/.test(periodFrom) ? periodFrom : null,
      periodTo: periodTo && /^\d{4}-\d{2}-\d{2}$/.test(periodTo) ? periodTo : null,
      targetFrequency,
      updatedAt: raw.updatedAt ? String(raw.updatedAt) : null
    };
  }

  function fromProfile(profile) {
    return normalize(profile?.coach_goal ?? profile?.coachGoal ?? null);
  }

  function isSoftMode(mode) {
    return mode === 'pause' || mode === 'travel' || mode === 'injury';
  }

  /** Active special mode if period covers today (or no period set). */
  function effectiveMode(goal, today = todayStr()) {
    const g = normalize(goal);
    if (!g) return 'normal';
    if (g.mode === 'normal') return 'normal';
    if (g.periodFrom && today < g.periodFrom) return 'normal';
    if (g.periodTo && today > g.periodTo) return 'normal';
    return g.mode;
  }

  function effectiveFrequency(goal, fallback = 3) {
    const g = normalize(goal);
    if (!g) return fallback;
    const mode = effectiveMode(g);
    if (g.targetFrequency != null) return g.targetFrequency;
    if (isSoftMode(mode)) return Math.min(fallback, 2);
    if (g.intent === 'habit') return 3;
    if (g.intent === 'strength' || g.intent === 'hypertrophy') return 3;
    if (g.intent === 'maintain') return 2;
    return fallback;
  }

  function summaryLine(goal, exercises) {
    const g = normalize(goal);
    if (!g) return 'Цель не задана';
    const parts = [INTENT_LABELS[g.intent] || g.intent];
    const mode = effectiveMode(g);
    if (mode !== 'normal') {
      let modeLabel = MODE_LABELS[mode] || mode;
      if (mode === 'pause' && g.pauseReason && PAUSE_REASON_LABELS[g.pauseReason]) {
        modeLabel = `Простой · ${PAUSE_REASON_LABELS[g.pauseReason]}`;
      }
      parts.push(modeLabel);
    }
    if (g.focusExerciseId) {
      const name = (exercises || []).find((e) => e.id === g.focusExerciseId)?.name;
      parts.push(name ? `фокус: ${name}` : 'есть фокус-упражнение');
    }
    const freq = effectiveFrequency(g);
    parts.push(`${freq}×/нед`);
    if (mode !== 'normal' && (g.periodFrom || g.periodTo)) {
      const a = g.periodFrom ? g.periodFrom.slice(5).replace('-', '.') : '…';
      const b = g.periodTo ? g.periodTo.slice(5).replace('-', '.') : '…';
      parts.push(`${a}–${b}`);
    }
    return parts.join(' · ');
  }

  function intentOptions() {
    return INTENTS.map((v) => ({ value: v, label: INTENT_LABELS[v] }));
  }

  function modeOptions() {
    return MODES.map((v) => ({ value: v, label: MODE_LABELS[v] }));
  }

  function pauseReasonOptions() {
    return [
      { value: '', label: 'Не указано' },
      ...PAUSE_REASONS.map((v) => ({ value: v, label: PAUSE_REASON_LABELS[v] }))
    ];
  }

  // ── Inbox: dismiss until next completed workout ───────

  function normalizeInbox(raw) {
    if (!raw || typeof raw !== 'object') {
      return { asOfSessionId: null, dismissed: [] };
    }
    const dismissed = Array.isArray(raw.dismissed)
      ? [...new Set(raw.dismissed.map((id) => String(id)).filter(Boolean))]
      : [];
    return {
      asOfSessionId: raw.asOfSessionId ? String(raw.asOfSessionId) : null,
      dismissed
    };
  }

  function fromProfileInbox(profile) {
    return normalizeInbox(profile?.coach_inbox ?? profile?.coachInbox ?? null);
  }

  /** Latest completed session id; stable token when history is empty. */
  function latestCompletedSessionId(sessions) {
    const done = (sessions || []).filter((s) => s && s.completed && s.endTime && s.id);
    if (!done.length) return '__empty__';
    done.sort((a, b) => String(b.endTime).localeCompare(String(a.endTime)));
    return done[0].id;
  }

  /**
   * Active dismissals only while asOfSessionId matches latest completed workout.
   * After a new finish, inbox is stale → show cards again.
   */
  function activeDismissedIds(inbox, latestSessionId) {
    const box = normalizeInbox(inbox);
    if (!box.dismissed.length) return [];
    if (!latestSessionId || box.asOfSessionId !== latestSessionId) return [];
    return box.dismissed;
  }

  function dismissCards(inbox, cardIds, latestSessionId) {
    const box = normalizeInbox(inbox);
    const ids = (cardIds || []).map(String).filter(Boolean);
    if (!ids.length || !latestSessionId) return box;
    const sameEpoch = box.asOfSessionId === latestSessionId;
    const prev = sameEpoch ? box.dismissed : [];
    return {
      asOfSessionId: latestSessionId,
      dismissed: [...new Set([...prev, ...ids])]
    };
  }

  window.CoachGoal = {
    INTENTS,
    MODES,
    PAUSE_REASONS,
    INTENT_LABELS,
    MODE_LABELS,
    PAUSE_REASON_LABELS,
    normalize,
    fromProfile,
    isSoftMode,
    effectiveMode,
    effectiveFrequency,
    summaryLine,
    intentOptions,
    modeOptions,
    pauseReasonOptions,
    normalizeInbox,
    fromProfileInbox,
    latestCompletedSessionId,
    activeDismissedIds,
    dismissCards
  };
})();
