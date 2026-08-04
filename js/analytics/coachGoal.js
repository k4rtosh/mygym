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
   *   lastPause: object|null,
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
      lastPause: normalizeLastPause(raw.lastPause),
      updatedAt: raw.updatedAt ? String(raw.updatedAt) : null
    };
  }

  function normalizeLastPause(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const periodFrom = raw.periodFrom ? String(raw.periodFrom).slice(0, 10) : null;
    const periodTo = raw.periodTo ? String(raw.periodTo).slice(0, 10) : null;
    if (!periodFrom || !periodTo) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(periodFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(periodTo)) return null;
    let reason = raw.reason ? String(raw.reason) : null;
    if (reason && !PAUSE_REASONS.includes(reason)) reason = 'other';
    return {
      reason,
      periodFrom,
      periodTo,
      closedAt: raw.closedAt ? String(raw.closedAt) : null
    };
  }

  /**
   * When leaving pause mode, archive the period into lastPause for return analysis.
   */
  function withArchivedPause(previousGoal, nextGoal, today = todayStr()) {
    const prev = normalize(previousGoal);
    const next = normalize(nextGoal);
    if (!next) return null;

    const prevWasPause = prev && (prev.mode === 'pause' || prev.mode === 'travel');
    const nextIsPause = next.mode === 'pause';

    if (prevWasPause && !nextIsPause) {
      const periodFrom = prev.periodFrom || today;
      const periodTo = prev.periodTo && prev.periodTo >= periodFrom ? prev.periodTo : today;
      next.lastPause = {
        reason: prev.pauseReason || null,
        periodFrom,
        periodTo,
        closedAt: new Date().toISOString()
      };
    } else if (!next.lastPause && prev?.lastPause) {
      next.lastPause = prev.lastPause;
    }
    return next;
  }

  /**
   * Explicit «вернулся в зал»: archive pause → mode normal.
   * Works while effectiveMode is pause, or while stored mode is still pause
   * (period already expired but profile not cleaned).
   */
  function closePause(goal, today = todayStr()) {
    const g = normalize(goal);
    if (!g) return null;
    const active = effectiveMode(g, today) === 'pause' || g.mode === 'pause' || g.mode === 'travel';
    if (!active) return null;
    return withArchivedPause(
      g,
      {
        intent: g.intent,
        mode: 'normal',
        pauseReason: null,
        focusExerciseId: g.focusExerciseId,
        targetFrequency: g.targetFrequency,
        periodFrom: null,
        periodTo: null,
        lastPause: g.lastPause,
        updatedAt: new Date().toISOString()
      },
      today
    );
  }

  /** Show «Вернулся в зал» when pause is active or still stored. */
  function canClosePause(goal, today = todayStr()) {
    const g = normalize(goal);
    if (!g) return false;
    return effectiveMode(g, today) === 'pause' || g.mode === 'pause' || g.mode === 'travel';
  }

  /**
   * Completed pause window ready for «after return» analysis (not currently in pause).
   */
  function resolveCompletedPause(goal, today = todayStr()) {
    const g = normalize(goal);
    if (!g) return null;
    if (effectiveMode(g, today) === 'pause') return null;

    if (g.lastPause?.periodFrom && g.lastPause?.periodTo && g.lastPause.periodTo < today) {
      return { ...g.lastPause, source: 'lastPause' };
    }

    // mode still «pause» but period ended → effectiveMode already normal
    if (g.mode === 'pause' && g.periodTo && g.periodTo < today) {
      return {
        reason: g.pauseReason,
        periodFrom: g.periodFrom || g.periodTo,
        periodTo: g.periodTo,
        closedAt: null,
        source: 'expired'
      };
    }
    return null;
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
    } else if (mode === 'normal' && g.lastPause?.periodTo) {
      const reason = g.lastPause.reason && PAUSE_REASON_LABELS[g.lastPause.reason]
        ? PAUSE_REASON_LABELS[g.lastPause.reason]
        : null;
      parts.push(reason ? `после простоя · ${reason}` : 'после простоя');
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

  // ── Local inbox fallback (when profiles.coach_inbox missing in cloud) ──

  function localInboxKey(userId) {
    return `mygym_coach_inbox:${userId || 'anon'}`;
  }

  function readLocalInbox(userId) {
    try {
      const raw = localStorage.getItem(localInboxKey(userId));
      if (!raw) return null;
      return normalizeInbox(JSON.parse(raw));
    } catch (_) {
      return null;
    }
  }

  function writeLocalInbox(userId, inbox) {
    try {
      localStorage.setItem(localInboxKey(userId), JSON.stringify(normalizeInbox(inbox)));
    } catch (_) { /* ignore quota */ }
  }

  /**
   * Prefer cloud inbox when column is present on profile row;
   * otherwise fall back to localStorage (migration not applied yet).
   */
  function resolveInbox(profile, userId) {
    if (profile && Object.prototype.hasOwnProperty.call(profile, 'coach_inbox')) {
      return fromProfileInbox(profile);
    }
    if (profile && Object.prototype.hasOwnProperty.call(profile, 'coachInbox')) {
      return fromProfileInbox(profile);
    }
    return readLocalInbox(userId) || normalizeInbox(null);
  }

  function isMissingInboxColumnError(err) {
    const msg = String(err?.message || err || '');
    return /coach_inbox/i.test(msg) && (/schema cache|column/i.test(msg) || /could not find/i.test(msg));
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
    normalizeLastPause,
    withArchivedPause,
    closePause,
    canClosePause,
    resolveCompletedPause,
    isSoftMode,
    effectiveMode,
    effectiveFrequency,
    summaryLine,
    intentOptions,
    modeOptions,
    pauseReasonOptions,
    normalizeInbox,
    fromProfileInbox,
    resolveInbox,
    readLocalInbox,
    writeLocalInbox,
    isMissingInboxColumnError,
    latestCompletedSessionId,
    activeDismissedIds,
    dismissCards
  };
})();
