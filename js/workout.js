class WorkoutManager {
  static currentSession = null;
  static timerInterval = null;
  static startTime = null;
  static elapsedSeconds = 0;
  static exerciseTimers = {};
  static exerciseTimes = {};
  static lastPersistAt = 0;
  static restInterval = null;
  /** Rest stopwatch elapsed seconds (counts up). */
  static restElapsedSeconds = 0;
  static restRunning = false;
  /** Focus CTA on exercise screen: idle → working → resting → working… */
  static exercisePhase = 'idle';
  /** Index of the exercise marked "current" in the list. */
  static activeExerciseIndex = null;
  /** Which exercise fullscreen is open (null = list view). */
  static openExerciseIndex = null;
  /** 'list' | 'exercise' */
  static sessionView = 'list';
  static exerciseCatalog = [];

  /** Clear all exercise setIntervals (must run before wiping exerciseTimers). */
  static stopAllExerciseTimers() {
    Object.keys(this.exerciseTimers || {}).forEach((key) => {
      const id = this.exerciseTimers[key];
      if (id) clearInterval(id);
    });
    this.exerciseTimers = {};
  }

  /**
   * Pause UI timers when leaving the active-workout screen.
   * Keeps the draft; intervals must not survive navigation.
   */
  static pauseSessionUi() {
    // Flush running exercise times into the session draft
    if (this.currentSession?.exercises) {
      this.currentSession.exercises.forEach((ex, index) => {
        if (this.exerciseTimes[index] != null) {
          ex.exerciseTime = this.exerciseTimes[index];
        }
      });
      DB.saveActiveSession(this.currentSession).catch(() => {});
    }
    this.stopAllExerciseTimers();
    this.stopTimer();
    this.stopRestTimer();
  }

  static focusExercise(index) {
    if (index == null || index < 0) return;
    const ex = this.currentSession?.exercises?.[index];
    if (!ex || ex.completed) return;
    this.activeExerciseIndex = index;
  }

  static syncActiveExerciseHighlight() {
    const cards = document.querySelectorAll('[data-exercise-index]');
    cards.forEach((card) => {
      const idx = Number(card.dataset.exerciseIndex);
      const isCurrent = idx === this.activeExerciseIndex && !card.classList.contains('workout-ex-done');
      card.classList.toggle('workout-ex-current', isCurrent);
      card.classList.toggle('border-info', isCurrent);
    });
  }

  static async guardActiveWorkout() {
    const draft = await DB.loadActiveSession();
    if (!draft || !draft.id || draft.endTime) return 'ok';

    const resume = await Utils.confirm(
      `Есть незавершённая тренировка «${draft.templateName || 'Тренировка'}».\n\n` +
      `Продолжить её или выбрать другое действие?`,
      { title: 'Тренировка в процессе', confirmText: 'Продолжить', cancelText: 'Другое' }
    );
    if (resume) {
      Router.navigate('active-workout', { sessionId: draft.id });
      return 'resumed';
    }

    const discard = await Utils.confirm(
      'Отменить незавершённую тренировку и начать новую?\nЧерновик будет удалён.',
      { title: 'Отменить черновик', confirmText: 'Отменить', confirmClass: 'btn-danger', cancelText: 'Назад' }
    );
    if (!discard) return 'abort';

    await DB.clearActiveSession();
    try {
      await Api.deleteSession(draft.id);
    } catch (e) {
      console.warn('discard session', e);
    }
    return 'ok';
  }

  static async loadStartWorkout() {
    const draft = await DB.loadActiveSession();
    if (draft && draft.id && !draft.endTime) {
      const container = document.getElementById('app');
      container.innerHTML = `
        <div class="app-header fade-in">
          <div class="d-flex align-items-center">
            <button class="btn btn-link text-white me-2" onclick="Router.navigate('home')">
              <i class="bi bi-arrow-left"></i>
            </button>
            <h4 class="mb-0">Тренировка</h4>
          </div>
        </div>
        <div class="container fade-in">
          <div class="card active-resume-card mb-3">
            <div class="card-body">
              <div class="home-last-label">Незавершённая</div>
              <div class="home-last-title mb-2">${Utils.escapeHtml(draft.templateName || 'Тренировка')}</div>
              <p class="text-muted small mb-3">Сначала заверши или отмени текущую, затем начинай новую.</p>
              <button class="btn btn-primary w-100 mb-2" onclick="Router.navigate('active-workout', {sessionId: '${draft.id}'})">
                <i class="bi bi-play-fill"></i> Продолжить
              </button>
              <button class="btn btn-outline-danger w-100" id="discard-draft-btn">
                <i class="bi bi-x-circle"></i> Отменить черновик
              </button>
            </div>
          </div>
        </div>
      `;
      document.getElementById('discard-draft-btn')?.addEventListener('click', async () => {
        if (!(await Utils.confirm('Удалить незавершённую тренировку?', {
          title: 'Удалить черновик',
          confirmText: 'Удалить',
          confirmClass: 'btn-danger'
        }))) return;
        await DB.clearActiveSession();
        try { await Api.deleteSession(draft.id); } catch (_) {}
        Utils.showToast('Черновик удалён');
        await WorkoutManager.loadStartWorkout();
      });
      return;
    }

    let templates = [];
    let planned = null;
    try {
      templates = await Api.listTemplates();
      planned = await Api.getPlannedForDate(Utils.getTodayStr());
    } catch (e) {
      Utils.showToast(e.message || 'Нужен интернет', 'warning');
    }

    const container = document.getElementById('app');
    let plannedHtml = '';
    if (planned) {
      const tName = planned.templates?.name || 'Свободная';
      plannedHtml = `
        <div class="card mb-3 border-primary">
          <div class="card-body">
            <h6 class="mb-2">План на сегодня</h6>
            <p class="mb-3">${Utils.escapeHtml(tName)}</p>
            <button class="btn btn-primary w-100" onclick="WorkoutManager.startFromPlan()">
              <i class="bi bi-play"></i> Начать по плану
            </button>
          </div>
        </div>
      `;
    }

    const templateButtons = templates.map((t) => `
      <button class="btn btn-outline-light w-100 mb-2 text-start"
        onclick="WorkoutManager.startFromTemplate('${t.id}')">
        <strong>${Utils.escapeHtml(t.name)}</strong><br>
        <small class="text-muted">${(t.exercises || []).length} упражнений</small>
      </button>
    `).join('');

    container.innerHTML = `
      <div class="app-header fade-in">
        <div class="d-flex align-items-center">
          <button class="btn btn-link text-white me-2" onclick="Router.navigate('home')">
            <i class="bi bi-arrow-left"></i>
          </button>
          <h4 class="mb-0">Новая тренировка</h4>
        </div>
      </div>
      <div class="container fade-in">
        ${plannedHtml}
        ${templates.length ? `
          <div class="card mb-3">
            <div class="card-header"><h6 class="mb-0">Шаблон</h6></div>
            <div class="card-body">${templateButtons}</div>
          </div>
        ` : ''}
        <div class="card">
          <div class="card-body text-center">
            <p class="mb-3">Или пустая тренировка</p>
            <button class="btn btn-primary w-100" onclick="WorkoutManager.startEmpty()">
              <i class="bi bi-lightning"></i> Начать
            </button>
          </div>
        </div>
      </div>
    `;
  }

  static async startFromPlan() {
    const gate = await this.guardActiveWorkout();
    if (gate !== 'ok') return;
    const planned = await Api.getPlannedForDate(Utils.getTodayStr());
    if (planned?.template_id) {
      await this.startFromTemplate(planned.template_id, true);
    } else {
      await this.startEmpty(true);
    }
  }

  static async startFromTemplate(templateId, skipGuard = false) {
    if (!skipGuard) {
      const gate = await this.guardActiveWorkout();
      if (gate !== 'ok') return;
    }
    try {
      const template = await Api.getTemplate(templateId);
      if (!template) {
        Utils.showToast('Шаблон не найден', 'danger');
        return;
      }
      const session = {
        id: Utils.generateId(),
        templateId: template.id,
        templateName: template.name,
        date: Utils.getTodayStr(),
        startTime: new Date().toISOString(),
        endTime: null,
        duration: 0,
        completed: false,
        notes: '',
        exercises: (template.exercises || []).map((ex) => ({
          exerciseId: ex.exerciseId,
          sets: [],
          completed: false,
          exerciseTime: 0
        }))
      };
      await DB.saveActiveSession(session);
      try {
        await Api.upsertSession(session);
      } catch (e) {
        console.warn('Cloud save deferred', e);
      }
      Router.navigate('active-workout', { sessionId: session.id });
    } catch (e) {
      Utils.showToast(e.message, 'danger');
    }
  }

  static async startEmpty(skipGuard = false) {
    if (!skipGuard) {
      const gate = await this.guardActiveWorkout();
      if (gate !== 'ok') return;
    }
    const session = {
      id: Utils.generateId(),
      templateId: null,
      templateName: 'Свободная тренировка',
      date: Utils.getTodayStr(),
      startTime: new Date().toISOString(),
      endTime: null,
      duration: 0,
      completed: false,
      notes: '',
      exercises: []
    };
    await DB.saveActiveSession(session);
    try {
      await Api.upsertSession(session);
    } catch (e) {
      console.warn('Cloud save deferred', e);
    }
    Router.navigate('active-workout', { sessionId: session.id });
  }

  static async startActiveWorkout(sessionId) {
    let session = await DB.loadActiveSession();
    if (!session || session.id !== sessionId) {
      try {
        session = await Api.getSession(sessionId);
      } catch (_) {
        session = null;
      }
    }
    if (!session) {
      Utils.showToast('Тренировка не найдена', 'danger');
      Router.navigate('workout');
      return;
    }
    if (session.endTime) {
      await DB.clearActiveSession();
      Router.navigate('history-detail', { sessionId });
      return;
    }

    // Kill any orphaned intervals from a previous visit to this screen
    this.pauseSessionUi();

    this.currentSession = session;
    this.startTime = new Date(session.startTime);
    this.exerciseTimers = {};
    this.exerciseTimes = {};
    this.restoreExerciseTimers();

    // Focus first incomplete exercise so the list has a clear "current" marker
    const firstOpen = (session.exercises || []).findIndex((ex) => !ex.completed);
    this.activeExerciseIndex = firstOpen >= 0 ? firstOpen : null;
    this.openExerciseIndex = null;
    this.sessionView = 'list';
    this.restElapsedSeconds = 0;
    this.restRunning = false;
    this.exercisePhase = 'idle';

    this.startTimer();
    await this.renderActiveWorkout();
  }

  static minimizeSession() {
    this.pauseSessionUi();
    this.sessionView = 'list';
    this.openExerciseIndex = null;
    this.exercisePhase = 'idle';
    Router.navigate('home');
  }

  static exerciseName(exerciseId) {
    const info = this.exerciseCatalog.find((e) => e.id === exerciseId);
    return info ? info.name : 'Упражнение';
  }

  static isBodyweight(exerciseId) {
    const info = this.exerciseCatalog.find((e) => e.id === exerciseId);
    return !!(info && info.type === 'Собственный вес');
  }

  static sessionProgress() {
    const list = this.currentSession?.exercises || [];
    const done = list.filter((ex) => ex.completed).length;
    return { done, total: list.length };
  }

  static pluralSets(n) {
    const m10 = n % 10;
    const m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return 'подход';
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'подхода';
    return 'подходов';
  }

  static buzz() {
    try {
      const haptics = window.Capacitor?.Plugins?.Haptics;
      if (haptics?.impact) {
        haptics.impact({ style: 'MEDIUM' });
        return;
      }
    } catch { /* optional */ }
    try {
      if (navigator.vibrate) navigator.vibrate([80, 40, 80]);
    } catch { /* ignore */ }
  }

  static startTimer() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      this.elapsedSeconds = Math.floor((Date.now() - this.startTime.getTime()) / 1000);
      this.syncSessionClock();
    }, 1000);
  }

  static stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  static openExercise(index) {
    const ex = this.currentSession?.exercises?.[index];
    if (!ex) return;
    const prevOpen = this.openExerciseIndex;
    const phaseOwner = prevOpen != null ? prevOpen : this.activeExerciseIndex;
    if (phaseOwner != null && phaseOwner !== index) {
      if (this.exerciseTimers[phaseOwner]) this.stopExerciseTimer(phaseOwner);
      this.stopRestStopwatch({ announce: false });
      this.exercisePhase = 'idle';
    }
    this.openExerciseIndex = index;
    this.sessionView = 'exercise';
    if (!ex.completed) this.activeExerciseIndex = index;
    this.renderActiveWorkout();
  }

  static backToList() {
    this.sessionView = 'list';
    this.openExerciseIndex = null;
    this.renderActiveWorkout();
  }

  static async ensureCatalog() {
    try {
      this.exerciseCatalog = await Api.listExercises();
      await DB.cacheExercises(this.exerciseCatalog);
    } catch (_) {
      this.exerciseCatalog = (await DB.loadExercisesCache()) || [];
    }
  }

  static async renderActiveWorkout() {
    if (!this.currentSession) return;
    await this.ensureCatalog();
    if (this.sessionView === 'exercise' && this.openExerciseIndex != null) {
      await this.renderExerciseScreen(this.openExerciseIndex);
    } else {
      await this.renderSessionList();
    }
  }

  static async renderSessionList() {
    const container = document.getElementById('app');
    const { done, total } = this.sessionProgress();
    const progressPct = total ? Math.round((done / total) * 100) : 0;

    const rows = (this.currentSession.exercises || []).length
      ? this.currentSession.exercises.map((ex, index) => {
        const name = this.exerciseName(ex.exerciseId);
        const setsCount = ex.sets?.length || 0;
        const isCurrent = !ex.completed && this.activeExerciseIndex === index;
        const stateClass = ex.completed
          ? 'ex-row-done'
          : (isCurrent ? 'ex-row-current' : 'ex-row-pending');
        const status = ex.completed
          ? '<span class="ex-row-badge done">Готово</span>'
          : (isCurrent ? '<span class="ex-row-badge now">Сейчас</span>' : '<span class="ex-row-badge wait">Ждёт</span>');
        return `
          <button type="button" class="ex-row ${stateClass}" data-exercise-index="${index}"
            onclick="WorkoutManager.openExercise(${index})">
            <div class="ex-row-main">
              <div class="ex-row-name">${Utils.escapeHtml(name)}</div>
              <div class="ex-row-meta">${setsCount} ${this.pluralSets(setsCount)}</div>
            </div>
            ${status}
            <i class="bi bi-chevron-right ex-row-chevron" aria-hidden="true"></i>
          </button>
        `;
      }).join('')
      : '<div class="session-empty text-center py-4"><p class="text-muted mb-0">Нет упражнений — добавь первое</p></div>';

    container.innerHTML = `
      <div class="workout-session fade-in">
        <div class="session-topbar">
          <button type="button" class="btn btn-link text-white session-minimize" onclick="WorkoutManager.minimizeSession()" title="Свернуть">
            <i class="bi bi-chevron-down"></i>
            <span>Свернуть</span>
          </button>
          <div class="session-topbar-center">
            <div class="session-title">${Utils.escapeHtml(this.currentSession.templateName || 'Тренировка')}</div>
            <div class="session-progress-text">${done}/${total || 0} упр. · ${progressPct}%</div>
          </div>
          <div class="timer-display" id="timer-display">00:00</div>
        </div>
        <div class="session-progress-track" aria-hidden="true">
          <div class="session-progress-fill" style="width:${progressPct}%"></div>
        </div>
        <div class="session-scroll session-scroll-list">
          <div class="container session-container">
            <div class="session-notes card mb-3">
              <div class="card-body py-2">
                <input type="text" class="form-control form-control-sm border-0 bg-transparent px-0"
                  id="session-notes"
                  value="${Utils.escapeHtml(this.currentSession.notes || '')}"
                  placeholder="Заметка к тренировке…">
              </div>
            </div>
            <div class="ex-row-list">${rows}</div>
            <button class="btn btn-outline-light w-100 mt-3" onclick="WorkoutManager.showAddExerciseModal()">
              <i class="bi bi-plus-circle"></i> Добавить упражнение
            </button>
            <div class="mt-3 mb-2">
              <button class="btn btn-danger w-100" id="finish-workout-btn">
                <i class="bi bi-flag"></i> Завершить тренировку
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('finish-workout-btn')?.addEventListener('click', () => this.finishWorkout());
    document.getElementById('session-notes')?.addEventListener('change', async (e) => {
      this.currentSession.notes = e.target.value;
      await this.persist(true);
    });
    this.syncSessionClock();
  }

  static async renderExerciseScreen(index) {
    const container = document.getElementById('app');
    const exercise = this.currentSession.exercises[index];
    if (!exercise) {
      this.backToList();
      return;
    }

    const name = this.exerciseName(exercise.exerciseId);
    const isBw = this.isBodyweight(exercise.exerciseId);
    const timerValue = this.exerciseTimes[index] || exercise.exerciseTime || 0;
    const { total } = this.sessionProgress();
    const phase = exercise.completed ? 'idle' : this.exercisePhase;

    container.innerHTML = `
      <div class="workout-session workout-exercise-screen fade-in">
        <div class="session-topbar">
          <button type="button" class="btn btn-link text-white session-minimize" onclick="WorkoutManager.backToList()" title="К списку">
            <i class="bi bi-chevron-left"></i>
            <span>К списку</span>
          </button>
          <div class="session-topbar-center">
            <div class="session-progress-text">${index + 1}/${total || 0} · упражнение</div>
            <div class="timer-display timer-display-inline" id="timer-display">${Utils.formatTime(timerValue)}</div>
          </div>
          <div class="session-topbar-spacer"></div>
        </div>

        <div class="ex-screen-scroll">
          <div class="container session-container">
            <h1 class="ex-screen-title">${Utils.escapeHtml(name)}</h1>
            ${isBw ? '<p class="text-muted small mb-3">Доп. вес · пусто = без довеска</p>' : '<div class="mb-3"></div>'}

            <div class="ex-sets-panel mb-3">
              <div class="ex-sets-head">
                <span>Подходы</span>
                <span class="text-muted">${exercise.sets?.length || 0} ${this.pluralSets(exercise.sets?.length || 0)}</span>
              </div>
              <div class="sets-list" id="sets-${index}">
                ${this.renderSets(exercise, index, { isBodyweight: isBw })}
              </div>
            </div>
          </div>
        </div>

        <div class="ex-screen-dock">
          ${exercise.completed
            ? ''
            : this.renderFocusButtonHtml(index, phase)}

          <div class="ex-dock-actions">
            <button type="button" class="btn btn-outline-light flex-fill" onclick="WorkoutManager.addSet(${index})">
              <i class="bi bi-plus-lg"></i> Подход
            </button>
            <button type="button" class="btn btn-outline-info flex-fill" onclick="WorkoutManager.repeatLastSet(${index})">
              <i class="bi bi-arrow-repeat"></i> Как прошлый
            </button>
          </div>

          ${exercise.completed
            ? `<button type="button" class="btn btn-outline-warning w-100 mt-2" onclick="WorkoutManager.uncompleteExercise(${index})">Вернуть в работу</button>`
            : `<button type="button" class="btn btn-success w-100 mt-2" onclick="WorkoutManager.completeExercise(${index})">Упражнение готово</button>`}
        </div>
      </div>
    `;
  }

  static focusPhaseLabel(phase) {
    if (phase === 'working') return 'Отдых';
    if (phase === 'resting') return 'Продолжить';
    return 'Начать упражнение';
  }

  static focusPhaseHint(phase) {
    if (phase === 'working') return 'Работа идёт · нажми для отдыха';
    if (phase === 'resting') return `Отдых ${Utils.formatTime(this.restElapsedSeconds)}`;
    return 'Таймер упражнения в шапке';
  }

  static renderFocusButtonHtml(index, phase = this.exercisePhase) {
    return `
      <button type="button" class="ex-focus-btn ex-focus-${phase}" id="ex-focus-btn"
        onclick="WorkoutManager.cycleExercisePhase(${index})">
        <span class="ex-focus-label">${this.focusPhaseLabel(phase)}</span>
        <span class="ex-focus-hint" id="ex-focus-hint">${this.focusPhaseHint(phase)}</span>
        ${phase === 'resting' ? `<span class="visually-hidden" id="rest-timer-value">${Utils.formatTime(this.restElapsedSeconds)}</span>` : ''}
      </button>
    `;
  }

  /** Advance idle → working → resting → working. */
  static cycleExercisePhase(index) {
    const exercise = this.currentSession?.exercises?.[index];
    if (!exercise || exercise.completed) {
      Utils.showToast('Упражнение уже завершено', 'warning');
      return;
    }

    if (this.exercisePhase === 'idle') {
      this.stopRestStopwatch({ announce: false });
      this.startExerciseTimer(index);
      this.exercisePhase = 'working';
      this.buzz();
    } else if (this.exercisePhase === 'working') {
      this.stopExerciseTimer(index);
      this.startRestStopwatch(true);
      this.exercisePhase = 'resting';
      this.buzz();
    } else {
      this.stopRestStopwatch({ announce: true });
      this.startExerciseTimer(index);
      this.exercisePhase = 'working';
    }

    this.syncFocusButton(index);
  }

  static syncFocusButton(index = this.openExerciseIndex) {
    const btn = document.getElementById('ex-focus-btn');
    if (!btn || index == null) return;
    const phase = this.exercisePhase;
    btn.className = `ex-focus-btn ex-focus-${phase}`;
    const label = btn.querySelector('.ex-focus-label');
    const hint = btn.querySelector('.ex-focus-hint');
    if (label) label.textContent = this.focusPhaseLabel(phase);
    if (hint) {
      hint.id = 'ex-focus-hint';
      hint.textContent = this.focusPhaseHint(phase);
    }
    let restHidden = document.getElementById('rest-timer-value');
    if (phase === 'resting') {
      if (!restHidden) {
        restHidden = document.createElement('span');
        restHidden.id = 'rest-timer-value';
        restHidden.className = 'visually-hidden';
        btn.appendChild(restHidden);
      }
      restHidden.textContent = Utils.formatTime(this.restElapsedSeconds);
    } else if (restHidden) {
      restHidden.remove();
    }
  }

  static syncSessionClock() {
    if (!this.startTime) return;
    this.elapsedSeconds = Math.floor((Date.now() - this.startTime.getTime()) / 1000);

    // Exercise screen: header shows exercise timer (session timer lives on the list).
    if (this.sessionView === 'exercise' && this.openExerciseIndex != null) {
      const idx = this.openExerciseIndex;
      const t = this.exerciseTimes[idx] ?? this.currentSession?.exercises?.[idx]?.exerciseTime ?? 0;
      document.querySelectorAll('#timer-display').forEach((el) => {
        el.textContent = Utils.formatTime(t);
      });
      return;
    }

    document.querySelectorAll('#timer-display').forEach((el) => {
      el.textContent = Utils.formatTime(this.elapsedSeconds);
    });
  }

  static formatSetField(value) {
    if (value == null || value === '') return '';
    return String(value);
  }

  static parseSetValue(field, value) {
    const raw = String(value ?? '').trim().replace(',', '.');
    if (!raw) return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    if (field === 'reps') return Math.max(0, Math.round(n));
    return Math.max(0, Math.round(n * 10) / 10);
  }

  static renderSets(exercise, exerciseIndex, options = {}) {
    if (!exercise.sets || !exercise.sets.length) {
      return '<p class="text-muted small mb-0 px-1">Пока пусто — «+ Подход» создаст пустые поля, «Как прошлый» скопирует предыдущий</p>';
    }
    const weightStep = options.isBodyweight ? 1 : 2.5;
    const weightLabel = options.isBodyweight ? 'доп. кг' : 'кг';
    return exercise.sets.map((set, setIndex) => `
      <div class="set-card">
        <div class="set-card-top">
          <span class="set-number">#${setIndex + 1}</span>
          <button type="button" class="btn btn-sm btn-outline-danger set-remove-btn"
            onclick="WorkoutManager.removeSet(${exerciseIndex}, ${setIndex})">
            <i class="bi bi-x-lg"></i>
          </button>
        </div>
        <div class="set-card-fields">
          <div class="set-field">
            <span class="set-field-label">${weightLabel}</span>
            <div class="set-stepper set-stepper-lg">
              <button type="button" class="btn btn-outline-light set-step-btn"
                onclick="WorkoutManager.nudgeSet(${exerciseIndex}, ${setIndex}, 'weight', ${-weightStep})">−</button>
              <input type="number" class="form-control set-step-input" inputmode="decimal"
                placeholder="—"
                value="${Utils.escapeHtml(this.formatSetField(set.weight))}"
                onchange="WorkoutManager.updateSet(${exerciseIndex}, ${setIndex}, 'weight', this.value)">
              <button type="button" class="btn btn-outline-light set-step-btn"
                onclick="WorkoutManager.nudgeSet(${exerciseIndex}, ${setIndex}, 'weight', ${weightStep})">+</button>
            </div>
          </div>
          <div class="set-field">
            <span class="set-field-label">повторы</span>
            <div class="set-stepper set-stepper-lg">
              <button type="button" class="btn btn-outline-light set-step-btn"
                onclick="WorkoutManager.nudgeSet(${exerciseIndex}, ${setIndex}, 'reps', -1)">−</button>
              <input type="number" class="form-control set-step-input" inputmode="numeric"
                placeholder="—"
                value="${Utils.escapeHtml(this.formatSetField(set.reps))}"
                onchange="WorkoutManager.updateSet(${exerciseIndex}, ${setIndex}, 'reps', this.value)">
              <button type="button" class="btn btn-outline-light set-step-btn"
                onclick="WorkoutManager.nudgeSet(${exerciseIndex}, ${setIndex}, 'reps', 1)">+</button>
            </div>
          </div>
        </div>
      </div>
    `).join('');
  }

  static nudgeSet(exerciseIndex, setIndex, field, delta) {
    const set = this.currentSession?.exercises?.[exerciseIndex]?.sets?.[setIndex];
    if (!set) return;
    const current = set[field] == null || set[field] === '' ? 0 : Number(set[field]);
    let next = (Number.isFinite(current) ? current : 0) + Number(delta);
    if (field === 'reps') next = Math.max(0, Math.round(next));
    else next = Math.max(0, Math.round(next * 10) / 10);
    set[field] = next;
    this.syncSetInput(exerciseIndex, setIndex, field, next);
    this.persist(false);
  }

  /** Update one set input without rebuilding the whole exercise screen. */
  static syncSetInput(exerciseIndex, setIndex, field, value) {
    const list = document.getElementById(`sets-${exerciseIndex}`);
    if (!list) return;
    const card = list.children[setIndex];
    if (!card) return;
    const inputs = card.querySelectorAll('.set-step-input');
    const input = field === 'weight' ? inputs[0] : inputs[1];
    if (input) input.value = this.formatSetField(value);
  }

  static async persist(forceCloud = false) {
    if (!this.currentSession) return;
    // Serialize saves so rapid nudges don't pile up IndexedDB writes
    const run = async () => {
      await DB.saveActiveSession(this.currentSession);
      const now = Date.now();
      if (forceCloud || now - this.lastPersistAt > 8000) {
        this.lastPersistAt = now;
        try {
          await Api.upsertSession(this.currentSession);
        } catch (e) {
          console.warn('Cloud persist failed', e);
        }
      }
    };
    this._persistChain = (this._persistChain || Promise.resolve())
      .then(run, run)
      .catch((e) => console.warn('persist', e));
    return this._persistChain;
  }

  static async saveAndRender() {
    await this.persist(false);
    await this.renderActiveWorkout();
  }

  /** Empty set — user fills weight/reps manually. Does not start rest. */
  static addSet(exerciseIndex) {
    const ex = this.currentSession.exercises[exerciseIndex];
    if (!ex.sets) ex.sets = [];
    ex.sets.push({ weight: null, reps: null });
    if (!ex.completed) this.activeExerciseIndex = exerciseIndex;
    this.saveAndRender();
  }

  /** Copy weight/reps from the previous set only. Does not start rest. */
  static repeatLastSet(exerciseIndex) {
    const ex = this.currentSession.exercises[exerciseIndex];
    if (!ex.sets) ex.sets = [];
    const last = ex.sets[ex.sets.length - 1];
    if (!last) {
      Utils.showToast('Нет предыдущего подхода', 'warning');
      return;
    }
    ex.sets.push({
      weight: last.weight == null ? null : last.weight,
      reps: last.reps == null ? null : last.reps
    });
    if (!ex.completed) this.activeExerciseIndex = exerciseIndex;
    this.saveAndRender();
  }

  static removeSet(exerciseIndex, setIndex) {
    this.currentSession.exercises[exerciseIndex].sets.splice(setIndex, 1);
    this.saveAndRender();
  }

  static updateSet(exerciseIndex, setIndex, field, value) {
    this.currentSession.exercises[exerciseIndex].sets[setIndex][field] = this.parseSetValue(field, value);
    this.persist(false);
  }

  static completeExercise(exerciseIndex) {
    if (this.exerciseTimers[exerciseIndex]) {
      clearInterval(this.exerciseTimers[exerciseIndex]);
      this.exerciseTimers[exerciseIndex] = null;
    }
    this.stopExerciseTimer(exerciseIndex);
    this.stopRestStopwatch({ announce: false });
    this.exercisePhase = 'idle';
    const exercise = this.currentSession.exercises[exerciseIndex];
    exercise.exerciseTime = this.exerciseTimes[exerciseIndex] || exercise.exerciseTime || 0;
    exercise.completed = true;

    const next = (this.currentSession.exercises || []).findIndex(
      (ex, i) => i > exerciseIndex && !ex.completed
    );
    const fallback = (this.currentSession.exercises || []).findIndex((ex) => !ex.completed);
    this.activeExerciseIndex = next >= 0 ? next : (fallback >= 0 ? fallback : null);
    this.sessionView = 'list';
    this.openExerciseIndex = null;
    this.saveAndRender();
    Utils.showToast('Упражнение готово');
  }

  static uncompleteExercise(exerciseIndex) {
    const exercise = this.currentSession.exercises[exerciseIndex];
    exercise.completed = false;
    this.exerciseTimes[exerciseIndex] = exercise.exerciseTime || 0;
    this.activeExerciseIndex = exerciseIndex;
    this.openExerciseIndex = exerciseIndex;
    this.sessionView = 'exercise';
    this.exercisePhase = 'idle';
    this.saveAndRender();
  }

  /** Rest as stopwatch: counts up; ending rest announces elapsed. */
  static startRestStopwatch(reset = true) {
    if (this.restInterval) {
      clearInterval(this.restInterval);
      this.restInterval = null;
    }
    if (reset) this.restElapsedSeconds = 0;
    this.restRunning = true;
    this.updateRestDisplays();

    this.restInterval = setInterval(() => {
      this.restElapsedSeconds += 1;
      this.updateRestDisplays();
    }, 1000);
  }

  static updateRestDisplays() {
    const formatted = Utils.formatTime(this.restElapsedSeconds);
    const hint = document.getElementById('ex-focus-hint');
    if (hint && this.exercisePhase === 'resting') {
      hint.textContent = `Отдых ${formatted}`;
    }
    const hidden = document.getElementById('rest-timer-value');
    if (hidden) hidden.textContent = formatted;
  }

  static stopRestStopwatch({ announce = true } = {}) {
    const elapsed = this.restElapsedSeconds;
    const wasRunning = this.restRunning || !!this.restInterval;
    if (this.restInterval) {
      clearInterval(this.restInterval);
      this.restInterval = null;
    }
    this.restRunning = false;
    if (announce && wasRunning && elapsed > 0) {
      this.buzz();
      Utils.showToast(`Отдых ${Utils.formatTime(elapsed)}`);
    }
  }

  /** @deprecated kept for pauseSessionUi / finishWorkout call sites */
  static stopRestTimer() {
    this.stopRestStopwatch({ announce: false });
    this.restElapsedSeconds = 0;
  }

  static async showAddExerciseModal() {
    let allExercises = [];
    try {
      allExercises = await Api.listExercises();
    } catch (_) {
      allExercises = (await DB.loadExercisesCache()) || [];
    }

    const modal = document.createElement('div');
    modal.className = 'modal fade';
    modal.tabIndex = -1;
    modal.innerHTML = `
      <div class="modal-dialog modal-dialog-scrollable">
        <div class="modal-content bg-dark text-light">
          <div class="modal-header">
            <h5 class="modal-title">Добавить упражнение</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <input type="text" class="form-control mb-3" id="exercise-search" placeholder="Поиск...">
            <div id="exercise-list">
              ${allExercises.map((ex) => `
                <button class="btn btn-outline-light w-100 mb-2 text-start exercise-select-btn" data-exercise-id="${Utils.escapeHtml(ex.id)}">
                  <strong>${Utils.escapeHtml(ex.name)}</strong><br>
                  <small class="text-muted">${Utils.escapeHtml(ex.category)} · ${Utils.escapeHtml(ex.type || '')}</small>
                </button>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();

    modal.querySelector('#exercise-search').addEventListener('input', (e) => {
      const search = e.target.value.toLowerCase();
      modal.querySelectorAll('.exercise-select-btn').forEach((btn) => {
        btn.style.display = btn.textContent.toLowerCase().includes(search) ? '' : 'none';
      });
    });

    modal.querySelectorAll('.exercise-select-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
                this.currentSession.exercises.push({
                  exerciseId: btn.dataset.exerciseId,
                  sets: [],
                  completed: false,
                  exerciseTime: 0
                });
        this.exerciseTimes[this.currentSession.exercises.length - 1] = 0;
        const newIndex = this.currentSession.exercises.length - 1;
        if (this.activeExerciseIndex != null && this.exerciseTimers[this.activeExerciseIndex]) {
          this.stopExerciseTimer(this.activeExerciseIndex);
        }
        this.stopRestStopwatch({ announce: false });
        this.exercisePhase = 'idle';
        this.activeExerciseIndex = newIndex;
        this.openExerciseIndex = newIndex;
        this.sessionView = 'exercise';
        this.saveAndRender();
        bsModal.hide();
        modal.remove();
      });
    });
    modal.addEventListener('hidden.bs.modal', () => modal.remove());
  }

  static async finishWorkout() {
    if (!(await Utils.confirm('Завершить тренировку?', {
      title: 'Завершить тренировку',
      confirmText: 'Завершить',
      confirmClass: 'btn-success'
    }))) return;
    this.stopTimer();
    this.stopRestTimer();
    this.exercisePhase = 'idle';
    (this.currentSession.exercises || []).forEach((ex, index) => {
      if (this.exerciseTimers[index]) this.stopExerciseTimer(index);
      ex.exerciseTime = this.exerciseTimes[index] || ex.exerciseTime || 0;
      ex.completed = true;
    });
    this.currentSession.endTime = new Date().toISOString();
    this.currentSession.duration = Math.floor(
      (new Date(this.currentSession.endTime) - new Date(this.currentSession.startTime)) / 1000
    );
    this.currentSession.completed = true;

    try {
      await Api.upsertSession(this.currentSession);
      // Remove plan for that day if any
      try {
        await Api.deletePlanned(this.currentSession.date);
      } catch (_) { /* ok */ }
    } catch (e) {
      Utils.showToast('Не удалось сохранить в облако: ' + e.message, 'danger');
      await DB.saveActiveSession(this.currentSession);
      return;
    }

    await DB.clearActiveSession();
    Utils.showToast('Тренировка сохранена · коуч обновит разбор');

    const finishedSession = this.currentSession;
    this.stopAllExerciseTimers();
    this.currentSession = null;
    this.exerciseTimes = {};
    this.activeExerciseIndex = null;
    this.openExerciseIndex = null;
    this.sessionView = 'list';

    if (window.Onboarding?.promptBodyWeightAfterWorkout) {
      await Onboarding.promptBodyWeightAfterWorkout(finishedSession);
    }

    // After inbox epoch changes — offer coach, don't force
    const openCoach = await Utils.confirm(
      'Открыть коуча с обновлённым разбором?',
      {
        title: 'Тренировка сохранена',
        confirmText: 'К коучу',
        cancelText: 'К истории',
        confirmClass: 'btn-primary'
      }
    );
    Router.navigate(openCoach ? 'progress-insights' : 'history');
  }

  static startExerciseTimer(exerciseIndex) {
    if (!this.currentSession.exercises[exerciseIndex]?.completed) {
      this.activeExerciseIndex = exerciseIndex;
    }
    if (this.exerciseTimers[exerciseIndex]) clearInterval(this.exerciseTimers[exerciseIndex]);
    if (!this.exerciseTimes[exerciseIndex]) this.exerciseTimes[exerciseIndex] = 0;
    this.exerciseTimers[exerciseIndex] = setInterval(() => {
      this.exerciseTimes[exerciseIndex]++;
      const formatted = Utils.formatTime(this.exerciseTimes[exerciseIndex]);
      if (this.sessionView === 'exercise' && this.openExerciseIndex === exerciseIndex) {
        document.querySelectorAll('#timer-display').forEach((el) => {
          el.textContent = formatted;
        });
      }
      if (this.currentSession?.exercises[exerciseIndex]) {
        this.currentSession.exercises[exerciseIndex].exerciseTime = this.exerciseTimes[exerciseIndex];
      }
      DB.saveActiveSession(this.currentSession);
    }, 1000);
  }

  static stopExerciseTimer(exerciseIndex) {
    if (this.exerciseTimers[exerciseIndex]) {
      clearInterval(this.exerciseTimers[exerciseIndex]);
      this.exerciseTimers[exerciseIndex] = null;
      if (this.currentSession?.exercises[exerciseIndex]) {
        this.currentSession.exercises[exerciseIndex].exerciseTime = this.exerciseTimes[exerciseIndex] || 0;
        this.persist(true);
      }
    }
  }

  static toggleExerciseTimer(exerciseIndex) {
    if (this.currentSession.exercises[exerciseIndex]?.completed) {
      Utils.showToast('Упражнение уже завершено', 'warning');
      return;
    }
    if (this.exerciseTimers[exerciseIndex]) this.stopExerciseTimer(exerciseIndex);
    else this.startExerciseTimer(exerciseIndex);
  }

  static restoreExerciseTimers() {
    (this.currentSession.exercises || []).forEach((ex, index) => {
      this.exerciseTimes[index] = ex.exerciseTime || 0;
    });
  }
}

window.WorkoutManager = WorkoutManager;
