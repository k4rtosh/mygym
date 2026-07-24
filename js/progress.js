class ProgressManager {
  static chart = null;

  static async load() {
    const container = document.getElementById('app');
    let exercises = [];
    try {
      exercises = await Api.listExercises();
      await DB.cacheExercises(exercises);
    } catch (_) {
      exercises = (await DB.loadExercisesCache()) || [];
    }

    const options = exercises
      .map((ex) => `<option value="${Utils.escapeHtml(ex.id)}">${Utils.escapeHtml(ex.name)}</option>`)
      .join('');

    container.innerHTML = `
      <div class="app-header fade-in"><h4>Прогресс</h4></div>
      <div class="container fade-in">
        <label class="form-label">Упражнение</label>
        <input type="text" class="form-control mb-2" id="progress-search" placeholder="Поиск...">
        <select class="form-select mb-3" id="progress-exercise" size="8">
          ${options || '<option disabled>Нет упражнений</option>'}
        </select>
        <div class="card mb-3">
          <div class="card-body">
            <canvas id="progress-chart" height="220"></canvas>
            <p class="text-muted small mt-2 mb-0" id="progress-hint">Выбери упражнение</p>
          </div>
        </div>
      </div>
      ${Utils.bottomNav('progress')}
    `;

    const select = document.getElementById('progress-exercise');
    const search = document.getElementById('progress-search');
    search.addEventListener('input', () => {
      const q = search.value.toLowerCase();
      Array.from(select.options).forEach((opt) => {
        opt.hidden = q && !opt.text.toLowerCase().includes(q);
      });
    });
    select.addEventListener('change', () => this.renderChart(select.value));
    if (select.value) this.renderChart(select.value);
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
            borderColor: '#e94560',
            backgroundColor: 'rgba(233,69,96,0.15)',
            tension: 0.25,
            yAxisID: 'y'
          },
          {
            label: 'Объём',
            data: points.map((p) => p.volume),
            borderColor: '#0dcaf0',
            backgroundColor: 'rgba(13,202,240,0.1)',
            tension: 0.25,
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
            title: { display: true, text: 'Вес', color: '#aaa' },
            ticks: { color: '#aaa' },
            grid: { color: 'rgba(255,255,255,0.08)' }
          },
          y1: {
            type: 'linear',
            position: 'right',
            title: { display: true, text: 'Объём', color: '#aaa' },
            ticks: { color: '#aaa' },
            grid: { drawOnChartArea: false }
          },
          x: {
            ticks: { color: '#aaa', maxRotation: 45 },
            grid: { color: 'rgba(255,255,255,0.05)' }
          }
        },
        plugins: {
          legend: { labels: { color: '#e0e0e0' } }
        }
      }
    });
  }
}

window.ProgressManager = ProgressManager;
