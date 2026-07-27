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

    this.currentSession = session;
    this.startTime = new Date(session.startTime);
    this.exerciseTimers = {};
    this.exerciseTimes = {};
    this.restoreExerciseTimers();
    this.startTimer();
    await this.renderActiveWorkout();
  }

  static startTimer() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      this.elapsedSeconds = Math.floor((Date.now() - this.startTime.getTime()) / 1000);
      const el = document.getElementById('timer-display');
      if (el) el.textContent = Utils.formatTime(this.elapsedSeconds);
    }, 1000);
  }

  static stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  static async renderActiveWorkout() {
    if (!this.currentSession) return;
    const container = document.getElementById('app');
    let allExercises = [];
    try {
      allExercises = await Api.listExercises();
      await DB.cacheExercises(allExercises);
    } catch (_) {
      allExercises = (await DB.loadExercisesCache()) || [];
    }

    const exercisesHTML = (this.currentSession.exercises || []).length
      ? this.currentSession.exercises.map((ex, index) => {
        const info = allExercises.find((e) => e.id === ex.exerciseId);
        const name = info ? info.name : 'Неизвестное упражнение';
        const isBw = info && info.type === 'Собственный вес';
        const timerValue = this.exerciseTimes[index] || ex.exerciseTime || 0;
        const running = !!this.exerciseTimers[index];
        return `
          <div class="card mb-3 ${ex.completed ? 'border-success' : ''}">
            <div class="card-header d-flex justify-content-between align-items-center flex-wrap gap-2">
              <h6 class="mb-0">${Utils.escapeHtml(name)}</h6>
              <div class="d-flex align-items-center gap-2">
                <span class="badge bg-info" id="exercise-timer-${index}">${Utils.formatTime(timerValue)}</span>
                ${!ex.completed ? `
                  <button class="btn btn-sm ${running ? 'btn-danger' : 'btn-outline-primary'}"
                    id="timer-btn-${index}"
                    onclick="WorkoutManager.toggleExerciseTimer(${index})">
                    ${running ? 'Стоп' : 'Старт'}
                  </button>
                ` : `<span class="badge bg-success">Готово</span>`}
              </div>
            </div>
            <div class="card-body">
              ${isBw ? '<div class="small text-muted mb-2">Доп. вес · 0 = без довеска</div>' : ''}
              <div class="sets-list" id="sets-${index}">${this.renderSets(ex, index, { isBodyweight: isBw })}</div>
              <div class="mt-2 d-flex flex-wrap gap-2">
                <button class="btn btn-sm btn-outline-light" onclick="WorkoutManager.addSet(${index})">
                  <i class="bi bi-plus"></i> Подход
                </button>
                <button class="btn btn-sm btn-outline-info" onclick="WorkoutManager.repeatLastSet(${index})">
                  <i class="bi bi-arrow-repeat"></i> Как прошлый
                </button>
                ${!ex.completed
                  ? `<button class="btn btn-sm btn-outline-success" onclick="WorkoutManager.completeExercise(${index})">Завершить</button>`
                  : `<button class="btn btn-sm btn-outline-warning" onclick="WorkoutManager.uncompleteExercise(${index})">Вернуть</button>`}
              </div>
            </div>
          </div>
        `;
      }).join('')
      : '<div class="text-center py-4"><p class="text-muted">Нет упражнений</p></div>';

    container.innerHTML = `
      <div class="app-header fade-in">
        <div class="d-flex justify-content-between align-items-center">
          <h4 class="mb-0">${Utils.escapeHtml(this.currentSession.templateName || 'Тренировка')}</h4>
          <div class="timer-display" id="timer-display">00:00</div>
        </div>
      </div>
      <div class="container fade-in">
        <div class="card mb-3">
          <div class="card-body">
            <label class="form-label">Заметка</label>
            <input type="text" class="form-control" id="session-notes"
              value="${Utils.escapeHtml(this.currentSession.notes || '')}"
              placeholder="Как прошло...">
          </div>
        </div>
        <div id="rest-timer-bar" class="rest-timer-bar d-none mb-3">
          <div class="d-flex justify-content-between align-items-center">
            <span>Отдых</span>
            <strong id="rest-timer-value">01:30</strong>
            <button class="btn btn-sm btn-outline-light" onclick="WorkoutManager.stopRestTimer()">Стоп</button>
          </div>
          <div class="progress mt-2" style="height:6px">
            <div class="progress-bar bg-info" id="rest-timer-progress" style="width:100%"></div>
          </div>
        </div>
        ${exercisesHTML}
        <button class="btn btn-outline-primary w-100 mt-3" onclick="WorkoutManager.showAddExerciseModal()">
          <i class="bi bi-plus-circle"></i> Добавить упражнение
        </button>
        <div class="mt-4 mb-4">
          <button class="btn btn-danger w-100" id="finish-workout-btn">
            <i class="bi bi-flag"></i> Завершить тренировку
          </button>
        </div>
      </div>
      ${Utils.bottomNav('home')}
    `;

    document.getElementById('finish-workout-btn').addEventListener('click', () => this.finishWorkout());
    document.getElementById('session-notes').addEventListener('change', async (e) => {
      this.currentSession.notes = e.target.value;
      await this.persist(true);
    });

    this.elapsedSeconds = Math.floor((Date.now() - this.startTime.getTime()) / 1000);
    const timerDisplay = document.getElementById('timer-display');
    if (timerDisplay) timerDisplay.textContent = Utils.formatTime(this.elapsedSeconds);
  }

  static renderSets(exercise, exerciseIndex, options = {}) {
    if (!exercise.sets || !exercise.sets.length) {
      return '<p class="text-muted small mb-0">Нет подходов</p>';
    }
    const weightPh = options.isBodyweight ? 'доп. кг' : 'кг';
    return exercise.sets.map((set, setIndex) => `
      <div class="set-row">
        <div class="row align-items-center g-1">
          <div class="col-2"><span class="set-number">#${setIndex + 1}</span></div>
          <div class="col-4">
            <input type="number" class="form-control form-control-sm" placeholder="${weightPh}"
              value="${set.weight || ''}"
              title="${options.isBodyweight ? 'Доп. вес (0 = без довеска)' : 'Вес, кг'}"
              onchange="WorkoutManager.updateSet(${exerciseIndex}, ${setIndex}, 'weight', this.value)">
          </div>
          <div class="col-4">
            <input type="number" class="form-control form-control-sm" placeholder="повт"
              value="${set.reps || ''}"
              onchange="WorkoutManager.updateSet(${exerciseIndex}, ${setIndex}, 'reps', this.value)">
          </div>
          <div class="col-2">
            <button class="btn btn-sm btn-outline-danger"
              onclick="WorkoutManager.removeSet(${exerciseIndex}, ${setIndex})">
              <i class="bi bi-x"></i>
            </button>
          </div>
        </div>
      </div>
    `).join('');
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

  static addSet(exerciseIndex) {
    const ex = this.currentSession.exercises[exerciseIndex];
    if (!ex.sets) ex.sets = [];
    const last = ex.sets[ex.sets.length - 1];
    ex.sets.push({
      weight: last ? last.weight : 0,
      reps: last ? last.reps : 0
    });
    this.startRestTimer(90);
    this.saveAndRender();
  }

  static repeatLastSet(exerciseIndex) {
    const ex = this.currentSession.exercises[exerciseIndex];
    if (!ex.sets) ex.sets = [];
    const last = ex.sets[ex.sets.length - 1];
    if (!last) {
      Utils.showToast('Нет предыдущего подхода', 'warning');
      return;
    }
    ex.sets.push({ weight: last.weight, reps: last.reps });
    this.startRestTimer(90);
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
    if (this.exerciseTimers[exerciseIndex]) this.stopExerciseTimer(exerciseIndex);
    const exercise = this.currentSession.exercises[exerciseIndex];
    exercise.exerciseTime = this.exerciseTimes[exerciseIndex] || exercise.exerciseTime || 0;
    exercise.completed = true;
    this.saveAndRender();
  }

  static uncompleteExercise(exerciseIndex) {
    const exercise = this.currentSession.exercises[exerciseIndex];
    exercise.completed = false;
    this.exerciseTimes[exerciseIndex] = exercise.exerciseTime || 0;
    this.saveAndRender();
  }

  static startRestTimer(seconds = 90) {
    this.stopRestTimer();
    this.restSecondsLeft = seconds;
    const total = seconds;
    const bar = document.getElementById('rest-timer-bar');
    if (bar) bar.classList.remove('d-none');
    this.restInterval = setInterval(() => {
      this.restSecondsLeft -= 1;
      const val = document.getElementById('rest-timer-value');
      const prog = document.getElementById('rest-timer-progress');
      if (val) val.textContent = Utils.formatTime(this.restSecondsLeft);
      if (prog) prog.style.width = `${Math.max(0, (this.restSecondsLeft / total) * 100)}%`;
      if (this.restSecondsLeft <= 0) {
        this.stopRestTimer();
        Utils.showToast('Отдых закончен');
      }
    }, 1000);
    const val = document.getElementById('rest-timer-value');
    if (val) val.textContent = Utils.formatTime(seconds);
  }

  static stopRestTimer() {
    if (this.restInterval) {
      clearInterval(this.restInterval);
      this.restInterval = null;
    }
    const bar = document.getElementById('rest-timer-bar');
    if (bar) bar.classList.add('d-none');
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
    this.currentSession = null;
    this.exerciseTimers = {};
    this.exerciseTimes = {};

    if (window.Onboarding?.promptBodyWeightAfterWorkout) {
      await Onboarding.promptBodyWeightAfterWorkout(finishedSession);
    }

    Router.navigate('history');
  }

  static startExerciseTimer(exerciseIndex) {
    if (this.exerciseTimers[exerciseIndex]) clearInterval(this.exerciseTimers[exerciseIndex]);
    if (!this.exerciseTimes[exerciseIndex]) this.exerciseTimes[exerciseIndex] = 0;
    this.exerciseTimers[exerciseIndex] = setInterval(() => {
      this.exerciseTimes[exerciseIndex]++;
      const el = document.getElementById(`exercise-timer-${exerciseIndex}`);
      if (el) el.textContent = Utils.formatTime(this.exerciseTimes[exerciseIndex]);
      if (this.currentSession?.exercises[exerciseIndex]) {
        this.currentSession.exercises[exerciseIndex].exerciseTime = this.exerciseTimes[exerciseIndex];
      }
      // Persist draft locally often; cloud throttled in persist()
      DB.saveActiveSession(this.currentSession);
    }, 1000);
    this.updateExerciseTimerButton(exerciseIndex, true);
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
