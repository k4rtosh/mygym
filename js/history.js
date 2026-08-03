class HistoryManager {
  static async loadHistoryList() {
    const container = document.getElementById('app');
    let sessions = [];
    try {
      sessions = await Api.listSessions();
    } catch (e) {
      Utils.showToast(e.message, 'danger');
    }

    sessions.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));

    let sessionsHTML;
    if (!sessions.length) {
      sessionsHTML = `
        <div class="hist-empty text-center py-5">
          <i class="bi bi-calendar-x display-1 text-muted"></i>
          <p class="text-muted mt-3 mb-0">История пуста</p>
        </div>
      `;
    } else {
      sessionsHTML = `<div class="hist-list">${sessions.map((session) => {
        const duration = session.duration ? Utils.formatTime(session.duration) : 'Не завершена';
        const completed = !!session.endTime;
        const exerciseCount = (session.exercises || []).length;
        const totalExerciseTime = (session.exercises || []).reduce((sum, ex) => sum + (ex.exerciseTime || 0), 0);
        const stats = [
          `${exerciseCount} упр.`,
          duration,
          totalExerciseTime ? Utils.formatTime(totalExerciseTime) : null
        ].filter(Boolean).join(' · ');
        return `
          <button type="button" class="hist-list-item"
            onclick="Router.navigate('history-detail', {sessionId: '${session.id}'})">
            <div class="hist-list-main">
              <div class="hist-list-title">${Utils.escapeHtml(session.templateName || 'Тренировка')}</div>
              <div class="hist-list-date">
                ${Utils.formatDate(session.date + 'T12:00:00')} · ${Utils.getDayOfWeek(session.date)}
              </div>
              <div class="hist-list-stats">${stats}</div>
            </div>
            <span class="hist-list-badge ${completed ? 'is-done' : 'is-draft'}">
              ${completed ? 'Готово' : 'Черновик'}
            </span>
            <i class="bi bi-chevron-right hist-list-chevron" aria-hidden="true"></i>
          </button>
        `;
      }).join('')}</div>`;
    }

    container.innerHTML = `
      <div class="app-header fade-in"><h4>История</h4></div>
      <div class="container fade-in hist-page">${sessionsHTML}</div>
      ${Utils.bottomNav('home')}
    `;
  }

  static formatSetWeight(set, isBw) {
    if (set.weight == null || set.weight === '') {
      return isBw ? '—' : '0';
    }
    return String(set.weight);
  }

  static async loadHistoryDetail(sessionId) {
    let session;
    try {
      session = await Api.getSession(sessionId);
    } catch (e) {
      Utils.showToast(e.message, 'danger');
      Router.navigate('history');
      return;
    }
    if (!session) {
      Utils.showToast('Не найдено', 'danger');
      Router.navigate('history');
      return;
    }

    let allExercises = [];
    try {
      allExercises = await Api.listExercises();
    } catch (_) {
      allExercises = (await DB.loadExercisesCache()) || [];
    }

    const duration = session.duration ? Utils.formatTime(session.duration) : '—';
    const exerciseCount = (session.exercises || []).length;
    const totalExerciseTime = (session.exercises || []).reduce((sum, ex) => sum + (ex.exerciseTime || 0), 0);
    const totalSets = (session.exercises || []).reduce((sum, ex) => sum + (ex.sets?.length || 0), 0);

    const exercisesHTML = (session.exercises || []).map((ex, exIndex) => {
      const info = allExercises.find((e) => e.id === ex.exerciseId);
      const name = info ? info.name : 'Неизвестное';
      const isBw = info && info.type === 'Собственный вес';
      const weightLabel = isBw ? 'доп. кг' : 'кг';
      const sets = ex.sets || [];
      const setsBlock = sets.length
        ? `
          <div class="hist-sets">
            <div class="hist-sets-head">
              <span>Подход</span>
              <span>${weightLabel}</span>
              <span>повт.</span>
            </div>
            ${sets.map((set, i) => `
              <div class="hist-set-row">
                <span class="hist-set-num">#${i + 1}</span>
                <span class="hist-set-weight">${Utils.escapeHtml(this.formatSetWeight(set, isBw))}</span>
                <span class="hist-set-reps">${set.reps == null || set.reps === '' ? '—' : set.reps}</span>
              </div>
            `).join('')}
          </div>
        `
        : '<p class="hist-ex-empty mb-0">Нет подходов</p>';

      return `
        <article class="hist-ex-card">
          <div class="hist-ex-head">
            <div class="hist-ex-index">${exIndex + 1}</div>
            <div class="hist-ex-titles">
              <h6 class="hist-ex-name">${Utils.escapeHtml(name)}</h6>
              <div class="hist-ex-meta">
                ${sets.length} ${sets.length === 1 ? 'подход' : (sets.length >= 2 && sets.length <= 4 ? 'подхода' : 'подходов')}
                ${ex.exerciseTime ? ` · ${Utils.formatTime(ex.exerciseTime)}` : ''}
              </div>
            </div>
          </div>
          ${setsBlock}
        </article>
      `;
    }).join('') || '<p class="text-muted">Нет упражнений</p>';

    document.getElementById('app').innerHTML = `
      <div class="app-header fade-in">
        <div class="d-flex align-items-center">
          <button class="btn btn-link text-white me-2" onclick="Router.navigate('history')">
            <i class="bi bi-arrow-left"></i>
          </button>
          <div class="hist-detail-heading">
            <h4 class="mb-0">${Utils.escapeHtml(session.templateName || 'Тренировка')}</h4>
            <small class="text-muted">${Utils.formatDate(session.date + 'T12:00:00')}</small>
          </div>
        </div>
      </div>
      <div class="container fade-in hist-page hist-detail">
        <section class="hist-summary" aria-label="Сводка тренировки">
          <div class="hist-summary-row">
            <span class="hist-summary-label">Начало</span>
            <span class="hist-summary-value">${Utils.formatDateTime(session.startTime)}</span>
          </div>
          <div class="hist-summary-row">
            <span class="hist-summary-label">Длительность</span>
            <span class="hist-summary-value">${duration}</span>
          </div>
          <div class="hist-summary-row">
            <span class="hist-summary-label">Упражнения</span>
            <span class="hist-summary-value">${exerciseCount}</span>
          </div>
          <div class="hist-summary-row">
            <span class="hist-summary-label">Подходы</span>
            <span class="hist-summary-value">${totalSets}</span>
          </div>
          ${totalExerciseTime ? `
            <div class="hist-summary-row">
              <span class="hist-summary-label">Под нагрузкой</span>
              <span class="hist-summary-value">${Utils.formatTime(totalExerciseTime)}</span>
            </div>
          ` : ''}
          ${session.notes ? `
            <div class="hist-summary-note">
              <span class="hist-summary-label">Заметка</span>
              <p class="hist-summary-note-text mb-0">${Utils.escapeHtml(session.notes)}</p>
            </div>
          ` : ''}
        </section>

        <h5 class="hist-section-title">Упражнения</h5>
        <div class="hist-ex-list">${exercisesHTML}</div>

        <button class="btn btn-outline-danger w-100 mt-4 mb-2" onclick="HistoryManager.deleteSession('${session.id}')">
          <i class="bi bi-trash"></i> Удалить
        </button>
      </div>
      ${Utils.bottomNav('home')}
    `;
  }

  static async deleteSession(sessionId) {
    if (!(await Utils.confirm('Удалить тренировку?', {
      title: 'Удалить тренировку',
      confirmText: 'Удалить',
      confirmClass: 'btn-danger'
    }))) return;
    try {
      await Api.deleteSession(sessionId);
      Utils.showToast('Удалено');
      Router.navigate('history');
    } catch (e) {
      Utils.showToast(e.message, 'danger');
    }
  }
}

window.HistoryManager = HistoryManager;
