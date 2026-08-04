// Domain — coach goal normalize / labels. No DOM.
(function () {
  const INTENTS = ['strength', 'hypertrophy', 'habit', 'maintain'];
  const MODES = ['normal', 'travel', 'injury'];

  const INTENT_LABELS = {
    strength: 'Прогресс в силе',
    hypertrophy: 'Набор массы',
    habit: 'Привычка ходить в зал',
    maintain: 'Поддержка формы'
  };

  const MODE_LABELS = {
    normal: 'Обычный режим',
    travel: 'Командировка / без зала',
    injury: 'Восстановление / щадящий'
  };

  function todayStr() {
    return typeof Utils !== 'undefined'
      ? Utils.getTodayStr()
      : new Date().toISOString().slice(0, 10);
  }

  /**
   * @returns {null|{
   *   intent: string,
   *   mode: string,
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
    const mode = MODES.includes(raw.mode) ? raw.mode : 'normal';
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
    return {
      intent,
      mode,
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
    if (mode === 'travel' || mode === 'injury') return Math.min(fallback, 2);
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
    if (mode !== 'normal') parts.push(MODE_LABELS[mode] || mode);
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

  window.CoachGoal = {
    INTENTS,
    MODES,
    INTENT_LABELS,
    MODE_LABELS,
    normalize,
    fromProfile,
    effectiveMode,
    effectiveFrequency,
    summaryLine,
    intentOptions,
    modeOptions
  };
})();
