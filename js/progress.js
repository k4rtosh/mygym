class ProgressManager {
  static chart = null;
  static allExercises = [];
  static templates = [];
  static showAll = false;
  static selectedId = null;

  static destroyChart() {
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
  }

  static formatShortDate(dateStr) {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    return `${d}.${m}`;
  }

  static formatMonthLabel(ym) {
    if (!ym) return '';
    const [y, m] = ym.split('-');
    const names = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
    const idx = Math.max(0, Math.min(11, (Number(m) || 1) - 1));
    return `${names[idx]} ${String(y).slice(2)}`;
  }

  // ── Hub ──────────────────────────────────────────────
  static async loadHub() {
    this.destroyChart();
    const container = document.getElementById('app');

    let weightHint = 'Динамика веса тела';
    let missedHint = 'План vs факт';
    let insightsHint = 'Коуч по дневнику';
    try {
      const latest = await Api.getLatestBodyWeight();
      if (latest) weightHint = `Сейчас ${latest.weightKg} кг · ${this.formatShortDate(latest.measuredOn)}`;
      else weightHint = 'Пока нет замеров';
    } catch { /* offline / missing table */ }

    try {
      const to = Utils.getTodayStr();
      const fromDate = new Date();
      fromDate.setMonth(fromDate.getMonth() - 5);
      fromDate.setDate(1);
      const from = Utils.toDateStr(fromDate);
      const [planned, sessions, exercises, bodyWeight, templates, profile] = await Promise.all([
        Api.listPlanned(from, to),
        Api.listSessions(),
        Api.listExercises().catch(() => []),
        Api.listBodyWeight().catch(() => []),
        Api.listTemplates().catch(() => []),
        Api.getProfile().catch(() => null)
      ]);
      const summary = AnalyticsAdherence.summarize({ planned, sessions, from, to });
      missedHint = summary.totals.missed
        ? `${summary.totals.missed} пропусков за период`
        : 'Пропусков нет — отличный ритм';
      const packBuilder = window.AnalyticsCoach?.buildPack || window.AnalyticsInsights?.buildCards;
      if (packBuilder) {
        const goal = window.CoachGoal?.fromProfile
          ? CoachGoal.fromProfile(profile)
          : null;
        const inbox = window.CoachGoal?.fromProfileInbox
          ? CoachGoal.fromProfileInbox(profile)
          : null;
        const pack = packBuilder({
          planned,
          sessions,
          bodyWeightEntries: bodyWeight,
          exercises,
          templates,
          goal,
          inbox,
          from,
          to
        });
        insightsHint = pack.hubHint;
      }
    } catch { /* ignore */ }

    container.innerHTML = `
      <div class="app-header fade-in">
        <h4>Прогресс</h4>
        <p class="text-muted mb-0 small">Выбери категорию анализа</p>
      </div>
      <div class="container fade-in progress-hub">
        <button type="button" class="progress-hub-item" data-progress="insights">
          <div class="progress-hub-icon"><i class="bi bi-mortarboard"></i></div>
          <div class="progress-hub-text">
            <div class="progress-hub-title">Коуч</div>
            <div class="progress-hub-desc">${Utils.escapeHtml(insightsHint)}</div>
          </div>
          <i class="bi bi-chevron-right progress-hub-arrow"></i>
        </button>
        <button type="button" class="progress-hub-item" data-progress="exercises">
          <div class="progress-hub-icon"><i class="bi bi-bar-chart-line"></i></div>
          <div class="progress-hub-text">
            <div class="progress-hub-title">Прогресс тренировок</div>
            <div class="progress-hub-desc">Макс. вес и объём по упражнениям</div>
          </div>
          <i class="bi bi-chevron-right progress-hub-arrow"></i>
        </button>
        <button type="button" class="progress-hub-item" data-progress="body-weight">
          <div class="progress-hub-icon"><i class="bi bi-person-bounding-box"></i></div>
          <div class="progress-hub-text">
            <div class="progress-hub-title">Собственный вес</div>
            <div class="progress-hub-desc">${Utils.escapeHtml(weightHint)}</div>
          </div>
          <i class="bi bi-chevron-right progress-hub-arrow"></i>
        </button>
        <button type="button" class="progress-hub-item" data-progress="missed">
          <div class="progress-hub-icon"><i class="bi bi-calendar-x"></i></div>
          <div class="progress-hub-text">
            <div class="progress-hub-title">Пропуски</div>
            <div class="progress-hub-desc">${Utils.escapeHtml(missedHint)}</div>
          </div>
          <i class="bi bi-chevron-right progress-hub-arrow"></i>
        </button>
      </div>
    `;

    container.querySelectorAll('[data-progress]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.progress;
        if (key === 'insights') Router.navigate('progress-insights');
        else if (key === 'exercises') Router.navigate('progress-exercises');
        else if (key === 'body-weight') Router.navigate('progress-body-weight');
        else if (key === 'missed') Router.navigate('progress-missed');
      });
    });
  }

  // Alias for router
  static async load() {
    return this.loadHub();
  }

  // ── Exercises (existing) ─────────────────────────────
  static async loadExercises() {
    this.destroyChart();
    const container = document.getElementById('app');
    try {
      const [exercises, templates] = await Promise.all([
        Api.listExercises(),
        Api.listTemplates()
      ]);
      this.allExercises = exercises;
      this.templates = templates;
      await DB.cacheExercises(exercises);
    } catch (e) {
      this.allExercises = (await DB.loadExercisesCache()) || [];
      this.templates = [];
      Utils.showToast(e.message || 'Нет сети', 'warning');
    }

    this.showAll = this.templates.length === 0;
    const defaultTemplateId = this.templates[0]?.id || '';

    const chips = this.templates.length
      ? this.templates.map((t, i) => `
          <button type="button" class="tpl-chip ${i === 0 && !this.showAll ? 'active' : ''}"
            data-template-id="${Utils.escapeHtml(t.id)}">
            ${Utils.escapeHtml(t.name)}
          </button>
        `).join('')
      : '<span class="text-muted small">Сначала создай шаблон</span>';

    container.innerHTML = `
      <div class="app-header fade-in">
        <div class="d-flex align-items-center">
          <button class="btn btn-link text-white me-2" onclick="Router.navigate('progress')" aria-label="Назад к прогрессу">
            <i class="bi bi-arrow-left" aria-hidden="true"></i>
          </button>
          <div>
            <h4 class="mb-0">Прогресс тренировок</h4>
            <p class="text-muted mb-0 small">Динамика веса и объёма</p>
          </div>
        </div>
      </div>
      <div class="container fade-in">
        <div class="card mb-3">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <label class="form-label mb-0">Шаблон</label>
              <button type="button" class="btn btn-sm btn-outline-light" id="progress-toggle-all">
                ${this.showAll ? 'Только шаблон' : 'Показать все'}
              </button>
            </div>
            <div class="tpl-chip-row mb-3" id="progress-template-chips">
              ${chips}
            </div>
            <input type="hidden" id="progress-template" value="${Utils.escapeHtml(defaultTemplateId)}">

            <label class="form-label">Упражнение</label>
            <div class="search-wrap mb-2">
              <i class="bi bi-search"></i>
              <input type="text" class="form-control" id="progress-search" placeholder="Найти упражнение...">
            </div>
            <div class="ex-pick-list" id="progress-exercise-list"></div>
            <p class="text-muted small mt-2 mb-0" id="progress-source-hint"></p>
          </div>
        </div>

        <div class="card mb-3 chart-card">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-start mb-2">
              <div>
                <div class="chart-ex-name" id="chart-ex-name">Выбери упражнение</div>
                <p class="text-muted small mb-0" id="progress-hint"></p>
              </div>
            </div>
            <div class="chart-stats" id="chart-stats"></div>
            <canvas id="progress-chart" height="240"></canvas>
          </div>
        </div>
      </div>
    `;

    const templateInput = document.getElementById('progress-template');
    const search = document.getElementById('progress-search');
    const toggleBtn = document.getElementById('progress-toggle-all');

    document.getElementById('progress-template-chips')?.addEventListener('click', (e) => {
      const chip = e.target.closest('.tpl-chip');
      if (!chip) return;
      this.showAll = false;
      toggleBtn.textContent = 'Показать все';
      templateInput.value = chip.dataset.templateId;
      document.querySelectorAll('.tpl-chip').forEach((c) => c.classList.toggle('active', c === chip));
      this.refreshList();
    });

    search.addEventListener('input', () => this.refreshList());
    toggleBtn.addEventListener('click', () => {
      this.showAll = !this.showAll;
      toggleBtn.textContent = this.showAll ? 'Только шаблон' : 'Показать все';
      document.querySelectorAll('.tpl-chip').forEach((c) => {
        c.classList.toggle('active', !this.showAll && c.dataset.templateId === templateInput.value);
      });
      this.refreshList();
    });

    this.refreshList();
  }

  static getFilteredExercises() {
    const templateId = document.getElementById('progress-template')?.value;
    const searchQuery = document.getElementById('progress-search')?.value || '';
    const hint = document.getElementById('progress-source-hint');

    let list = this.allExercises;
    if (!this.showAll && templateId) {
      const template = this.templates.find((t) => t.id === templateId);
      const ids = new Set((template?.exercises || []).map((e) => e.exerciseId));
      list = this.allExercises.filter((ex) => ids.has(ex.id));
      if (hint) {
        hint.textContent = list.length
          ? `${list.length} упр. · шаблон «${template?.name || ''}»`
          : 'В шаблоне нет упражнений — «Показать все» или добавь в шаблон';
      }
    } else if (hint) {
      hint.textContent = `Вся база · ${this.allExercises.length} упражнений`;
    }

    const q = searchQuery.toLowerCase().trim();
    if (q) {
      list = list.filter((ex) =>
        ex.name.toLowerCase().includes(q) || (ex.category || '').toLowerCase().includes(q)
      );
    }
    return list;
  }

  static refreshList() {
    const listEl = document.getElementById('progress-exercise-list');
    if (!listEl) return;
    const list = this.getFilteredExercises();

    if (!list.length) {
      listEl.innerHTML = '<div class="ex-pick-empty">Ничего не найдено</div>';
      return;
    }

    if (this.selectedId && !list.some((ex) => ex.id === this.selectedId)) {
      this.selectedId = list[0].id;
    }
    if (!this.selectedId) this.selectedId = list[0].id;

    listEl.innerHTML = list.map((ex) => `
      <button type="button" class="ex-pick ${ex.id === this.selectedId ? 'active' : ''}" data-id="${Utils.escapeHtml(ex.id)}">
        <div class="ex-pick-main">
          <div class="ex-pick-name">${Utils.escapeHtml(ex.name)}</div>
          <div class="ex-pick-meta">${Utils.escapeHtml(ex.category || '')}${ex.muscle ? ' · ' + Utils.escapeHtml(ex.muscle.split(',')[0]) : ''}</div>
        </div>
        <i class="bi bi-chevron-right ex-pick-arrow"></i>
      </button>
    `).join('');

    listEl.querySelectorAll('.ex-pick').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.selectedId = btn.dataset.id;
        listEl.querySelectorAll('.ex-pick').forEach((b) => b.classList.toggle('active', b === btn));
        this.renderExerciseChart(this.selectedId);
      });
    });

    if (this.selectedId) this.renderExerciseChart(this.selectedId);
  }

  static async renderExerciseChart(exerciseId) {
    const hint = document.getElementById('progress-hint');
    const nameEl = document.getElementById('chart-ex-name');
    const statsEl = document.getElementById('chart-stats');
    const canvas = document.getElementById('progress-chart');
    if (!exerciseId || !canvas) return;

    const exInfo = this.allExercises.find((e) => e.id === exerciseId);
    if (nameEl) nameEl.textContent = exInfo?.name || 'Упражнение';
    const isBw = exInfo && exInfo.type === 'Собственный вес';
    const weightLabel = isBw ? 'Доп. вес' : 'Вес';

    let points = [];
    try {
      points = await Api.getExerciseProgress(exerciseId);
    } catch (e) {
      Utils.showToast(e.message, 'danger');
      return;
    }

    this.destroyChart();

    if (!points.length) {
      if (hint) hint.textContent = '';
      if (statsEl) {
        statsEl.innerHTML = Utils.emptyStateHtml({
          icon: 'bi-bar-chart',
          title: 'Пока нет точек на графике',
          text: isBw
            ? 'Заверши подходы с повторами — график доп. веса появится здесь.'
            : 'Заверши подходы с весом и повторами — график появится здесь.'
        });
      }
      canvas.classList.add('d-none');
      return;
    }

    canvas.classList.remove('d-none');
    const last = points[points.length - 1];
    const first = points[0];
    const peak = points.reduce((a, b) => (b.maxWeight > a.maxWeight ? b : a), points[0]);
    const delta = last.maxWeight - first.maxWeight;
    const deltaTxt = `${delta >= 0 ? '+' : ''}${delta.toFixed(1)} кг`;

    if (hint) hint.textContent = `${points.length} тренировок · с ${this.formatShortDate(first.date)}`;
    if (statsEl) {
      statsEl.innerHTML = `
        <div class="chart-stat"><span>Сейчас</span><strong>${last.maxWeight} кг</strong></div>
        <div class="chart-stat"><span>Пик</span><strong>${peak.maxWeight} кг</strong></div>
        <div class="chart-stat"><span>Динамика</span><strong class="${delta >= 0 ? 'up' : 'down'}">${deltaTxt}</strong></div>
        <div class="chart-stat"><span>Объём (посл.)</span><strong>${Math.round(last.volume)}</strong></div>
      `;
    }

    this.chart = new Chart(canvas.getContext('2d'), {
      data: {
        labels: points.map((p) => this.formatShortDate(p.date)),
        datasets: [
          {
            type: 'bar',
            label: 'Объём',
            data: points.map((p) => p.volume),
            backgroundColor: 'rgba(94, 200, 255, 0.28)',
            borderColor: 'rgba(94, 200, 255, 0.55)',
            borderWidth: 1,
            borderRadius: 6,
            yAxisID: 'y1',
            order: 2
          },
          {
            type: 'line',
            label: `Макс. ${weightLabel.toLowerCase()} (кг)`,
            data: points.map((p) => p.maxWeight),
            borderColor: '#ff5a6a',
            backgroundColor: (ctx) => {
              const chart = ctx.chart;
              const { ctx: c, chartArea } = chart;
              if (!chartArea) return 'rgba(255,90,106,0.15)';
              const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
              g.addColorStop(0, 'rgba(255,90,106,0.35)');
              g.addColorStop(1, 'rgba(255,90,106,0.02)');
              return g;
            },
            fill: true,
            tension: 0.35,
            borderWidth: 3,
            pointRadius: 4,
            pointHoverRadius: 6,
            pointBackgroundColor: '#ff5a6a',
            pointBorderColor: '#fff',
            pointBorderWidth: 2,
            yAxisID: 'y',
            order: 1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            labels: {
              color: '#e8ecf4',
              usePointStyle: true,
              boxWidth: 8,
              padding: 16
            }
          },
          tooltip: {
            backgroundColor: 'rgba(12,16,24,0.95)',
            titleColor: '#fff',
            bodyColor: '#c8d0e0',
            borderColor: 'rgba(255,255,255,0.1)',
            borderWidth: 1,
            padding: 10,
            callbacks: {
              label(ctx) {
                if (ctx.dataset.yAxisID === 'y1') return ` Объём: ${Math.round(ctx.parsed.y)}`;
                return ` ${weightLabel}: ${ctx.parsed.y} кг`;
              }
            }
          }
        },
        scales: {
          y: {
            type: 'linear',
            position: 'left',
            title: { display: true, text: `${weightLabel}, кг`, color: '#9aa3b5' },
            ticks: { color: '#9aa3b5' },
            grid: { color: 'rgba(255,255,255,0.06)' },
            beginAtZero: false
          },
          y1: {
            type: 'linear',
            position: 'right',
            title: { display: true, text: 'Объём', color: '#9aa3b5' },
            ticks: { color: '#9aa3b5' },
            grid: { drawOnChartArea: false },
            beginAtZero: true
          },
          x: {
            ticks: { color: '#9aa3b5', maxRotation: 0 },
            grid: { display: false }
          }
        }
      }
    });
  }

  // backward-compatible alias
  static renderChart(exerciseId) {
    return this.renderExerciseChart(exerciseId);
  }

  // ── Body weight ──────────────────────────────────────
  static async loadBodyWeight() {
    this.destroyChart();
    const container = document.getElementById('app');
    container.innerHTML = `
      <div class="app-header fade-in">
        <div class="d-flex align-items-center">
          <button class="btn btn-link text-white me-2" onclick="Router.navigate('progress')" aria-label="Назад к прогрессу">
            <i class="bi bi-arrow-left" aria-hidden="true"></i>
          </button>
          <div>
            <h4 class="mb-0">Собственный вес</h4>
            <p class="text-muted mb-0 small">Замеры после тренировок</p>
          </div>
        </div>
      </div>
      <div class="container fade-in">
        <div class="card mb-3 chart-card">
          <div class="card-body">
            <div class="chart-ex-name" id="bw-title">Загрузка…</div>
            <p class="text-muted small mb-0" id="bw-hint"></p>
            <div class="chart-stats" id="bw-stats"></div>
            <canvas id="bw-chart" height="240"></canvas>
            <p class="text-muted small mt-3 mb-0" id="bw-empty"></p>
          </div>
        </div>
        <p class="text-muted small px-1">
          Вес нельзя править в профиле — он записывается при онбординге и после завершения тренировки.
        </p>
      </div>
    `;

    let entries = [];
    try {
      entries = await Api.listBodyWeight();
    } catch (e) {
      Utils.showToast(e.message || 'Не удалось загрузить вес', 'danger');
    }

    const summary = AnalyticsBodyWeight.summarize(entries);
    const title = document.getElementById('bw-title');
    const hint = document.getElementById('bw-hint');
    const statsEl = document.getElementById('bw-stats');
    const empty = document.getElementById('bw-empty');
    const canvas = document.getElementById('bw-chart');

    if (!summary.count) {
      if (title) title.textContent = 'Пока нет замеров';
      if (hint) hint.textContent = '';
      if (statsEl) statsEl.innerHTML = '';
      if (canvas) canvas.classList.add('d-none');
      if (empty) {
        empty.innerHTML = Utils.emptyStateHtml({
          icon: 'bi-person',
          title: 'Замеров веса ещё нет',
          text: 'Укажи вес после тренировки или заполни первичные данные в профиле.'
        });
      }
      return;
    }

    if (canvas) canvas.classList.remove('d-none');
    if (empty) empty.innerHTML = '';
    if (title) title.textContent = `${summary.last.weightKg} кг`;
    if (hint) {
      hint.textContent = `${summary.count} замеров · с ${this.formatShortDate(summary.first.date)}`;
    }
    const delta = summary.delta;
    const deltaTxt = `${delta >= 0 ? '+' : ''}${delta.toFixed(1)} кг`;
    if (statsEl) {
      statsEl.innerHTML = `
        <div class="chart-stat"><span>Сейчас</span><strong>${summary.last.weightKg} кг</strong></div>
        <div class="chart-stat"><span>Старт</span><strong>${summary.first.weightKg} кг</strong></div>
        <div class="chart-stat"><span>Мин</span><strong>${summary.min.weightKg} кг</strong></div>
        <div class="chart-stat"><span>Динамика</span><strong class="${delta <= 0 ? 'up' : 'down'}">${deltaTxt}</strong></div>
      `;
    }
    if (empty) empty.innerHTML = '';

    this.chart = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: summary.points.map((p) => this.formatShortDate(p.date)),
        datasets: [{
          label: 'Вес, кг',
          data: summary.points.map((p) => p.weightKg),
          borderColor: '#5ec8ff',
          backgroundColor: (ctx) => {
            const chart = ctx.chart;
            const { ctx: c, chartArea } = chart;
            if (!chartArea) return 'rgba(94,200,255,0.15)';
            const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
            g.addColorStop(0, 'rgba(94,200,255,0.35)');
            g.addColorStop(1, 'rgba(94,200,255,0.02)');
            return g;
          },
          fill: true,
          tension: 0.35,
          borderWidth: 3,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: '#5ec8ff',
          pointBorderColor: '#fff',
          pointBorderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(12,16,24,0.95)',
            callbacks: {
              label(ctx) { return ` ${ctx.parsed.y} кг`; }
            }
          }
        },
        scales: {
          y: {
            ticks: { color: '#9aa3b5' },
            grid: { color: 'rgba(255,255,255,0.06)' },
            beginAtZero: false
          },
          x: {
            ticks: { color: '#9aa3b5', maxRotation: 0 },
            grid: { display: false }
          }
        }
      }
    });
  }

  // ── Missed / adherence ───────────────────────────────
  static async loadMissed() {
    this.destroyChart();
    const container = document.getElementById('app');
    container.innerHTML = `
      <div class="app-header fade-in">
        <div class="d-flex align-items-center">
          <button class="btn btn-link text-white me-2" onclick="Router.navigate('progress')" aria-label="Назад к прогрессу">
            <i class="bi bi-arrow-left" aria-hidden="true"></i>
          </button>
          <div>
            <h4 class="mb-0">Пропуски</h4>
            <p class="text-muted mb-0 small">План без тренировки</p>
          </div>
        </div>
      </div>
      <div class="container fade-in">
        <div class="card mb-3 chart-card">
          <div class="card-body">
            <div class="chart-ex-name" id="miss-title">Загрузка…</div>
            <p class="text-muted small mb-0" id="miss-hint"></p>
            <div class="chart-stats" id="miss-stats"></div>
            <canvas id="miss-chart" height="220"></canvas>
          </div>
        </div>
        <div class="card mb-3">
          <div class="card-header"><h6 class="mb-0">Недавние пропуски</h6></div>
          <div class="card-body" id="miss-list"></div>
        </div>
      </div>
    `;

    const to = Utils.getTodayStr();
    const fromDate = new Date();
    fromDate.setMonth(fromDate.getMonth() - 5);
    fromDate.setDate(1);
    const from = Utils.toDateStr(fromDate);

    let planned = [];
    let sessions = [];
    try {
      [planned, sessions] = await Promise.all([
        Api.listPlanned(from, to),
        Api.listSessions()
      ]);
    } catch (e) {
      Utils.showToast(e.message || 'Нет данных', 'warning');
    }

    const summary = AnalyticsAdherence.summarize({ planned, sessions, from, to });
    const title = document.getElementById('miss-title');
    const hint = document.getElementById('miss-hint');
    const statsEl = document.getElementById('miss-stats');
    const listEl = document.getElementById('miss-list');
    const canvas = document.getElementById('miss-chart');

      const rate = summary.totals.planned
      ? Math.round(((summary.totals.planned - summary.totals.missed) / summary.totals.planned) * 100)
      : null;

    if (title) {
      title.textContent = summary.totals.missed
        ? `${summary.totals.missed} пропусков`
        : 'Пропусков нет';
    }
    if (hint) {
      hint.textContent = rate != null
        ? `Выполнение плана ~${rate}% · ${from.slice(0, 7)} → ${to.slice(0, 7)}`
        : 'Пока нет планов в календаре';
    }
    if (statsEl) {
      statsEl.innerHTML = `
        <div class="chart-stat"><span>План</span><strong>${summary.totals.planned}</strong></div>
        <div class="chart-stat"><span>Сделано</span><strong>${summary.totals.completed}</strong></div>
        <div class="chart-stat"><span>Пропуски</span><strong class="${summary.totals.missed ? 'down' : 'up'}">${summary.totals.missed}</strong></div>
        <div class="chart-stat"><span>%</span><strong>${rate != null ? rate + '%' : '—'}</strong></div>
      `;
    }

    const months = summary.byMonth.filter((m) => m.planned > 0 || m.completed > 0 || m.missed > 0);
    this.chart = new Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels: months.map((m) => this.formatMonthLabel(m.month)),
        datasets: [
          {
            label: 'Сделано',
            data: months.map((m) => m.completed),
            backgroundColor: 'rgba(61, 220, 151, 0.55)',
            borderRadius: 6
          },
          {
            label: 'Пропуски',
            data: months.map((m) => m.missed),
            backgroundColor: 'rgba(255, 90, 106, 0.55)',
            borderRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            labels: { color: '#e8ecf4', usePointStyle: true, boxWidth: 8 }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { color: '#9aa3b5', stepSize: 1 },
            grid: { color: 'rgba(255,255,255,0.06)' }
          },
          x: {
            ticks: { color: '#9aa3b5' },
            grid: { display: false }
          }
        }
      }
    });

    const recent = summary.missedDates.slice().reverse().slice(0, 12);
    if (!listEl) return;
    if (!recent.length) {
      listEl.innerHTML = '<p class="text-muted mb-0 small">За выбранный период пропусков нет.</p>';
      return;
    }
    listEl.innerHTML = recent.map((d) => `
      <div class="d-flex justify-content-between align-items-center py-2 border-bottom border-secondary border-opacity-25">
        <div>
          <div class="fw-semibold">${Utils.formatDate(d)}</div>
          <div class="small text-muted">${Utils.getDayOfWeek(d)}</div>
        </div>
        <span class="badge bg-danger-subtle text-danger">пропуск</span>
      </div>
    `).join('');
  }

  // ── Coach / insights ─────────────────────────────────
  static focusExerciseOptions(exercises, sessions, currentId) {
    const catalog = new Map((exercises || []).map((e) => [e.id, e]));
    const counts = new Map();
    for (const s of sessions || []) {
      for (const ex of s.exercises || []) {
        if (!ex.exerciseId) continue;
        counts.set(ex.exerciseId, (counts.get(ex.exerciseId) || 0) + 1);
      }
    }
    const popular = [
      'chest_1', 'back_1', 'legs_1', 'shoulders_1', 'back_5', 'legs_5', 'arms_1', 'chest_4'
    ];
    const ids = new Set();
    const options = [{ value: '', label: 'Не важно' }];
    const pushId = (id) => {
      if (!id || ids.has(id) || !catalog.has(id)) return;
      ids.add(id);
      const info = catalog.get(id);
      options.push({
        value: id,
        label: info.name,
        meta: [info.category, info.muscle ? String(info.muscle).split(',')[0] : '']
          .filter(Boolean).join(' · ')
      });
    };
    if (currentId) pushId(currentId);
    [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .forEach(([id]) => pushId(id));
    popular.forEach(pushId);
    return options;
  }

  static focusExerciseSearchItems(exercises) {
    return (exercises || [])
      .filter((e) => e?.id && e?.name)
      .slice()
      .sort((a, b) => String(a.name).localeCompare(String(b.name), 'ru'))
      .map((e) => ({
        value: e.id,
        label: e.name,
        meta: [e.category, e.muscle ? String(e.muscle).split(',')[0] : '']
          .filter(Boolean).join(' · ')
      }));
  }

  static async editCoachGoal(exercises = [], sessions = []) {
    let profile = null;
    try {
      profile = await Api.getProfile();
    } catch (e) {
      Utils.showToast(e.message || 'Не удалось загрузить профиль', 'danger');
      return;
    }
    const current = window.CoachGoal?.fromProfile
      ? CoachGoal.fromProfile(profile)
      : null;
    const today = Utils.getTodayStr();
    const values = await Utils.formModal({
      title: current ? 'Изменить цель коуча' : 'Цель коуча',
      message: 'Коуч отталкивается от цели. Режим «Простой» — пауза без зала на период (с причиной); после возврата можно сравнить результат.',
      confirmText: 'Сохранить',
      fields: [
        {
          name: 'intent',
          label: 'Главная цель',
          type: 'select',
          required: true,
          value: current?.intent || 'strength',
          options: CoachGoal.intentOptions()
        },
        {
          name: 'mode',
          label: 'Текущий режим',
          type: 'select',
          required: true,
          value: current?.mode === 'travel' ? 'pause' : (current?.mode || 'normal'),
          options: CoachGoal.modeOptions()
        },
        {
          name: 'pauseReason',
          label: 'Причина простоя',
          type: 'select',
          value: current?.pauseReason || '',
          options: CoachGoal.pauseReasonOptions(),
          showWhen: { field: 'mode', equals: 'pause' }
        },
        {
          name: 'focusExerciseId',
          label: 'Фокус-упражнение',
          type: 'search-select',
          value: current?.focusExerciseId || '',
          options: this.focusExerciseOptions(exercises, sessions, current?.focusExerciseId),
          searchItems: this.focusExerciseSearchItems(exercises),
          allowEmpty: true,
          emptyLabel: 'Не важно',
          placeholder: 'Начни вводить или выбери из частых'
        },
        {
          name: 'targetFrequency',
          label: 'Целевая частота (трен./нед.)',
          type: 'number',
          min: 0,
          max: 14,
          step: 0.5,
          value: current?.targetFrequency != null ? String(current.targetFrequency) : '',
          placeholder: 'пусто = по умолчанию'
        },
        {
          name: 'periodFrom',
          label: 'Период режима с',
          type: 'date',
          value: current?.periodFrom || today,
          showWhen: { field: 'mode', in: ['pause', 'injury'] }
        },
        {
          name: 'periodTo',
          label: 'Период режима по',
          type: 'date',
          value: current?.periodTo || '',
          showWhen: { field: 'mode', in: ['pause', 'injury'] }
        }
      ]
    });
    if (!values) return;

    const goal = CoachGoal.withArchivedPause(
      current,
      {
        intent: values.intent,
        mode: values.mode,
        pauseReason: values.pauseReason || null,
        focusExerciseId: values.focusExerciseId || null,
        targetFrequency: values.targetFrequency === '' || values.targetFrequency == null
          ? null
          : Number(values.targetFrequency),
        periodFrom: values.mode === 'normal' ? null : (values.periodFrom || null),
        periodTo: values.mode === 'normal' ? null : (values.periodTo || null),
        lastPause: current?.lastPause || null
      },
      today
    );
    if (!goal) {
      Utils.showToast('Проверь поля цели', 'warning');
      return;
    }

    try {
      const updated = await Api.updateProfile({ coachGoal: goal });
      if (window.Auth) Auth.profile = updated;
      Utils.showToast('Цель коуча сохранена');
      await this.loadInsights();
    } catch (e) {
      Utils.showToast(e.message || 'Не удалось сохранить', 'danger');
    }
  }

  static async dismissCoachCards(cardIds, sessions, profile) {
    const latestId = CoachGoal.latestCompletedSessionId(sessions);
    const currentInbox = CoachGoal.fromProfileInbox(profile);
    const next = CoachGoal.dismissCards(currentInbox, cardIds, latestId);
    try {
      const updated = await Api.updateProfile({ coachInbox: next });
      if (window.Auth) Auth.profile = updated;
      await this.loadInsights();
    } catch (e) {
      Utils.showToast(e.message || 'Не удалось отметить', 'danger');
    }
  }

  static async loadInsights() {
    this.destroyChart();
    const container = document.getElementById('app');
    container.innerHTML = `
      <div class="app-header fade-in">
        <div class="d-flex align-items-center">
          <button class="btn btn-link text-white me-2" onclick="Router.navigate('progress')" aria-label="Назад к прогрессу">
            <i class="bi bi-arrow-left" aria-hidden="true"></i>
          </button>
          <div class="flex-grow-1">
            <h4 class="mb-0">Коуч</h4>
            <p class="text-muted mb-0 small">По цели и дневнику · правила, без ИИ</p>
          </div>
        </div>
      </div>
      <div class="container fade-in">
        <div id="coach-goal-bar" class="coach-goal-bar mb-3"></div>
        <div id="insights-list" class="insight-list"></div>
      </div>
    `;

    const to = Utils.getTodayStr();
    const fromDate = new Date();
    fromDate.setMonth(fromDate.getMonth() - 5);
    fromDate.setDate(1);
    const from = Utils.toDateStr(fromDate);

    let planned = [];
    let sessions = [];
    let exercises = [];
    let bodyWeight = [];
    let templates = [];
    let profile = null;
    try {
      [planned, sessions, exercises, bodyWeight, templates, profile] = await Promise.all([
        Api.listPlanned(from, to),
        Api.listSessions(),
        Api.listExercises().catch(() => DB.loadExercisesCache().then((c) => c || [])),
        Api.listBodyWeight().catch(() => []),
        Api.listTemplates().catch(() => []),
        Api.getProfile().catch(() => null)
      ]);
    } catch (e) {
      Utils.showToast(e.message || 'Нет данных', 'warning');
    }

    const goal = window.CoachGoal?.fromProfile ? CoachGoal.fromProfile(profile) : null;
    const inbox = window.CoachGoal?.fromProfileInbox ? CoachGoal.fromProfileInbox(profile) : null;

    const pack = window.AnalyticsCoach?.buildPack
      ? AnalyticsCoach.buildPack({
        planned,
        sessions,
        bodyWeightEntries: bodyWeight,
        exercises,
        templates,
        goal,
        inbox,
        from,
        to,
        today: to
      })
      : window.AnalyticsInsights
        ? AnalyticsInsights.buildCards({
          planned,
          sessions,
          bodyWeightEntries: bodyWeight,
          exercises,
          from,
          to,
          today: to
        })
        : { cards: [], hubHint: 'Модуль коуча не загружен', counts: {} };

    const goalBar = document.getElementById('coach-goal-bar');
    if (goalBar) {
      const summary = window.CoachGoal?.summaryLine
        ? CoachGoal.summaryLine(goal, exercises)
        : (goal ? 'Цель задана' : 'Цель не задана');
      const dismissable = (pack.cards || []).filter((c) => c.id !== 'coach-brief');
      goalBar.innerHTML = `
        <div class="coach-goal-bar-text">
          <div class="coach-goal-bar-label">Цель</div>
          <div class="coach-goal-bar-value">${Utils.escapeHtml(summary)}</div>
        </div>
        <div class="coach-goal-bar-actions">
          ${dismissable.length ? `
            <button type="button" class="btn btn-sm btn-outline-secondary" id="coach-read-all-btn" title="Скрыть до следующей тренировки">
              Прочитано
            </button>
          ` : ''}
          <button type="button" class="btn btn-sm btn-outline-light" id="coach-goal-edit-btn">
            ${goal ? 'Изменить' : 'Задать'}
          </button>
        </div>
      `;
      goalBar.querySelector('#coach-goal-edit-btn')?.addEventListener('click', () => {
        this.editCoachGoal(exercises, sessions);
      });
      goalBar.querySelector('#coach-read-all-btn')?.addEventListener('click', () => {
        this.dismissCoachCards(dismissable.map((c) => c.id), sessions, profile);
      });
    }

    const list = document.getElementById('insights-list');
    if (!list) return;

    if (!pack.cards?.length) {
      list.innerHTML = Utils.emptyStateHtml({
        icon: 'bi-mortarboard',
        title: 'Пока рано для коуча',
        text: 'Задай цель и накопи чуть больше тренировок — тогда здесь появятся советы.'
      });
      return;
    }

    const ctaRoute = {
      missed: 'progress-missed',
      exercises: 'progress-exercises',
      'body-weight': 'progress-body-weight',
      templates: 'templates',
      goal: null
    };
    const ctaLabel = {
      missed: 'К пропускам',
      exercises: 'К упражнениям',
      'body-weight': 'К весу',
      templates: 'К шаблонам',
      goal: 'Изменить цель'
    };

    const severityLabel = {
      warn: 'Замечание',
      ok: 'Норма',
      info: 'Заметка'
    };

    list.innerHTML = pack.cards.map((card) => {
      const isCoach = card.kind === 'coach';
      const badge = isCoach
        ? (card.id === 'coach-brief' ? 'Коуч' : 'Совет')
        : (severityLabel[card.severity] || 'Заметка');
      const showCta = card.cta && (card.cta === 'goal' || ctaRoute[card.cta]);
      const canDismiss = card.id !== 'coach-brief';
      return `
      <article class="insight-card insight-${Utils.escapeHtml(card.severity || 'info')}${isCoach ? ' insight-coach' : ''}${card.id === 'coach-brief' ? ' insight-brief' : ''}" data-card-id="${Utils.escapeHtml(card.id)}">
        <div class="insight-card-top">
          <span class="insight-severity">${badge}</span>
          ${card.meta ? `<span class="insight-meta">${Utils.escapeHtml(card.meta)}</span>` : ''}
        </div>
        <h6 class="insight-title">${Utils.escapeHtml(card.title)}</h6>
        <p class="insight-body mb-0">${Utils.escapeHtml(card.body)}</p>
        <div class="insight-card-actions mt-3">
          ${showCta ? `
            <button type="button" class="btn btn-sm btn-outline-light insight-cta"
              data-insight-cta="${Utils.escapeHtml(card.cta)}">
              ${Utils.escapeHtml(ctaLabel[card.cta] || 'Открыть')}
            </button>
          ` : ''}
          ${canDismiss ? `
            <button type="button" class="btn btn-sm btn-link text-muted insight-dismiss" data-dismiss-id="${Utils.escapeHtml(card.id)}">
              Прочитано
            </button>
          ` : ''}
        </div>
      </article>`;
    }).join('');

    list.querySelectorAll('[data-insight-cta]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.insightCta;
        if (key === 'goal') {
          this.editCoachGoal(exercises, sessions);
          return;
        }
        const route = ctaRoute[key];
        if (route) Router.navigate(route);
      });
    });

    list.querySelectorAll('[data-dismiss-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.dismissCoachCards([btn.dataset.dismissId], sessions, profile);
      });
    });
  }
}

window.ProgressManager = ProgressManager;
