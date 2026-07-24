class ProgressManager {
  static chart = null;
  static allExercises = [];
  static templates = [];
  static showAll = false;

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

    const templateOptions = this.templates
      .map((t) => `<option value="${Utils.escapeHtml(t.id)}">${Utils.escapeHtml(t.name)}</option>`)
      .join('');

    container.innerHTML = `
      <div class="app-header fade-in">
        <h4>Прогресс</h4>
        <p class="text-muted mb-0 small">Вес и объём по упражнению</p>
      </div>
      <div class="container fade-in">
        <div class="card mb-3">
          <div class="card-body">
            <label class="form-label">Шаблон</label>
            <select class="form-select mb-3" id="progress-template" ${this.templates.length ? '' : 'disabled'}>
              ${templateOptions || '<option value="">Нет шаблонов</option>'}
            </select>

            <div class="d-flex justify-content-between align-items-center mb-2">
              <label class="form-label mb-0">Упражнение</label>
              <button type="button" class="btn btn-sm btn-outline-light" id="progress-toggle-all">
                ${this.showAll ? 'Только из шаблона' : 'Показать все'}
              </button>
            </div>
            <input type="text" class="form-control mb-2" id="progress-search" placeholder="Поиск...">
            <select class="form-select mb-0" id="progress-exercise" size="6"></select>
            <p class="text-muted small mt-2 mb-0" id="progress-source-hint"></p>
          </div>
        </div>

        <div class="card mb-3 chart-card">
          <div class="card-body">
            <canvas id="progress-chart" height="220"></canvas>
            <p class="text-muted small mt-2 mb-0" id="progress-hint">Выбери упражнение</p>
          </div>
        </div>
      </div>
    `;

    const templateSelect = document.getElementById('progress-template');
    const exerciseSelect = document.getElementById('progress-exercise');
    const search = document.getElementById('progress-search');
    const toggleBtn = document.getElementById('progress-toggle-all');

    if (defaultTemplateId) templateSelect.value = defaultTemplateId;

    const refreshList = () => {
      this.fillExerciseSelect(templateSelect.value, search.value);
    };

    templateSelect.addEventListener('change', () => {
      if (!this.showAll) refreshList();
    });
    search.addEventListener('input', refreshList);
    toggleBtn.addEventListener('click', () => {
      this.showAll = !this.showAll;
      toggleBtn.textContent = this.showAll ? 'Только из шаблона' : 'Показать все';
      refreshList();
    });
    exerciseSelect.addEventListener('change', () => this.renderChart(exerciseSelect.value));

    refreshList();
    if (exerciseSelect.value) this.renderChart(exerciseSelect.value);
  }

  static fillExerciseSelect(templateId, searchQuery) {
    const select = document.getElementById('progress-exercise');
    const hint = document.getElementById('progress-source-hint');
    if (!select) return;

    let list = this.allExercises;
    if (!this.showAll && templateId) {
      const template = this.templates.find((t) => t.id === templateId);
      const ids = new Set((template?.exercises || []).map((e) => e.exerciseId));
      list = this.allExercises.filter((ex) => ids.has(ex.id));
      if (hint) {
        hint.textContent = list.length
          ? `${list.length} упр. из шаблона «${template?.name || ''}»`
          : 'В шаблоне пока нет упражнений — добавь их или нажми «Показать все»';
      }
    } else if (hint) {
      hint.textContent = `Вся база · ${this.allExercises.length} упражнений`;
    }

    const q = (searchQuery || '').toLowerCase().trim();
    if (q) {
      list = list.filter((ex) => ex.name.toLowerCase().includes(q));
    }

    const prev = select.value;
    select.innerHTML = list.length
      ? list.map((ex) =>
        `<option value="${Utils.escapeHtml(ex.id)}">${Utils.escapeHtml(ex.name)}</option>`
      ).join('')
      : '<option value="" disabled>Ничего не найдено</option>';

    if (prev && list.some((ex) => ex.id === prev)) {
      select.value = prev;
    }
  }

  static async renderChart(exerciseId) {
    const hint = document.getElementById('progress-hint');
    const canvas = document.getElementById('progress-chart');
    if (!exerciseId || !canvas) return;

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
      hint.textContent = 'Пока нет завершённых подходов по этому упражнению';
      return;
    }

    hint.textContent = `${points.length} тренировок · макс. вес и объём (кг×повт)`;

    this.chart = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: points.map((p) => p.date),
        datasets: [
          {
            label: 'Макс. вес (кг)',
            data: points.map((p) => p.maxWeight),
            borderColor: '#ff5a6a',
            backgroundColor: 'rgba(255,90,106,0.12)',
            tension: 0.3,
            borderWidth: 2,
            pointRadius: 3,
            yAxisID: 'y'
          },
          {
            label: 'Объём',
            data: points.map((p) => p.volume),
            borderColor: '#5ec8ff',
            backgroundColor: 'rgba(94,200,255,0.1)',
            tension: 0.3,
            borderWidth: 2,
            pointRadius: 3,
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        interaction: { mode: 'index', intersect: false },
        scales: {
          y: {
            type: 'linear',
            position: 'left',
            title: { display: true, text: 'Вес', color: '#9aa3b5' },
            ticks: { color: '#9aa3b5' },
            grid: { color: 'rgba(255,255,255,0.06)' }
          },
          y1: {
            type: 'linear',
            position: 'right',
            title: { display: true, text: 'Объём', color: '#9aa3b5' },
            ticks: { color: '#9aa3b5' },
            grid: { drawOnChartArea: false }
          },
          x: {
            ticks: { color: '#9aa3b5', maxRotation: 45 },
            grid: { color: 'rgba(255,255,255,0.04)' }
          }
        },
        plugins: {
          legend: { labels: { color: '#e8ecf4' } }
        }
      }
    });
  }
}

window.ProgressManager = ProgressManager;
