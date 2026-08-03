class WorkoutManager {
  static currentSession = null;
  static timerInterval = null;
  static startTime = null;
  static elapsedSeconds = 0;
  static exerciseTimers = {};
  static exerciseTimes = {};
  static lastPersistAt = 0;
  static restInterval = null;
  static restSecondsLeft = 0;
  static restTotalSeconds = 0;
  static restPreset = 90;
  /** Index of the exercise the user is currently working on (null = none). */
  static activeExerciseIndex = null;
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

    this.startTimer();
    await this.renderActiveWorkout();
  }

  static minimizeSession() {
    this.pauseSessionUi();
    Utils.showToast('Тренировка свёрнута — продолжить можно с главной', 'info');
    Router.navigate('home');
  }

  static getActiveExercise() {
    const idx = this.activeExerciseIndex;
    if (idx == null || !this.currentSession?.exercises?.[idx]) return null;
    return { index: idx, exercise: this.currentSession.exercises[idx] };
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
      document.querySelectorAll('#timer-display, #session-dock-timer').forEach((el) => {
        el.textContent = Utils.formatTime(this.elapsedSeconds);
      });
    }, 1000);
  }

  static stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  static renderFocusDock() {
    const active = this.getActiveExercise();
    const resting = this.restSecondsLeft > 0 && !!this.restInterval;
    const presets = [60, 90, 120];

    if (!active) {
      return `
        <div class="session-dock session-dock-idle">
          <div class="session-dock-idle-text">Выбери упражнение в списке или добавь новое</div>
          <div class="session-dock-rest-presets">
            ${presets.map((s) => `
              <button type="button" class="btn btn-sm ${this.restPreset === s ? 'btn-info' : 'btn-outline-light'}"
                onclick="WorkoutManager.setRestPreset(${s})">${s}с</button>
            `).join('')}
            <button type="button" class="btn btn-sm btn-outline-info" onclick="WorkoutManager.startRestTimer()">
              Отдых
            </button>
          </div>
        </div>
      `;
    }

    const { index, exercise } = active;
    const name = this.exerciseName(exercise.exerciseId);
    const running = !!this.exerciseTimers[index];
    const timerValue = this.exerciseTimes[index] || exercise.exerciseTime || 0;
    const setsCount = exercise.sets?.length || 0;
    const restPct = this.restTotalSeconds
      ? Math.max(0, (this.restSecondsLeft / this.restTotalSeconds) * 100)
      : 0;

    return `
      <div class="session-dock ${resting ? 'is-resting' : ''}">
        <div class="session-dock-top">
          <div class="session-dock-label">Сейчас</div>
          <div class="session-dock-title">${Utils.escapeHtml(name)}</div>
          <div class="session-dock-meta">${setsCount} ${this.pluralSets(setsCount)}</div>
        </div>
        <div class="session-dock-timers">
          <div class="session-dock-timer-block">
            <span class="session-dock-timer-label">Упражнение</span>
            <div class="session-dock-timer-row">
              <strong id="dock-ex-timer">${Utils.formatTime(timerValue)}</strong>
              <button type="button" class="btn btn-sm ${running ? 'btn-danger' : 'btn-outline-light'}"
                id="dock-ex-timer-btn"
                onclick="WorkoutManager.toggleExerciseTimer(${index})">
                ${running ? 'Стоп' : 'Старт'}
              </button>
            </div>
          </div>
          <div class="session-dock-timer-block">
            <span class="session-dock-timer-label">Отдых</span>
            <div class="session-dock-timer-row">
              <strong id="rest-timer-value">${Utils.formatTime(resting ? this.restSecondsLeft : this.restPreset)}</strong>
              ${resting
                ? `<button type="button" class="btn btn-sm btn-outline-light" onclick="WorkoutManager.stopRestTimer()">Сброс</button>`
                : `<button type="button" class="btn btn-sm btn-outline-info" onclick="WorkoutManager.startRestTimer()">Старт</button>`}
            </div>
            <div class="progress session-rest-progress ${resting ? '' : 'd-none'}" id="rest-timer-bar-progress" style="height:4px">
              <div class="progress-bar bg-info" id="rest-timer-progress" style="width:${restPct}%"></div>
            </div>
            <div class="session-dock-rest-presets mt-2">
              ${presets.map((s) => `
                <button type="button" class="btn btn-sm ${this.restPreset === s ? 'btn-info' : 'btn-outline-light'}"
                  onclick="WorkoutManager.setRestPreset(${s})">${s}с</button>
              `).join('')}
            </div>
          </div>
        </div>
        <div class="session-dock-actions">
          <button type="button" class="btn btn-outline-light flex-fill" onclick="WorkoutManager.addSet(${index})">
            <i class="bi bi-plus-lg"></i> Подход
          </button>
          <button type="button" class="btn btn-outline-info flex-fill" onclick="WorkoutManager.repeatLastSet(${index})">
            <i class="bi bi-arrow-repeat"></i>
          </button>
          <button type="button" class="btn btn-success flex-fill" onclick="WorkoutManager.completeExercise(${index})">
            Готово
          </button>
        </div>
      </div>
    `;
  }

  static pluralSets(n) {
    const m10 = n % 10;
    const m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return 'подход';
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'подхода';
    return 'подходов';
  }

  static async renderActiveWorkout() {
    if (!this.currentSession) return;
    const container = document.getElementById('app');
    try {
      this.exerciseCatalog = await Api.listExercises();
      await DB.cacheExercises(this.exerciseCatalog);
    } catch (_) {
      this.exerciseCatalog = (await DB.loadExercisesCache()) || [];
    }

    const { done, total } = this.sessionProgress();
    const progressPct = total ? Math.round((done / total) * 100) : 0;
    const resting = this.restSecondsLeft > 0 && !!this.restInterval;

    const exercisesHTML = (this.currentSession.exercises || []).length
      ? this.currentSession.exercises.map((ex, index) => {
        const name = this.exerciseName(ex.exerciseId);
        const isBw = this.isBodyweight(ex.exerciseId);
        const timerValue = this.exerciseTimes[index] || ex.exerciseTime || 0;
        const running = !!this.exerciseTimers[index];
        const isCurrent = !ex.completed && this.activeExerciseIndex === index;
        const stateClass = ex.completed
          ? 'border-success workout-ex-done'
          : (isCurrent ? 'border-info workout-ex-current' : '');
        const stateBadge = ex.completed
          ? '<span class="badge bg-success">Готово</span>'
          : (isCurrent ? '<span class="badge bg-info workout-ex-current-badge">Сейчас</span>' : '');
        return `
          <div class="card mb-3 workout-ex-card ${stateClass}" data-exercise-index="${index}"
            onclick="WorkoutManager.onExerciseCardClick(${index}, event)">
            <div class="card-header d-flex justify-content-between align-items-center flex-wrap gap-2">
              <h6 class="mb-0">${Utils.escapeHtml(name)}</h6>
              <div class="d-flex align-items-center gap-2">
                ${stateBadge}
                <span class="badge bg-secondary" id="exercise-timer-${index}">${Utils.formatTime(timerValue)}</span>
                ${!ex.completed ? `
                  <button class="btn btn-sm ${running ? 'btn-danger' : 'btn-outline-primary'}"
                    id="timer-btn-${index}"
                    onclick="event.stopPropagation(); WorkoutManager.toggleExerciseTimer(${index})">
                    ${running ? 'Стоп' : 'Старт'}
                  </button>
                ` : ''}
              </div>
            </div>
            <div class="card-body">
              ${isBw ? '<div class="small text-muted mb-2">Доп. вес · 0 = без довеска</div>' : ''}
              <div class="sets-list" id="sets-${index}">${this.renderSets(ex, index, { isBodyweight: isBw })}</div>
              <div class="mt-2 d-flex flex-wrap gap-2">
                <button class="btn btn-sm btn-outline-light" onclick="event.stopPropagation(); WorkoutManager.addSet(${index})">
                  <i class="bi bi-plus"></i> Подход
                </button>
                <button class="btn btn-sm btn-outline-info" onclick="event.stopPropagation(); WorkoutManager.repeatLastSet(${index})">
                  <i class="bi bi-arrow-repeat"></i> Как прошлый
                </button>
                ${!ex.completed
                  ? `<button class="btn btn-sm btn-outline-success" onclick="event.stopPropagation(); WorkoutManager.completeExercise(${index})">Завершить</button>`
                  : `<button class="btn btn-sm btn-outline-warning" onclick="event.stopPropagation(); WorkoutManager.uncompleteExercise(${index})">Вернуть</button>`}
              </div>
            </div>
          </div>
        `;
      }).join('')
      : '<div class="text-center py-4 session-empty"><p class="text-muted mb-3">Нет упражнений</p></div>';

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

        <div class="session-scroll">
          <div class="container session-container">
            <div class="session-notes card mb-3">
              <div class="card-body py-2">
                <input type="text" class="form-control form-control-sm border-0 bg-transparent px-0"
                  id="session-notes"
                  value="${Utils.escapeHtml(this.currentSession.notes || '')}"
                  placeholder="Заметка к тренировке…">
              </div>
            </div>
            ${exercisesHTML}
            <button class="btn btn-outline-light w-100 mt-2" onclick="WorkoutManager.showAddExerciseModal()">
              <i class="bi bi-plus-circle"></i> Добавить упражнение
            </button>
            <div class="mt-3 mb-2">
              <button class="btn btn-danger w-100" id="finish-workout-btn">
                <i class="bi bi-flag"></i> Завершить тренировку
              </button>
            </div>
          </div>
        </div>

        <div id="rest-timer-bar" class="${resting ? '' : 'd-none'}" aria-hidden="true"></div>
        ${this.renderFocusDock()}
      </div>
    `;

    document.getElementById('finish-workout-btn')?.addEventListener('click', () => this.finishWorkout());
    document.getElementById('session-notes')?.addEventListener('change', async (e) => {
      this.currentSession.notes = e.target.value;
      await this.persist(true);
    });

    this.elapsedSeconds = Math.floor((Date.now() - this.startTime.getTime()) / 1000);
    document.querySelectorAll('#timer-display').forEach((el) => {
      el.textContent = Utils.formatTime(this.elapsedSeconds);
    });

    // Keep sticky current card in view after re-render
    const currentCard = container.querySelector('.workout-ex-current');
    if (currentCard) {
      requestAnimationFrame(() => {
        currentCard.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      });
    }
  }

  static renderSets(exercise, exerciseIndex, options = {}) {
    if (!exercise.sets || !exercise.sets.length) {
      return '<p class="text-muted small mb-0">Нет подходов — добавь из панели ниже</p>';
    }
    const weightPh = options.isBodyweight ? 'доп.' : 'кг';
    const weightStep = options.isBodyweight ? 1 : 2.5;
    return exercise.sets.map((set, setIndex) => `
      <div class="set-row">
        <span class="set-number">#${setIndex + 1}</span>
        <div class="set-stepper" title="${options.isBodyweight ? 'Доп. вес' : 'Вес'}">
          <button type="button" class="btn btn-sm btn-outline-light set-step-btn"
            onclick="event.stopPropagation(); WorkoutManager.nudgeSet(${exerciseIndex}, ${setIndex}, 'weight', ${-weightStep})">−</button>
          <input type="number" class="form-control form-control-sm set-step-input" placeholder="${weightPh}"
            value="${set.weight ?? ''}"
            inputmode="decimal"
            onchange="WorkoutManager.updateSet(${exerciseIndex}, ${setIndex}, 'weight', this.value)">
          <button type="button" class="btn btn-sm btn-outline-light set-step-btn"
            onclick="event.stopPropagation(); WorkoutManager.nudgeSet(${exerciseIndex}, ${setIndex}, 'weight', ${weightStep})">+</button>
        </div>
        <div class="set-stepper" title="Повторы">
          <button type="button" class="btn btn-sm btn-outline-light set-step-btn"
            onclick="event.stopPropagation(); WorkoutManager.nudgeSet(${exerciseIndex}, ${setIndex}, 'reps', -1)">−</button>
          <input type="number" class="form-control form-control-sm set-step-input" placeholder="повт"
            value="${set.reps ?? ''}"
            inputmode="numeric"
            onchange="WorkoutManager.updateSet(${exerciseIndex}, ${setIndex}, 'reps', this.value)">
          <button type="button" class="btn btn-sm btn-outline-light set-step-btn"
            onclick="event.stopPropagation(); WorkoutManager.nudgeSet(${exerciseIndex}, ${setIndex}, 'reps', 1)">+</button>
        </div>
        <button type="button" class="btn btn-sm btn-outline-danger set-remove-btn"
          onclick="event.stopPropagation(); WorkoutManager.removeSet(${exerciseIndex}, ${setIndex})">
          <i class="bi bi-x"></i>
        </button>
      </div>
    `).join('');
  }

  static nudgeSet(exerciseIndex, setIndex, field, delta) {
    const set = this.currentSession?.exercises?.[exerciseIndex]?.sets?.[setIndex];
    if (!set) return;
    const current = Number(set[field]) || 0;
    let next = current + Number(delta);
    if (field === 'reps') next = Math.max(0, Math.round(next));
    else next = Math.max(0, Math.round(next * 10) / 10);
    set[field] = next;
    this.focusExercise(exerciseIndex);
    this.persist(false);
    this.saveAndRender();
  }

  static async persist(forceCloud = false) {
    if (!this.currentSession) return;
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
  }

  static async saveAndRender() {
    await this.persist(false);
    await this.renderActiveWorkout();
  }

  static onExerciseCardClick(exerciseIndex, event) {
    const tag = event?.target?.tagName;
    if (tag === 'INPUT' || tag === 'BUTTON' || event?.target?.closest?.('button, input')) return;
    if (this.activeExerciseIndex === exerciseIndex) return;
    this.focusExercise(exerciseIndex);
    this.saveAndRender();
  }

  static addSet(exerciseIndex) {
    this.focusExercise(exerciseIndex);
    const ex = this.currentSession.exercises[exerciseIndex];
    if (!ex.sets) ex.sets = [];
    const last = ex.sets[ex.sets.length - 1];
    ex.sets.push({
      weight: last ? last.weight : 0,
      reps: last ? last.reps : 0
    });
    this.startRestTimer(this.restPreset);
    this.saveAndRender();
  }

  static repeatLastSet(exerciseIndex) {
    this.focusExercise(exerciseIndex);
    const ex = this.currentSession.exercises[exerciseIndex];
    if (!ex.sets) ex.sets = [];
    const last = ex.sets[ex.sets.length - 1];
    if (!last) {
      Utils.showToast('Нет предыдущего подхода', 'warning');
      return;
    }
    ex.sets.push({ weight: last.weight, reps: last.reps });
    this.startRestTimer(this.restPreset);
    this.saveAndRender();
  }

  static removeSet(exerciseIndex, setIndex) {
    this.currentSession.exercises[exerciseIndex].sets.splice(setIndex, 1);
    this.saveAndRender();
  }

  static updateSet(exerciseIndex, setIndex, field, value) {
    this.currentSession.exercises[exerciseIndex].sets[setIndex][field] = parseFloat(value) || 0;
    this.persist(false);
  }

  static completeExercise(exerciseIndex) {
    // Always clear — even if the map entry was lost after a resume bug
    if (this.exerciseTimers[exerciseIndex]) {
      clearInterval(this.exerciseTimers[exerciseIndex]);
      this.exerciseTimers[exerciseIndex] = null;
    }
    this.stopExerciseTimer(exerciseIndex);
    const exercise = this.currentSession.exercises[exerciseIndex];
    exercise.exerciseTime = this.exerciseTimes[exerciseIndex] || exercise.exerciseTime || 0;
    exercise.completed = true;

    if (this.activeExerciseIndex === exerciseIndex) {
      const next = (this.currentSession.exercises || []).findIndex(
        (ex, i) => i > exerciseIndex && !ex.completed
      );
      const fallback = (this.currentSession.exercises || []).findIndex((ex) => !ex.completed);
      this.activeExerciseIndex = next >= 0 ? next : (fallback >= 0 ? fallback : null);
    }
    this.saveAndRender();
  }

  static uncompleteExercise(exerciseIndex) {
    const exercise = this.currentSession.exercises[exerciseIndex];
    exercise.completed = false;
    this.exerciseTimes[exerciseIndex] = exercise.exerciseTime || 0;
    this.focusExercise(exerciseIndex);
    this.saveAndRender();
  }

  static setRestPreset(seconds) {
    this.restPreset = Number(seconds) || 90;
    if (this.restInterval) {
      this.startRestTimer(this.restPreset);
    } else {
      const val = document.getElementById('rest-timer-value');
      if (val) val.textContent = Utils.formatTime(this.restPreset);
      document.querySelectorAll('.session-dock-rest-presets .btn').forEach((btn) => {
        const sec = Number((btn.textContent || '').replace('с', ''));
        const isPreset = sec === this.restPreset;
        btn.classList.toggle('btn-info', isPreset);
        btn.classList.toggle('btn-outline-light', !isPreset);
      });
    }
  }

  static startRestTimer(seconds = this.restPreset) {
    this.stopRestTimer(false);
    const total = Number(seconds) || this.restPreset || 90;
    this.restPreset = total;
    this.restTotalSeconds = total;
    this.restSecondsLeft = total;

    const showRestUi = () => {
      const progWrap = document.getElementById('rest-timer-bar-progress');
      progWrap?.classList.remove('d-none');
      const dock = document.querySelector('.session-dock');
      dock?.classList.add('is-resting');
      const val = document.getElementById('rest-timer-value');
      if (val) val.textContent = Utils.formatTime(this.restSecondsLeft);
      const prog = document.getElementById('rest-timer-progress');
      if (prog) prog.style.width = '100%';
    };
    showRestUi();

    this.restInterval = setInterval(() => {
      this.restSecondsLeft -= 1;
      const val = document.getElementById('rest-timer-value');
      const prog = document.getElementById('rest-timer-progress');
      if (val) val.textContent = Utils.formatTime(Math.max(0, this.restSecondsLeft));
      if (prog && this.restTotalSeconds) {
        prog.style.width = `${Math.max(0, (this.restSecondsLeft / this.restTotalSeconds) * 100)}%`;
      }
      if (this.restSecondsLeft <= 0) {
        this.stopRestTimer(true);
        this.buzz();
        Utils.showToast('Отдых закончен');
      }
    }, 1000);
  }

  static stopRestTimer(fromComplete = false) {
    if (this.restInterval) {
      clearInterval(this.restInterval);
      this.restInterval = null;
    }
    this.restSecondsLeft = 0;
    this.restTotalSeconds = 0;
    const progWrap = document.getElementById('rest-timer-bar-progress');
    progWrap?.classList.add('d-none');
    document.querySelector('.session-dock')?.classList.remove('is-resting');
    const bar = document.getElementById('rest-timer-bar');
    if (bar) bar.classList.add('d-none');
    if (!fromComplete) {
      const val = document.getElementById('rest-timer-value');
      if (val) val.textContent = Utils.formatTime(this.restPreset);
    }
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
    Utils.showToast('Тренировка сохранена в облаке');

    const finishedSession = this.currentSession;
    this.stopAllExerciseTimers();
    this.currentSession = null;
    this.exerciseTimes = {};
    this.activeExerciseIndex = null;

    if (window.Onboarding?.promptBodyWeightAfterWorkout) {
      await Onboarding.promptBodyWeightAfterWorkout(finishedSession);
    }

    Router.navigate('history');
  }

  static startExerciseTimer(exerciseIndex) {
    this.focusExercise(exerciseIndex);
    if (this.exerciseTimers[exerciseIndex]) clearInterval(this.exerciseTimers[exerciseIndex]);
    if (!this.exerciseTimes[exerciseIndex]) this.exerciseTimes[exerciseIndex] = 0;
    this.exerciseTimers[exerciseIndex] = setInterval(() => {
      this.exerciseTimes[exerciseIndex]++;
      const formatted = Utils.formatTime(this.exerciseTimes[exerciseIndex]);
      const el = document.getElementById(`exercise-timer-${exerciseIndex}`);
      if (el) el.textContent = formatted;
      const dock = document.getElementById('dock-ex-timer');
      if (dock && this.activeExerciseIndex === exerciseIndex) dock.textContent = formatted;
      if (this.currentSession?.exercises[exerciseIndex]) {
        this.currentSession.exercises[exerciseIndex].exerciseTime = this.exerciseTimes[exerciseIndex];
      }
      DB.saveActiveSession(this.currentSession);
    }, 1000);
    this.updateExerciseTimerButton(exerciseIndex, true);
    const dockBtn = document.getElementById('dock-ex-timer-btn');
    if (dockBtn && this.activeExerciseIndex === exerciseIndex) {
      dockBtn.textContent = 'Стоп';
      dockBtn.className = 'btn btn-sm btn-danger';
    }
  }

  static stopExerciseTimer(exerciseIndex) {
    if (this.exerciseTimers[exerciseIndex]) {
      clearInterval(this.exerciseTimers[exerciseIndex]);
      this.exerciseTimers[exerciseIndex] = null;
      if (this.currentSession?.exercises[exerciseIndex]) {
        this.currentSession.exercises[exerciseIndex].exerciseTime = this.exerciseTimes[exerciseIndex] || 0;
        this.persist(true);
      }
      this.updateExerciseTimerButton(exerciseIndex, false);
      const dockBtn = document.getElementById('dock-ex-timer-btn');
      if (dockBtn && this.activeExerciseIndex === exerciseIndex) {
        dockBtn.textContent = 'Старт';
        dockBtn.className = 'btn btn-sm btn-outline-light';
      }
    }
  }

  static toggleExerciseTimer(exerciseIndex) {
    if (this.currentSession.exercises[exerciseIndex]?.completed) {
      Utils.showToast('Упражнение уже завершено', 'warning');
      return;
    }
    if (this.exerciseTimers[exerciseIndex]) {
      this.stopExerciseTimer(exerciseIndex);
      return;
    }
    const focusChanged = this.activeExerciseIndex !== exerciseIndex;
    this.startExerciseTimer(exerciseIndex);
    if (focusChanged) this.saveAndRender();
  }

  static updateExerciseTimerButton(exerciseIndex, isRunning) {
    const button = document.getElementById(`timer-btn-${exerciseIndex}`);
    if (button) {
      button.textContent = isRunning ? 'Стоп' : 'Старт';
      button.className = `btn btn-sm ${isRunning ? 'btn-danger' : 'btn-outline-primary'}`;
    }
  }

  static restoreExerciseTimers() {
    (this.currentSession.exercises || []).forEach((ex, index) => {
      this.exerciseTimes[index] = ex.exerciseTime || 0;
    });
  }
}

window.WorkoutManager = WorkoutManager;
