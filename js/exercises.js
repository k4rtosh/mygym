class ExercisesManager {
  static async loadExercisesList() {
    const container = document.getElementById('app');
    let exercises = [];
    try {
      exercises = await Api.listExercises();
      await DB.cacheExercises(exercises);
    } catch (e) {
      exercises = (await DB.loadExercisesCache()) || [];
      if (!exercises.length) Utils.showToast(e.message || 'Нет сети', 'danger');
    }

    const categories = {};
    exercises.forEach((ex) => {
      if (!categories[ex.category]) categories[ex.category] = [];
      categories[ex.category].push(ex);
    });

    let html = '';
    Object.keys(categories).sort().forEach((category) => {
      html += `<h5 class="mt-3 mb-2 text-primary">${Utils.escapeHtml(category)}</h5>`;
      categories[category].forEach((ex) => {
        html += `
          <div class="card mb-2 exercise-item" data-name="${Utils.escapeHtml(ex.name.toLowerCase())}">
            <div class="card-body py-2">
              <div class="d-flex justify-content-between align-items-center">
                <div>
                  <strong>${Utils.escapeHtml(ex.name)}</strong><br>
                  <small class="text-muted">${Utils.escapeHtml(ex.muscle)} · ${Utils.escapeHtml(ex.type)}</small>
                </div>
                <button class="btn btn-sm btn-outline-info" onclick="ExercisesManager.showDetails('${Utils.escapeHtml(ex.id)}')"
                  aria-label="Подробнее: ${Utils.escapeHtml(ex.name)}">
                  <i class="bi bi-info-circle" aria-hidden="true"></i>
                </button>
              </div>
            </div>
          </div>
        `;
      });
    });

    container.innerHTML = `
      <div class="app-header fade-in"><h4>База упражнений</h4></div>
      <div class="container fade-in">
        <label class="visually-hidden" for="exercise-search">Поиск упражнений</label>
        <input type="search" class="form-control mb-3" id="exercise-search"
          placeholder="Поиск…" autocomplete="off">
        <div id="exercises-list">${
          html || Utils.emptyStateHtml({
            icon: 'bi-journal-x',
            title: 'Каталог пуст',
            text: 'Упражнения подтянутся из облака при следующем входе. В демо они загружаются локально.'
          })
        }</div>
      </div>
      ${Utils.bottomNav('profile')}
    `;

    const searchInput = document.getElementById('exercise-search');
    searchInput?.addEventListener('input', () => {
      const search = searchInput.value.toLowerCase();
      document.querySelectorAll('.exercise-item').forEach((item) => {
        item.style.display = (item.getAttribute('data-name') || '').includes(search) ? '' : 'none';
      });
    });
  }

  static async showDetails(exerciseId) {
    let exercise;
    try {
      const all = await Api.listExercises();
      exercise = all.find((e) => e.id === exerciseId);
    } catch (_) {
      const cached = await DB.loadExercisesCache();
      exercise = (cached || []).find((e) => e.id === exerciseId);
    }
    if (!exercise) return;

    const modal = document.createElement('div');
    modal.className = 'modal fade';
    modal.tabIndex = -1;
    modal.innerHTML = `
      <div class="modal-dialog">
        <div class="modal-content bg-dark text-light">
          <div class="modal-header">
            <h5 class="modal-title">${Utils.escapeHtml(exercise.name)}</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <p><strong>Категория:</strong> ${Utils.escapeHtml(exercise.category)}</p>
            <p><strong>Мышцы:</strong> ${Utils.escapeHtml(exercise.muscle)}</p>
            <p><strong>Оборудование:</strong> ${Utils.escapeHtml(exercise.type)}</p>
            <p><strong>Описание:</strong> ${Utils.escapeHtml(exercise.description)}</p>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();
    modal.addEventListener('hidden.bs.modal', () => modal.remove());
  }
}

window.ExercisesManager = ExercisesManager;
