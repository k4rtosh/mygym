class CalendarManager {
  static viewYear = null;
  static viewMonth = null; // 0-11
  /** Monday of the visible week (Date at local noon). */
  static viewWeekStart = null;
  /** 'year' | 'month' | 'week' */
  static viewMode = 'month';

  static MONTH_NAMES = [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
  ];

  static MONTH_NAMES_SHORT = [
    'Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн',
    'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'
  ];

  static async load() {
    const now = new Date();
    if (this.viewYear == null) this.viewYear = now.getFullYear();
    if (this.viewMonth == null) this.viewMonth = now.getMonth();
    if (!this.viewWeekStart) this.viewWeekStart = this.mondayOf(now);
    await this.render();
  }

  static mondayOf(date) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0);
    const dow = (d.getDay() + 6) % 7; // Mon=0
    d.setDate(d.getDate() - dow);
    return d;
  }

  static setMode(mode) {
    if (!['year', 'month', 'week'].includes(mode)) return;
    this.viewMode = mode;
    // Keep week in sync with current month context
    if (mode === 'week' && this.viewWeekStart) {
      const ws = this.viewWeekStart;
      // If week is far from viewed month, snap to today or month
      const now = new Date();
      if (
        this.viewYear === now.getFullYear() &&
        this.viewMonth === now.getMonth()
      ) {
        this.viewWeekStart = this.mondayOf(now);
      } else {
        this.viewWeekStart = this.mondayOf(new Date(this.viewYear, this.viewMonth, 1));
      }
    }
    this.render();
  }

  static shift(delta) {
    if (this.viewMode === 'year') {
      this.viewYear += delta;
    } else if (this.viewMode === 'week') {
      const d = new Date(this.viewWeekStart);
      d.setDate(d.getDate() + delta * 7);
      this.viewWeekStart = d;
      this.viewYear = d.getFullYear();
      this.viewMonth = d.getMonth();
    } else {
      this.viewMonth += delta;
      if (this.viewMonth > 11) {
        this.viewMonth = 0;
        this.viewYear += 1;
      } else if (this.viewMonth < 0) {
        this.viewMonth = 11;
        this.viewYear -= 1;
      }
    }
    this.render();
  }

  static goToday() {
    const now = new Date();
    this.viewYear = now.getFullYear();
    this.viewMonth = now.getMonth();
    this.viewWeekStart = this.mondayOf(now);
    this.render();
  }

  static openMonth(year, monthIndex) {
    this.viewYear = year;
    this.viewMonth = monthIndex;
    this.viewWeekStart = this.mondayOf(new Date(year, monthIndex, 1));
    this.viewMode = 'month';
    this.render();
  }

  static monthBounds() {
    const from = new Date(this.viewYear, this.viewMonth, 1);
    const to = new Date(this.viewYear, this.viewMonth + 1, 0);
    return { from: Utils.toDateStr(from), to: Utils.toDateStr(to) };
  }

  static weekBounds() {
    const from = new Date(this.viewWeekStart);
    const to = new Date(this.viewWeekStart);
    to.setDate(to.getDate() + 6);
    return { from: Utils.toDateStr(from), to: Utils.toDateStr(to) };
  }

  static yearBounds() {
    return {
      from: `${this.viewYear}-01-01`,
      to: `${this.viewYear}-12-31`
    };
  }

  static rangeForMode() {
    if (this.viewMode === 'year') return this.yearBounds();
    if (this.viewMode === 'week') return this.weekBounds();
    return this.monthBounds();
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

  static headerTitle() {
    if (this.viewMode === 'year') return String(this.viewYear);
    if (this.viewMode === 'week') {
      const { from, to } = this.weekBounds();
      const a = from.slice(8);
      const b = to.slice(8);
      const m1 = this.MONTH_NAMES_SHORT[Number(from.slice(5, 7)) - 1];
      const m2 = this.MONTH_NAMES_SHORT[Number(to.slice(5, 7)) - 1];
      if (from.slice(0, 7) === to.slice(0, 7)) {
        return `${Number(a)}–${Number(b)} ${m1} ${this.viewWeekStart.getFullYear()}`;
      }
      return `${Number(a)} ${m1} – ${Number(b)} ${m2}`;
    }
    return `${this.MONTH_NAMES[this.viewMonth]} ${this.viewYear}`;
  }

  static modeSwitcherHtml() {
    const modes = [
      { id: 'year', label: 'Год' },
      { id: 'month', label: 'Месяц' },
      { id: 'week', label: 'Неделя' }
    ];
    return `
      <div class="cal-mode-switch" role="tablist" aria-label="Масштаб календаря">
        ${modes.map((m) => `
          <button type="button" class="cal-mode-btn ${this.viewMode === m.id ? 'active' : ''}"
            data-cal-mode="${m.id}" role="tab" aria-selected="${this.viewMode === m.id}">
            ${m.label}
          </button>
        `).join('')}
      </div>
    `;
  }

  static async render() {
    const container = document.getElementById('app');
    const { from, to } = this.rangeForMode();
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

    const body =
      this.viewMode === 'year'
        ? this.renderYearBody(plannedMap, completedMap)
        : this.viewMode === 'week'
          ? this.renderWeekBody(plannedMap, completedMap)
          : this.renderMonthBody(plannedMap, completedMap);

    container.innerHTML = `
      <div class="app-header fade-in">
        <div class="d-flex justify-content-between align-items-center">
          <button class="btn btn-link text-white" onclick="CalendarManager.shift(-1)" aria-label="Назад">
            <i class="bi bi-chevron-left"></i>
          </button>
          <div class="text-center">
            <h4 class="mb-0">${this.headerTitle()}</h4>
            <button type="button" class="btn btn-link btn-sm text-muted p-0" onclick="CalendarManager.goToday()">
              Сегодня
            </button>
          </div>
          <button class="btn btn-link text-white" onclick="CalendarManager.shift(1)" aria-label="Вперёд">
            <i class="bi bi-chevron-right"></i>
          </button>
        </div>
      </div>
      <div class="container fade-in">
        ${this.modeSwitcherHtml()}
        <div class="cal-legend mb-3">
          <span><i class="cal-swatch cal-planned"></i> План</span>
          <span><i class="cal-swatch cal-completed"></i> Факт</span>
          <span><i class="cal-swatch cal-missed"></i> Пропуск</span>
        </div>
        ${body}
      </div>
      ${Utils.bottomNav('calendar')}
    `;

    container.querySelectorAll('[data-cal-mode]').forEach((btn) => {
      btn.addEventListener('click', () => this.setMode(btn.dataset.calMode));
    });
  }

  /** Compact plan picker — home «Запланировать» CTA. */
  static async quickPlan(dateStr) {
    let planned = null;
    let templates = [];
    try {
      [planned, templates] = await Promise.all([
        Api.getPlannedForDate(dateStr),
        Api.listTemplates()
      ]);
    } catch (e) {
      Utils.showToast(e.message, 'danger');
      return;
    }

    const options = [
      `<option value="">Свободная тренировка</option>`,
      ...templates.map((t) =>
        `<option value="${t.id}" ${planned?.template_id === t.id ? 'selected' : ''}>${Utils.escapeHtml(t.name)}</option>`
      )
    ].join('');

    const result = await new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      const { modal, bsModal } = Utils._createAppDialog({
        id: 'cal-quick-plan-modal',
        title: `План · ${Utils.formatDate(dateStr + 'T12:00:00')}`,
        bodyHtml: `
          <p class="text-muted small mb-3">Быстро поставить шаблон на этот день.</p>
          <label class="form-label" for="quick-plan-template">Шаблон</label>
          <select class="form-select form-select-lg" id="quick-plan-template">${options}</select>
        `,
        footerHtml: `
          ${planned ? '<button type="button" class="btn btn-outline-danger me-auto" id="quick-plan-clear">Убрать</button>' : ''}
          <button type="button" class="btn btn-outline-light" data-bs-dismiss="modal">Отмена</button>
          <button type="button" class="btn btn-primary" id="quick-plan-save">Сохранить</button>
        `
      });

      modal.querySelector('#quick-plan-save')?.addEventListener('click', () => {
        const tid = modal.querySelector('#quick-plan-template').value || null;
        bsModal.hide();
        finish({ action: 'save', templateId: tid });
      });
      modal.querySelector('#quick-plan-clear')?.addEventListener('click', () => {
        bsModal.hide();
        finish({ action: 'clear' });
      });
      modal.addEventListener('hidden.bs.modal', () => {
        modal.remove();
        finish(null);
      });
      bsModal.show();
    });

    if (!result) return;
    try {
      if (result.action === 'clear') {
        await Api.deletePlanned(dateStr);
        Utils.showToast('План удалён');
      } else {
        await Api.upsertPlanned(dateStr, result.templateId);
        Utils.showToast('План сохранён');
      }
      if (Router.currentPage === 'calendar') await this.render();
      else if (Router.currentPage === 'home') await Router.navigate('home', {}, { replace: true, silent: true });
    } catch (e) {
      Utils.showToast(e.message, 'danger');
    }
  }

  static renderMonthBody(plannedMap, completedMap) {
    const firstDow = new Date(this.viewYear, this.viewMonth, 1).getDay();
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
          data-date="${dateStr}"
          aria-label="${day} · ${
            status === 'completed' ? 'Факт' : status === 'planned' ? 'План' : status === 'missed' ? 'Пропуск' : 'Нет плана'
          }"
          onclick="CalendarManager.openDay('${dateStr}')">
          <span class="cal-day-num">${day}</span>
          <span class="cal-dot" aria-hidden="true"></span>
        </button>
      `;
    }

    return `
      <div class="cal-weekdays">
        <span>Пн</span><span>Вт</span><span>Ср</span><span>Чт</span><span>Пт</span><span>Сб</span><span>Вс</span>
      </div>
      <div class="cal-grid">${cells}</div>
    `;
  }

  static renderWeekBody(plannedMap, completedMap) {
    const today = Utils.getTodayStr();
    const dayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    const rows = [];

    for (let i = 0; i < 7; i++) {
      const d = new Date(this.viewWeekStart);
      d.setDate(d.getDate() + i);
      const dateStr = Utils.toDateStr(d);
      const status = this.dayStatus(dateStr, plannedMap, completedMap);
      const isToday = dateStr === today;
      const planned = plannedMap.get(dateStr);
      const done = completedMap.get(dateStr);

      let detail = 'Нет плана';
      if (done) detail = done.templateName || 'Тренировка';
      else if (planned) detail = planned.templates?.name || 'Свободная';
      else if (status === 'missed') detail = 'Пропуск';

      const statusLabel = {
        completed: 'Факт',
        planned: 'План',
        missed: 'Пропуск',
        empty: '—'
      }[status];

      rows.push(`
        <button type="button" class="cal-week-row cal-${status} ${isToday ? 'cal-today' : ''}"
          data-date="${dateStr}"
          onclick="CalendarManager.openDay('${dateStr}')">
          <div class="cal-week-dow">
            <span class="cal-week-dow-name">${dayNames[i]}</span>
            <span class="cal-week-dow-num">${d.getDate()}</span>
          </div>
          <div class="cal-week-main">
            <div class="cal-week-title">${Utils.escapeHtml(detail)}</div>
            <div class="cal-week-meta">${Utils.formatDate(dateStr)}</div>
          </div>
          <span class="cal-week-status">${statusLabel}</span>
        </button>
      `);
    }

    return `<div class="cal-week-list">${rows.join('')}</div>`;
  }

  static renderYearBody(plannedMap, completedMap) {
    const today = Utils.getTodayStr();
    const months = this.MONTH_NAMES_SHORT.map((name, monthIndex) => {
      const daysInMonth = new Date(this.viewYear, monthIndex + 1, 0).getDate();
      let planned = 0;
      let completed = 0;
      let missed = 0;
      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = Utils.toDateStr(new Date(this.viewYear, monthIndex, day));
        const status = this.dayStatus(dateStr, plannedMap, completedMap);
        if (status === 'planned') planned += 1;
        if (status === 'completed') completed += 1;
        if (status === 'missed') missed += 1;
      }
      const isCurrent =
        this.viewYear === Number(today.slice(0, 4)) &&
        monthIndex === Number(today.slice(5, 7)) - 1;

      return `
        <button type="button" class="cal-year-month ${isCurrent ? 'cal-today' : ''}"
          onclick="CalendarManager.openMonth(${this.viewYear}, ${monthIndex})">
          <div class="cal-year-month-name">${name}</div>
          <div class="cal-year-month-stats">
            <span class="cal-y-stat done" title="Факт">${completed}</span>
            <span class="cal-y-stat plan" title="План">${planned}</span>
            <span class="cal-y-stat miss" title="Пропуск">${missed}</span>
          </div>
        </button>
      `;
    }).join('');

    return `
      <div class="cal-year-grid">${months}</div>
      <p class="text-muted small mt-3 mb-0">Цифры: факт · план · пропуск. Нажми месяц, чтобы открыть сетку.</p>
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
    const statusLabel = {
      completed: 'Завершена',
      missed: 'Пропущена',
      planned: 'В плане',
      empty: 'Нет плана'
    }[status];

    let bodyHtml;
    let footerHtml;

    if (completed) {
      bodyHtml = `
        <div class="cal-day-status cal-day-status-done">${statusLabel}</div>
        <div class="cal-day-workout-name">${Utils.escapeHtml(completed.templateName || 'Тренировка')}</div>
        <p class="text-muted small mb-0 mt-2">Можно открыть детали в истории.</p>
      `;
      footerHtml = `
        <button type="button" class="btn btn-outline-light" data-bs-dismiss="modal">Закрыть</button>
        <button type="button" class="btn btn-primary" id="cal-day-open-history">Открыть</button>
      `;
    } else {
      const options = templates.map((t) =>
        `<option value="${t.id}" ${planned?.template_id === t.id ? 'selected' : ''}>${Utils.escapeHtml(t.name)}</option>`
      ).join('');
      bodyHtml = `
        <div class="cal-day-status cal-day-status-${status}">${statusLabel}</div>
        <label class="form-label mt-3" for="plan-template">Шаблон</label>
        <select class="form-select form-select-lg" id="plan-template">
          <option value="">Свободная тренировка</option>
          ${options}
        </select>
      `;
      footerHtml = `
        ${planned ? '<button type="button" class="btn btn-outline-danger me-auto" id="clear-plan-btn">Убрать</button>' : ''}
        <button type="button" class="btn btn-outline-light" data-bs-dismiss="modal">Отмена</button>
        ${dateStr === today ? '<button type="button" class="btn btn-outline-success" id="start-today-btn">Начать</button>' : ''}
        <button type="button" class="btn btn-primary" id="save-plan-btn">Сохранить</button>
      `;
    }

    const { modal, bsModal } = Utils._createAppDialog({
      id: 'cal-day-modal',
      title: Utils.formatDate(dateStr + 'T12:00:00'),
      bodyHtml,
      footerHtml
    });

    modal.querySelector('#cal-day-open-history')?.addEventListener('click', () => {
      bsModal.hide();
      Router.navigate('history-detail', { sessionId: completed.id });
    });

    modal.querySelector('#save-plan-btn')?.addEventListener('click', async () => {
      const tid = modal.querySelector('#plan-template')?.value || null;
      try {
        await Api.upsertPlanned(dateStr, tid);
        Utils.showToast('План сохранён');
        bsModal.hide();
        await this.render();
      } catch (e) {
        Utils.showToast(e.message, 'danger');
      }
    });

    modal.querySelector('#clear-plan-btn')?.addEventListener('click', async () => {
      try {
        await Api.deletePlanned(dateStr);
        Utils.showToast('План удалён');
        bsModal.hide();
        await this.render();
      } catch (e) {
        Utils.showToast(e.message, 'danger');
      }
    });

    modal.querySelector('#start-today-btn')?.addEventListener('click', () => {
      bsModal.hide();
      Router.navigate('workout');
    });

    modal.addEventListener('hidden.bs.modal', () => modal.remove());
    bsModal.show();
  }
}

window.CalendarManager = CalendarManager;
