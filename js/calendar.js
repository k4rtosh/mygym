class CalendarManager {
  static viewYear = null;
  static viewMonth = null; // 0-11

  static async load() {
    const now = new Date();
    if (this.viewYear == null) this.viewYear = now.getFullYear();
    if (this.viewMonth == null) this.viewMonth = now.getMonth();
    await this.render();
  }

  static shiftMonth(delta) {
    this.viewMonth += delta;
    if (this.viewMonth > 11) {
      this.viewMonth = 0;
      this.viewYear += 1;
    } else if (this.viewMonth < 0) {
      this.viewMonth = 11;
      this.viewYear -= 1;
    }
    this.render();
  }

  static monthBounds() {
    const from = new Date(this.viewYear, this.viewMonth, 1);
    const to = new Date(this.viewYear, this.viewMonth + 1, 0);
    return {
      from: Utils.toDateStr(from),
      to: Utils.toDateStr(to)
    };
  }

  static dayStatus(dateStr, plannedMap, completedMap) {
    const today = Utils.getTodayStr();
    if (window.AnalyticsAdherence?.dayStatus) {
      return AnalyticsAdherence.dayStatus(dateStr, plannedMap, completedMap, today);
    }
    const hasCompleted = completedMap.has(dateStr);
    const hasPlan = plannedMap.has(dateStr);
    if (hasCompleted) return 'completed';
    if (hasPlan && dateStr < today) return 'missed';
    if (hasPlan && dateStr >= today) return 'planned';
    return 'empty';
  }

  static async render() {
    const container = document.getElementById('app');
    const { from, to } = this.monthBounds();
    let planned = [];
    let sessions = [];
    try {
      [planned, sessions] = await Promise.all([
        Api.listPlanned(from, to),
        Api.listSessions()
      ]);
    } catch (e) {
      Utils.showToast(e.message || 'Нужен интернет', 'danger');
    }

    const plannedMap = new Map(planned.map((p) => [p.workout_date, p]));
    const completedMap = new Map();
    sessions.forEach((s) => {
      if (s.completed && s.endTime) completedMap.set(s.date, s);
    });

    const monthNames = [
      'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
      'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
    ];
    const firstDow = new Date(this.viewYear, this.viewMonth, 1).getDay();
    // Monday-first
    const offset = (firstDow + 6) % 7;
    const daysInMonth = new Date(this.viewYear, this.viewMonth + 1, 0).getDate();
    const today = Utils.getTodayStr();

    let cells = '';
    for (let i = 0; i < offset; i++) {
      cells += '<div class="cal-cell cal-empty"></div>';
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = Utils.toDateStr(new Date(this.viewYear, this.viewMonth, day));
      const status = this.dayStatus(dateStr, plannedMap, completedMap);
      const isToday = dateStr === today;
      cells += `
        <button type="button" class="cal-cell cal-${status} ${isToday ? 'cal-today' : ''}"
          onclick="CalendarManager.openDay('${dateStr}')">
          <span class="cal-day-num">${day}</span>
          <span class="cal-dot"></span>
        </button>
      `;
    }

    container.innerHTML = `
      <div class="app-header fade-in">
        <div class="d-flex justify-content-between align-items-center">
          <button class="btn btn-link text-white" onclick="CalendarManager.shiftMonth(-1)">
            <i class="bi bi-chevron-left"></i>
          </button>
          <h4 class="mb-0">${monthNames[this.viewMonth]} ${this.viewYear}</h4>
          <button class="btn btn-link text-white" onclick="CalendarManager.shiftMonth(1)">
            <i class="bi bi-chevron-right"></i>
          </button>
        </div>
      </div>
      <div class="container fade-in">
        <div class="cal-legend mb-3">
          <span><i class="cal-swatch cal-planned"></i> План</span>
          <span><i class="cal-swatch cal-completed"></i> Факт</span>
          <span><i class="cal-swatch cal-missed"></i> Пропуск</span>
        </div>
        <div class="cal-weekdays">
          <span>Пн</span><span>Вт</span><span>Ср</span><span>Чт</span><span>Пт</span><span>Сб</span><span>Вс</span>
        </div>
        <div class="cal-grid">${cells}</div>
      </div>
      ${Utils.bottomNav('calendar')}
    `;
  }

  static async openDay(dateStr) {
    let planned = null;
    let sessions = [];
    let templates = [];
    try {
      [planned, sessions, templates] = await Promise.all([
        Api.getPlannedForDate(dateStr),
        Api.listSessions(),
        Api.listTemplates()
      ]);
    } catch (e) {
      Utils.showToast(e.message, 'danger');
      return;
    }

    const completed = sessions.find((s) => s.date === dateStr && s.completed && s.endTime);
    const today = Utils.getTodayStr();
    const status = completed
      ? 'completed'
      : planned
        ? (dateStr < today ? 'missed' : 'planned')
        : 'empty';

    const modal = document.createElement('div');
    modal.className = 'modal fade';
    modal.tabIndex = -1;

    let body = '';
    if (completed) {
      body = `
        <p>Завершённая тренировка: <strong>${Utils.escapeHtml(completed.templateName)}</strong></p>
        <button class="btn btn-primary w-100" data-bs-dismiss="modal"
          onclick="Router.navigate('history-detail', {sessionId: '${completed.id}'})">
          Открыть
        </button>
      `;
    } else {
      const options = templates.map((t) =>
        `<option value="${t.id}" ${planned?.template_id === t.id ? 'selected' : ''}>${Utils.escapeHtml(t.name)}</option>`
      ).join('');
      body = `
        <p class="text-muted">Статус: ${
          status === 'missed' ? 'Пропущена' : status === 'planned' ? 'Запланирована' : 'Нет плана'
        }</p>
        <label class="form-label">Шаблон (или свободно)</label>
        <select class="form-select mb-3" id="plan-template">
          <option value="">Свободная тренировка</option>
          ${options}
        </select>
        <button class="btn btn-primary w-100 mb-2" id="save-plan-btn">Сохранить план</button>
        ${planned ? '<button class="btn btn-outline-danger w-100 mb-2" id="clear-plan-btn">Убрать план</button>' : ''}
        ${dateStr === today ? '<button class="btn btn-outline-success w-100" id="start-today-btn">Начать тренировку</button>' : ''}
      `;
    }

    modal.innerHTML = `
      <div class="modal-dialog">
        <div class="modal-content bg-dark text-light">
          <div class="modal-header">
            <h5 class="modal-title">${Utils.formatDate(dateStr + 'T12:00:00')}</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">${body}</div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();

    const saveBtn = modal.querySelector('#save-plan-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        const tid = modal.querySelector('#plan-template').value || null;
        try {
          await Api.upsertPlanned(dateStr, tid);
          Utils.showToast('План сохранён');
          bsModal.hide();
          await this.render();
        } catch (e) {
          Utils.showToast(e.message, 'danger');
        }
      });
    }
    const clearBtn = modal.querySelector('#clear-plan-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', async () => {
        try {
          await Api.deletePlanned(dateStr);
          Utils.showToast('План удалён');
          bsModal.hide();
          await this.render();
        } catch (e) {
          Utils.showToast(e.message, 'danger');
        }
      });
    }
    const startBtn = modal.querySelector('#start-today-btn');
    if (startBtn) {
      startBtn.addEventListener('click', () => {
        bsModal.hide();
        Router.navigate('workout');
      });
    }
    modal.addEventListener('hidden.bs.modal', () => modal.remove());
  }
}

window.CalendarManager = CalendarManager;
