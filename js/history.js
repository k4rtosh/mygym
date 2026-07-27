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
        <div class="text-center py-5">
          <i class="bi bi-calendar-x display-1 text-muted"></i>
          <p class="text-muted mt-3">История пуста</p>
        </div>
      `;
    } else {
      sessionsHTML = sessions.map((session) => {
        const duration = session.duration ? Utils.formatTime(session.duration) : 'Не завершена';
        const completed = !!session.endTime;
        const totalExerciseTime = (session.exercises || []).reduce((sum, ex) => sum + (ex.exerciseTime || 0), 0);
        return `
          <div class="card mb-3" onclick="Router.navigate('history-detail', {sessionId: '${session.id}'})">
            <div class="card-body">
              <div class="d-flex justify-content-between align-items-start">
                <div>
                  <h6 class="mb-1">${Utils.escapeHtml(session.templateName || 'Тренировка')}</h6>
                  <small class="text-muted">
                    ${Utils.formatDate(session.date + 'T12:00:00')} · ${Utils.getDayOfWeek(session.date)}
                  </small><br>
                  <small class="text-muted">
                    ${(session.exercises || []).length} упр. · ${duration}
                    ${totalExerciseTime ? ` · ${Utils.formatTime(totalExerciseTime)}` : ''}
                  </small>
                </div>
                <span class="badge ${completed ? 'bg-success' : 'bg-warning'}">
                  ${completed ? 'Завершена' : 'Черновик'}
                </span>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    container.innerHTML = `
      <div class="app-header fade-in"><h4>История</h4></div>
      <div class="container fade-in">${sessionsHTML}</div>
      ${Utils.bottomNav('home')}
    `;
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
    const totalExerciseTime = (session.exercises || []).reduce((sum, ex) => sum + (ex.exerciseTime || 0), 0);

    const exercisesHTML = (session.exercises || []).map((ex) => {
      const info = allExercises.find((e) => e.id === ex.exerciseId);
      const name = info ? info.name : 'Неизвестное';
      const isBw = info && info.type === 'Собственный вес';
      const weightCol = isBw ? 'Доп. вес' : 'Вес';
      const setsRows = (ex.sets || []).map((set, i) => `
        <tr><td>#${i + 1}</td><td>${set.weight || 0}</td><td>${set.reps || 0}</td></tr>
      `).join('');
      return `
        <div class="card mb-3">
          <div class="card-header d-flex justify-content-between">
            <h6 class="mb-0">${Utils.escapeHtml(name)}</h6>
            ${ex.exerciseTime ? `<span class="badge bg-info">${Utils.formatTime(ex.exerciseTime)}</span>` : ''}
          </div>
          <div class="card-body">
            ${setsRows ? `
              <table class="table table-dark table-sm">
                <thead><tr><th>Подход</th><th>${weightCol}</th><th>Повт.</th></tr></thead>
                <tbody>${setsRows}</tbody>
              </table>
            ` : '<p class="text-muted mb-0">Нет подходов</p>'}
          </div>
        </div>
      `;
    }).join('') || '<p class="text-muted">Нет упражнений</p>';

    document.getElementById('app').innerHTML = `
      <div class="app-header fade-in">
        <div class="d-flex align-items-center">
          <button class="btn btn-link text-white me-2" onclick="Router.navigate('history')">
            <i class="bi bi-arrow-left"></i>
          </button>
          <div>
            <h4 class="mb-0">${Utils.escapeHtml(session.templateName || 'Тренировка')}</h4>
            <small class="text-muted">${Utils.formatDate(session.date + 'T12:00:00')}</small>
          </div>
        </div>
      </div>
      <div class="container fade-in">
        <div class="card mb-3">
          <div class="card-body">
            <div class="row text-center">
              <div class="col-4"><small class="text-muted">Начало</small><br>${Utils.formatDateTime(session.startTime)}</div>
              <div class="col-4"><small class="text-muted">Длительность</small><br>${duration}</div>
              <div class="col-4"><small class="text-muted">Упражнения</small><br>${Utils.formatTime(totalExerciseTime)}</div>
            </div>
            ${session.notes ? `<p class="mt-3 mb-0"><strong>Заметка:</strong> ${Utils.escapeHtml(session.notes)}</p>` : ''}
          </div>
        </div>
        <h5 class="mb-3">Упражнения</h5>
        ${exercisesHTML}
        <button class="btn btn-outline-danger w-100 mt-3" onclick="HistoryManager.deleteSession('${session.id}')">
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
