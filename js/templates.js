class TemplatesManager {
  static async loadTemplatesList() {
    const container = document.getElementById('app');
    let templates = [];
    try {
      templates = await Api.listTemplates();
    } catch (e) {
      Utils.showToast(e.message || 'Нет сети', 'danger');
    }

    if (!templates.length) {
      container.innerHTML = `
        <div class="app-header fade-in">
          <div class="d-flex justify-content-between align-items-center">
            <h4 class="mb-0">Шаблоны</h4>
            <button class="btn btn-primary btn-sm" onclick="TemplatesManager.createNew()">
              <i class="bi bi-plus"></i> Новый
            </button>
          </div>
        </div>
        <div class="container fade-in text-center py-5">
          <i class="bi bi-inbox display-1 text-muted"></i>
          <p class="text-muted mt-3">Нет шаблонов</p>
          <button class="btn btn-primary" onclick="TemplatesManager.createNew()">Создать первый</button>
        </div>
        ${Utils.bottomNav('templates')}
      `;
      return;
    }

    const list = templates.map((t) => {
      const count = t.exercises ? t.exercises.length : 0;
      return `
        <div class="card mb-3" onclick="Router.navigate('template-edit', {id: '${t.id}'})">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-center">
              <div>
                <h5 class="mb-1">${Utils.escapeHtml(t.name)}</h5>
                <small class="text-muted">${count} упражнений</small>
              </div>
              <div>
                <button class="btn btn-sm btn-outline-primary me-2"
                  onclick="event.stopPropagation(); WorkoutManager.startFromTemplate('${t.id}')">
                  <i class="bi bi-play"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger"
                  onclick="event.stopPropagation(); TemplatesManager.deleteTemplate('${t.id}')">
                  <i class="bi bi-trash"></i>
                </button>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div class="app-header fade-in">
        <div class="d-flex justify-content-between align-items-center">
          <h4 class="mb-0">Шаблоны</h4>
          <button class="btn btn-primary btn-sm" onclick="TemplatesManager.createNew()">
            <i class="bi bi-plus"></i> Новый
          </button>
        </div>
      </div>
      <div class="container fade-in">${list}</div>
      ${Utils.bottomNav('templates')}
    `;
  }

  static async createNew() {
    try {
      const t = await Api.createTemplate({ name: 'Новый шаблон', exercises: [] });
      Router.navigate('template-edit', { id: t.id });
    } catch (e) {
      Utils.showToast(e.message, 'danger');
    }
  }

  static async loadTemplateEditor(templateId) {
    let template;
    try {
      template = await Api.getTemplate(templateId);
    } catch (e) {
      Utils.showToast(e.message, 'danger');
      Router.navigate('templates');
      return;
    }
    if (!template) {
      Utils.showToast('Шаблон не найден', 'danger');
      Router.navigate('templates');
      return;
    }

    const container = document.getElementById('app');
    container.innerHTML = `
      <div class="app-header fade-in">
        <div class="d-flex justify-content-between align-items-center">
          <button class="btn btn-link text-white" onclick="Router.navigate('templates')">
            <i class="bi bi-arrow-left"></i>
          </button>
          <h4 class="mb-0">Редактор</h4>
          <button class="btn btn-primary btn-sm" id="save-template-btn">
            <i class="bi bi-check-lg"></i> Сохранить
          </button>
        </div>
      </div>
      <div class="container fade-in">
        <div class="card mb-3">
          <div class="card-body">
            <label class="form-label">Название</label>
            <input type="text" class="form-control" id="template-name"
              value="${Utils.escapeHtml(template.name)}" placeholder="Например: День груди">
          </div>
        </div>
        <div id="template-exercises"></div>
        <button class="btn btn-outline-primary w-100 mt-3" id="add-exercise-btn">
          <i class="bi bi-plus-circle"></i> Добавить упражнение
        </button>
      </div>
    `;

    await this.renderTemplateExercises(template);

    document.getElementById('save-template-btn').addEventListener('click', async () => {
      const name = document.getElementById('template-name').value || 'Без названия';
      try {
        await Api.updateTemplate(template.id, { name, exercises: template.exercises || [] });
        Utils.showToast('Шаблон сохранён');
        Router.navigate('templates');
      } catch (e) {
        Utils.showToast(e.message, 'danger');
      }
    });

    document.getElementById('add-exercise-btn').addEventListener('click', () => {
      this.showExerciseSelector(template);
    });

    document.getElementById('template-name').addEventListener('input', Utils.debounce(async () => {
      const name = document.getElementById('template-name').value || 'Без названия';
      template.name = name;
      try {
        await Api.updateTemplate(template.id, { name, exercises: template.exercises || [] });
      } catch (_) { /* ignore autosave blips */ }
    }, 800));
  }

  static async renderTemplateExercises(template) {
    const container = document.getElementById('template-exercises');
    if (!container) return;

    let allExercises = [];
    try {
      allExercises = await Api.listExercises();
    } catch (_) {
      allExercises = (await DB.loadExercisesCache()) || [];
    }

    if (!template.exercises || !template.exercises.length) {
      container.innerHTML = '<div class="text-center py-3"><p class="text-muted">Нет упражнений</p></div>';
      return;
    }

    container.innerHTML = template.exercises.map((ex, index) => {
      const info = allExercises.find((e) => e.id === ex.exerciseId);
      const name = info ? info.name : 'Упражнение удалено';
      return `
        <div class="card mb-3">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-center mb-3">
              <h6 class="mb-0">${Utils.escapeHtml(name)}</h6>
              <button class="btn btn-sm btn-outline-danger remove-exercise-btn" data-index="${index}">
                <i class="bi bi-x"></i>
              </button>
            </div>
            <div class="row">
              <div class="col-6">
                <label class="form-label small text-muted">Подходы</label>
                <input type="number" class="form-control form-control-sm sets-input"
                  value="${ex.plannedSets || 3}" min="1" max="20" data-index="${index}" data-field="plannedSets">
              </div>
              <div class="col-6">
                <label class="form-label small text-muted">Повторения</label>
                <input type="number" class="form-control form-control-sm reps-input"
                  value="${ex.plannedReps || 10}" min="1" max="100" data-index="${index}" data-field="plannedReps">
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.remove-exercise-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const index = parseInt(btn.dataset.index, 10);
        if (!(await Utils.confirm('Удалить упражнение из шаблона?'))) return;
        template.exercises.splice(index, 1);
        await Api.updateTemplate(template.id, { exercises: template.exercises });
        await this.renderTemplateExercises(template);
      });
    });

    container.querySelectorAll('.sets-input, .reps-input').forEach((input) => {
      input.addEventListener('change', async () => {
        const index = parseInt(input.dataset.index, 10);
        const field = input.dataset.field;
        template.exercises[index][field] = parseInt(input.value, 10) || 1;
        await Api.updateTemplate(template.id, { exercises: template.exercises });
      });
    });
  }

  static async showExerciseSelector(template) {
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
            <h5 class="modal-title">Выберите упражнение</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <input type="text" class="form-control mb-3" id="exercise-search" placeholder="Поиск...">
            <div id="exercise-list">
              ${allExercises.map((ex) => `
                <button class="btn btn-outline-light w-100 mb-2 text-start exercise-select-btn" data-exercise-id="${Utils.escapeHtml(ex.id)}">
                  <strong>${Utils.escapeHtml(ex.name)}</strong><br>
                  <small class="text-muted">${Utils.escapeHtml(ex.category)} · ${Utils.escapeHtml(ex.muscle)}</small>
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
      btn.addEventListener('click', async () => {
        if (!template.exercises) template.exercises = [];
        template.exercises.push({
          exerciseId: btn.dataset.exerciseId,
          plannedSets: 3,
          plannedReps: 10
        });
        await Api.updateTemplate(template.id, { exercises: template.exercises });
        await this.renderTemplateExercises(template);
        bsModal.hide();
        modal.remove();
      });
    });

    modal.addEventListener('hidden.bs.modal', () => modal.remove());
  }

  static async deleteTemplate(templateId) {
    if (!(await Utils.confirm('Удалить шаблон?'))) return;
    try {
      await Api.deleteTemplate(templateId);
      Utils.showToast('Шаблон удалён');
      await this.loadTemplatesList();
    } catch (e) {
      Utils.showToast(e.message, 'danger');
    }
  }
}

window.TemplatesManager = TemplatesManager;
