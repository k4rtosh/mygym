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
          <i class="bi bi-collection display-1 text-muted"></i>
          <p class="text-muted mt-3 mb-1">Пока нет шаблонов</p>
          <p class="text-muted small mb-4">Собери список упражнений под день тренировки — подходы и повторы пишешь уже в зале.</p>
          <button class="btn btn-primary" onclick="TemplatesManager.createNew()">Создать первый</button>
        </div>
      `;
      return;
    }

    const list = templates.map((t) => {
      const count = t.exercises ? t.exercises.length : 0;
      return `
        <div class="card mb-3 tpl-list-card" onclick="Router.navigate('template-edit', {id: '${t.id}'})">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-start gap-2">
              <div class="flex-grow-1">
                <h5 class="mb-1">${Utils.escapeHtml(t.name)}</h5>
                <small class="text-muted">${count} ${this.pluralExercises(count)}</small>
              </div>
              <div class="tpl-list-actions" onclick="event.stopPropagation()">
                <button class="btn btn-sm btn-outline-primary" title="Начать"
                  onclick="WorkoutManager.startFromTemplate('${t.id}')">
                  <i class="bi bi-play-fill"></i>
                </button>
                <button class="btn btn-sm btn-outline-light" title="Копировать"
                  onclick="TemplatesManager.duplicateTemplate('${t.id}')">
                  <i class="bi bi-copy"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger" title="Удалить"
                  onclick="TemplatesManager.deleteTemplate('${t.id}')">
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
          <div>
            <h4 class="mb-0">Шаблоны</h4>
            <p class="text-muted small mb-0">${templates.length} шт.</p>
          </div>
          <button class="btn btn-primary btn-sm" onclick="TemplatesManager.createNew()">
            <i class="bi bi-plus"></i> Новый
          </button>
        </div>
      </div>
      <div class="container fade-in">${list}</div>
    `;
  }

  static pluralExercises(n) {
    const m10 = n % 10;
    const m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return 'упражнение';
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'упражнения';
    return 'упражнений';
  }

  static async createNew() {
    const name = window.prompt('Название шаблона', 'Новый шаблон');
    if (name === null) return;
    try {
      const t = await Api.createTemplate({
        name: (name || '').trim() || 'Новый шаблон',
        exercises: []
      });
      Router.navigate('template-edit', { id: t.id });
    } catch (e) {
      Utils.showToast(e.message, 'danger');
    }
  }

  static async duplicateTemplate(templateId) {
    try {
      const src = await Api.getTemplate(templateId);
      if (!src) return;
      const copy = await Api.createTemplate({
        name: `${src.name} (копия)`,
        description: src.description || '',
        exercises: (src.exercises || []).map((ex) => ({ exerciseId: ex.exerciseId }))
      });
      Utils.showToast('Шаблон скопирован');
      Router.navigate('template-edit', { id: copy.id });
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

    if (!Array.isArray(template.exercises)) template.exercises = [];
    // Normalize: keep only exerciseId for editor simplicity
    template.exercises = template.exercises.map((ex) => ({ exerciseId: ex.exerciseId }));

    const container = document.getElementById('app');
    container.innerHTML = `
      <div class="app-header fade-in">
        <div class="d-flex justify-content-between align-items-center">
          <button class="btn btn-link text-white" onclick="Router.navigate('templates')">
            <i class="bi bi-arrow-left"></i>
          </button>
          <h4 class="mb-0">Редактор</h4>
          <button class="btn btn-primary btn-sm" id="save-template-btn">
            <i class="bi bi-check-lg"></i> Готово
          </button>
        </div>
      </div>
      <div class="container fade-in">
        <div class="card mb-3">
          <div class="card-body">
            <label class="form-label">Название</label>
            <input type="text" class="form-control" id="template-name"
              value="${Utils.escapeHtml(template.name)}" placeholder="Например: День груди">
            <p class="text-muted small mt-2 mb-0">Собери порядок упражнений. Подходы и повторы фиксируешь на тренировке.</p>
          </div>
        </div>
        <div class="d-flex justify-content-between align-items-center mb-2">
          <h6 class="mb-0" id="tpl-ex-count">Упражнения</h6>
        </div>
        <div id="template-exercises"></div>
        <button class="btn btn-outline-primary w-100 mt-2" id="add-exercise-btn">
          <i class="bi bi-plus-circle"></i> Добавить упражнения
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
      } catch (_) { /* ignore */ }
    }, 800));
  }

  static async persistExercises(template) {
    await Api.updateTemplate(template.id, {
      name: template.name,
      exercises: template.exercises
    });
  }

  static async renderTemplateExercises(template) {
    const container = document.getElementById('template-exercises');
    const countEl = document.getElementById('tpl-ex-count');
    if (!container) return;

    let allExercises = [];
    try {
      allExercises = await Api.listExercises();
      await DB.cacheExercises(allExercises);
    } catch (_) {
      allExercises = (await DB.loadExercisesCache()) || [];
    }

    const n = template.exercises?.length || 0;
    if (countEl) countEl.textContent = n ? `Упражнения · ${n}` : 'Упражнения';

    if (!n) {
      container.innerHTML = `
        <div class="ex-pick-empty mb-2">
          Список пуст. Добавь упражнения кнопкой ниже.
        </div>
      `;
      return;
    }

    container.innerHTML = template.exercises.map((ex, index) => {
      const info = allExercises.find((e) => e.id === ex.exerciseId);
      const name = info ? info.name : 'Упражнение удалено';
      const meta = info
        ? `${info.category || ''}${info.muscle ? ' · ' + info.muscle.split(',')[0] : ''}`
        : '';
      return `
        <div class="card mb-2 tpl-ex-card">
          <div class="card-body py-3">
            <div class="d-flex gap-2 align-items-start">
              <div class="tpl-ex-order">
                <button type="button" class="btn btn-sm btn-ghost-icon move-up-btn" data-index="${index}" ${index === 0 ? 'disabled' : ''} title="Выше">
                  <i class="bi bi-chevron-up"></i>
                </button>
                <span class="tpl-ex-num">${index + 1}</span>
                <button type="button" class="btn btn-sm btn-ghost-icon move-down-btn" data-index="${index}" ${index === n - 1 ? 'disabled' : ''} title="Ниже">
                  <i class="bi bi-chevron-down"></i>
                </button>
              </div>
              <div class="flex-grow-1 min-w-0">
                <div class="tpl-ex-name">${Utils.escapeHtml(name)}</div>
                <div class="tpl-ex-meta">${Utils.escapeHtml(meta)}</div>
              </div>
              <button class="btn btn-sm btn-outline-danger remove-exercise-btn" data-index="${index}" title="Убрать">
                <i class="bi bi-x"></i>
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.remove-exercise-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const index = parseInt(btn.dataset.index, 10);
        template.exercises.splice(index, 1);
        await this.persistExercises(template);
        await this.renderTemplateExercises(template);
      });
    });

    container.querySelectorAll('.move-up-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const i = parseInt(btn.dataset.index, 10);
        if (i <= 0) return;
        const tmp = template.exercises[i - 1];
        template.exercises[i - 1] = template.exercises[i];
        template.exercises[i] = tmp;
        await this.persistExercises(template);
        await this.renderTemplateExercises(template);
      });
    });

    container.querySelectorAll('.move-down-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const i = parseInt(btn.dataset.index, 10);
        if (i >= template.exercises.length - 1) return;
        const tmp = template.exercises[i + 1];
        template.exercises[i + 1] = template.exercises[i];
        template.exercises[i] = tmp;
        await this.persistExercises(template);
        await this.renderTemplateExercises(template);
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

    const already = new Set((template.exercises || []).map((e) => e.exerciseId));
    const categories = [...new Set(allExercises.map((e) => e.category).filter(Boolean))].sort();
    const equipmentOrder = [
      'Свободный вес',
      'Блочный',
      'Хаммер',
      'Тренажёр',
      'Собственный вес',
      'Кардио'
    ];
    const equipmentTypes = equipmentOrder.filter((t) =>
      allExercises.some((e) => e.type === t)
    );

    const modal = document.createElement('div');
    modal.className = 'modal fade';
    modal.tabIndex = -1;
    modal.innerHTML = `
      <div class="modal-dialog modal-dialog-scrollable modal-fullscreen-sm-down">
        <div class="modal-content bg-dark text-light">
          <div class="modal-header">
            <h5 class="modal-title">Добавить упражнения</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="search-wrap mb-2">
              <i class="bi bi-search"></i>
              <input type="text" class="form-control" id="exercise-search" placeholder="Поиск...">
            </div>
            <div class="small text-muted mb-1">Мышцы</div>
            <div class="tpl-chip-row mb-2" id="picker-cats">
              <button type="button" class="tpl-chip active" data-cat="">Все</button>
              ${categories.map((c) => `
                <button type="button" class="tpl-chip" data-cat="${Utils.escapeHtml(c)}">${Utils.escapeHtml(c)}</button>
              `).join('')}
            </div>
            <div class="small text-muted mb-1">Оборудование</div>
            <div class="tpl-chip-row mb-3" id="picker-equip">
              <button type="button" class="tpl-chip active" data-equip="">Все</button>
              ${equipmentTypes.map((t) => `
                <button type="button" class="tpl-chip" data-equip="${Utils.escapeHtml(t)}">${Utils.escapeHtml(t)}</button>
              `).join('')}
            </div>
            <div id="exercise-list" class="picker-list"></div>
          </div>
          <div class="modal-footer border-secondary">
            <div class="me-auto text-muted small" id="picker-selected-count">Выбрано: 0</div>
            <button type="button" class="btn btn-outline-light" data-bs-dismiss="modal">Отмена</button>
            <button type="button" class="btn btn-primary" id="picker-add-btn" disabled>Добавить</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();

    const selected = new Set();
    let activeCat = '';
    let activeEquip = '';
    const listEl = modal.querySelector('#exercise-list');
    const countEl = modal.querySelector('#picker-selected-count');
    const addBtn = modal.querySelector('#picker-add-btn');
    const searchInput = modal.querySelector('#exercise-search');

    const renderList = () => {
      const q = (searchInput.value || '').toLowerCase().trim();
      let list = allExercises;
      if (activeCat) list = list.filter((e) => e.category === activeCat);
      if (activeEquip) list = list.filter((e) => e.type === activeEquip);
      if (q) {
        list = list.filter((e) =>
          e.name.toLowerCase().includes(q) ||
          (e.category || '').toLowerCase().includes(q) ||
          (e.muscle || '').toLowerCase().includes(q) ||
          (e.type || '').toLowerCase().includes(q)
        );
      }

      listEl.innerHTML = list.map((ex) => {
        const inTemplate = already.has(ex.id);
        const isSel = selected.has(ex.id);
        const metaParts = [
          ex.category || '',
          ex.type || '',
          ex.muscle ? ex.muscle.split(',')[0] : ''
        ].filter(Boolean);
        return `
          <label class="picker-item ${inTemplate ? 'is-added' : ''} ${isSel ? 'is-selected' : ''}">
            <input type="checkbox" data-id="${Utils.escapeHtml(ex.id)}"
              ${inTemplate ? 'disabled' : ''} ${isSel ? 'checked' : ''}>
            <div class="flex-grow-1 min-w-0">
              <div class="picker-name">${Utils.escapeHtml(ex.name)}</div>
              <div class="picker-meta">${Utils.escapeHtml(metaParts.join(' · '))}</div>
            </div>
            ${inTemplate ? '<span class="badge bg-secondary">уже есть</span>' : ''}
          </label>
        `;
      }).join('') || '<div class="ex-pick-empty">Ничего не найдено</div>';

      listEl.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
        cb.addEventListener('change', () => {
          if (cb.checked) selected.add(cb.dataset.id);
          else selected.delete(cb.dataset.id);
          countEl.textContent = `Выбрано: ${selected.size}`;
          addBtn.disabled = selected.size === 0;
          renderList();
        });
      });
    };

    modal.querySelector('#picker-cats').addEventListener('click', (e) => {
      const chip = e.target.closest('.tpl-chip');
      if (!chip) return;
      activeCat = chip.dataset.cat || '';
      modal.querySelectorAll('#picker-cats .tpl-chip').forEach((c) => {
        c.classList.toggle('active', c === chip);
      });
      renderList();
    });

    modal.querySelector('#picker-equip').addEventListener('click', (e) => {
      const chip = e.target.closest('.tpl-chip');
      if (!chip) return;
      activeEquip = chip.dataset.equip || '';
      modal.querySelectorAll('#picker-equip .tpl-chip').forEach((c) => {
        c.classList.toggle('active', c === chip);
      });
      renderList();
    });

    searchInput.addEventListener('input', renderList);

    addBtn.addEventListener('click', async () => {
      if (!template.exercises) template.exercises = [];
      for (const id of selected) {
        if (!already.has(id)) {
          template.exercises.push({ exerciseId: id });
          already.add(id);
        }
      }
      await this.persistExercises(template);
      await this.renderTemplateExercises(template);
      Utils.showToast(`Добавлено: ${selected.size}`);
      bsModal.hide();
      modal.remove();
    });

    renderList();
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
