class ProgressManager {
  static chart = null;
  static allExercises = [];
  static templates = [];
  static showAll = false;
  static selectedId = null;

  static async load() {
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
        <h4>Прогресс</h4>
        <p class="text-muted mb-0 small">Динамика веса и объёма</p>
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
    if (q) list = list.filter((ex) => ex.name.toLowerCase().includes(q) || (ex.category || '').toLowerCase().includes(q));
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
        this.renderChart(this.selectedId);
      });
    });

    if (this.selectedId) this.renderChart(this.selectedId);
  }

  static formatShortDate(dateStr) {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    return `${d}.${m}`;
  }

  static async renderChart(exerciseId) {
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

    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }

    if (!points.length) {
      if (hint) hint.textContent = 'Пока нет завершённых подходов';
      if (statsEl) statsEl.innerHTML = '';
      return;
    }

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
}

window.ProgressManager = ProgressManager;
