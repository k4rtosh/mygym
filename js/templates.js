// CRUD для шаблонов тренировок

class TemplatesManager {
    static async loadTemplatesList() {
        const user = Auth.getCurrentUser();
        const templates = await DB.getByIndex('templates', 'userId', user.id);
        
        const container = document.getElementById('app');
        
        if (templates.length === 0) {
            container.innerHTML = `
                <div class="app-header fade-in">
                    <div class="d-flex justify-content-between align-items-center">
                        <h4 class="mb-0">Шаблоны тренировок</h4>
                        <button class="btn btn-primary btn-sm" onclick="TemplatesManager.createNew()">
                            <i class="bi bi-plus"></i> Новый
                        </button>
                    </div>
                </div>
                
                <div class="container fade-in">
                    <div class="text-center py-5">
                        <i class="bi bi-inbox display-1 text-muted"></i>
                        <p class="text-muted mt-3">Нет созданных шаблонов</p>
                        <button class="btn btn-primary" onclick="TemplatesManager.createNew()">
                            Создать первый шаблон
                        </button>
                    </div>
                </div>
                
                <nav class="bottom-nav">
                    <div class="nav-item" onclick="Router.navigate('home')">
                        <i class="bi bi-house"></i>
                        <span>Главная</span>
                    </div>
                    <div class="nav-item active" onclick="Router.navigate('templates')">
                        <i class="bi bi-collection"></i>
                        <span>Шаблоны</span>
                    </div>
                    <div class="nav-item" onclick="Router.navigate('history')">
                        <i class="bi bi-clock-history"></i>
                        <span>История</span>
                    </div>
                    <div class="nav-item" onclick="Router.navigate('profile')">
                        <i class="bi bi-person"></i>
                        <span>Профиль</span>
                    </div>
                </nav>
            `;
            return;
        }
        
        let templatesHTML = templates.map(function(template) {
            const exercisesCount = template.exercises ? template.exercises.length : 0;
            return `
                <div class="card mb-3" onclick="Router.navigate('template-edit', {id: '${template.id}'})">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-center">
                            <div>
                                <h5 class="mb-1">${template.name}</h5>
                                <small class="text-muted">${exercisesCount} упражнений</small>
                            </div>
                            <div>
                                <button class="btn btn-sm btn-outline-primary me-2" 
                                        onclick="event.stopPropagation(); Router.navigate('workout', {templateId: '${template.id}'})">
                                    <i class="bi bi-play"></i>
                                </button>
                                <button class="btn btn-sm btn-outline-danger" 
                                        onclick="event.stopPropagation(); TemplatesManager.deleteTemplate('${template.id}')">
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
                    <h4 class="mb-0">Шаблоны тренировок</h4>
                    <button class="btn btn-primary btn-sm" onclick="TemplatesManager.createNew()">
                        <i class="bi bi-plus"></i> Новый
                    </button>
                </div>
            </div>
            
            <div class="container fade-in">
                <div id="templates-list">
                    ${templatesHTML}
                </div>
            </div>
            
            <nav class="bottom-nav">
                <div class="nav-item" onclick="Router.navigate('home')">
                    <i class="bi bi-house"></i>
                    <span>Главная</span>
                </div>
                <div class="nav-item active" onclick="Router.navigate('templates')">
                    <i class="bi bi-collection"></i>
                    <span>Шаблоны</span>
                </div>
                <div class="nav-item" onclick="Router.navigate('history')">
                    <i class="bi bi-clock-history"></i>
                    <span>История</span>
                </div>
                <div class="nav-item" onclick="Router.navigate('profile')">
                    <i class="bi bi-person"></i>
                    <span>Профиль</span>
                </div>
            </nav>
        `;
    }
    
    static async createNew() {
        const user = Auth.getCurrentUser();
        const newTemplate = {
            id: Utils.generateId(),
            userId: user.id,
            name: 'Новый шаблон',
            exercises: [],
            created: new Date().toISOString()
        };
        
        await DB.add('templates', newTemplate);
        Router.navigate('template-edit', {id: newTemplate.id});
    }
    
    static async loadTemplateEditor(templateId) {
        const template = await DB.get('templates', templateId);
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
                    <h4 class="mb-0">Редактор шаблона</h4>
                    <button class="btn btn-primary btn-sm" id="save-template-btn">
                        <i class="bi bi-check-lg"></i> Сохранить
                    </button>
                </div>
            </div>
            
            <div class="container fade-in">
                <div class="card mb-3">
                    <div class="card-body">
                        <label class="form-label">Название шаблона</label>
                        <input type="text" class="form-control" id="template-name" 
                               value="${template.name}" placeholder="Например: День груди">
                    </div>
                </div>
                
                <div id="template-exercises"></div>
                
                <button class="btn btn-outline-primary w-100 mt-3" id="add-exercise-btn">
                    <i class="bi bi-plus-circle"></i> Добавить упражнение
                </button>
            </div>
        `;
        
        // Загружаем упражнения шаблона
        await this.renderTemplateExercises(template);
        
        // Сохраняем изменения названия
        document.getElementById('save-template-btn').addEventListener('click', async () => {
            const nameInput = document.getElementById('template-name');
            template.name = nameInput.value || 'Без названия';
            await DB.put('templates', template);
            Utils.showToast('Шаблон сохранён');
            Router.navigate('templates');
        });
        
        // Добавление упражнения
        document.getElementById('add-exercise-btn').addEventListener('click', async () => {
            await this.showExerciseSelector(template);
        });
        
        // Автосохранение названия при вводе
        document.getElementById('template-name').addEventListener('input', Utils.debounce(async () => {
            const nameInput = document.getElementById('template-name');
            template.name = nameInput.value || 'Без названия';
            await DB.put('templates', template);
        }, 1000));
    }
    
    static async renderTemplateExercises(template) {
        const container = document.getElementById('template-exercises');
        if (!container) return;
        
        const allExercises = await DB.getAll('exercises');
        
        if (!template.exercises || template.exercises.length === 0) {
            container.innerHTML = `
                <div class="text-center py-3">
                    <p class="text-muted">Нет добавленных упражнений</p>
                </div>
            `;
            return;
        }
        
        let exercisesHTML = template.exercises.map((ex, index) => {
            const exerciseInfo = allExercises.find(e => e.id === ex.exerciseId);
            const exerciseName = exerciseInfo ? exerciseInfo.name : 'Упражнение удалено';
            
            return `
                <div class="card mb-3">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-center mb-3">
                            <h6 class="mb-0">${exerciseName}</h6>
                            <button class="btn btn-sm btn-outline-danger remove-exercise-btn" 
                                    data-index="${index}">
                                <i class="bi bi-x"></i>
                            </button>
                        </div>
                        <div class="row">
                            <div class="col-6">
                                <label class="form-label small text-muted">Подходы</label>
                                <input type="number" class="form-control form-control-sm sets-input" 
                                       value="${ex.plannedSets || 3}" min="1" max="10"
                                       data-index="${index}" data-field="plannedSets">
                            </div>
                            <div class="col-6">
                                <label class="form-label small text-muted">Повторения</label>
                                <input type="number" class="form-control form-control-sm reps-input" 
                                       value="${ex.plannedReps || 10}" min="1" max="100"
                                       data-index="${index}" data-field="plannedReps">
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        container.innerHTML = exercisesHTML;
        
        // Обработчики для удаления упражнений
        container.querySelectorAll('.remove-exercise-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const index = parseInt(e.currentTarget.dataset.index);
                await this.removeExercise(template, index);
            });
        });
        
        // Обработчики для изменения подходов
        container.querySelectorAll('.sets-input').forEach(input => {
            input.addEventListener('change', async (e) => {
                const index = parseInt(e.target.dataset.index);
                const field = e.target.dataset.field;
                const value = parseInt(e.target.value) || 3;
                await this.updateExercisePlan(template, index, field, value);
            });
        });
        
        // Обработчики для изменения повторений
        container.querySelectorAll('.reps-input').forEach(input => {
            input.addEventListener('change', async (e) => {
                const index = parseInt(e.target.dataset.index);
                const field = e.target.dataset.field;
                const value = parseInt(e.target.value) || 10;
                await this.updateExercisePlan(template, index, field, value);
            });
        });
    }
    
    static async showExerciseSelector(template) {
        const allExercises = await DB.getAll('exercises');
        
        // Создаем модальное окно для выбора упражнения
        const modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.setAttribute('tabindex', '-1');
        
        let exercisesHTML = allExercises.map(ex => `
            <button class="btn btn-outline-light w-100 mb-2 text-start exercise-select-btn" 
                    data-exercise-id="${ex.id}">
                <strong>${ex.name}</strong><br>
                <small class="text-muted">${ex.category} &middot; ${ex.muscle}</small>
            </button>
        `).join('');
        
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
                            ${exercisesHTML}
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        const bsModal = new bootstrap.Modal(modal);
        bsModal.show();
        
        // Поиск упражнений
        modal.querySelector('#exercise-search').addEventListener('input', (e) => {
            const search = e.target.value.toLowerCase();
            const buttons = modal.querySelectorAll('.exercise-select-btn');
            buttons.forEach(btn => {
                const text = btn.textContent.toLowerCase();
                btn.style.display = text.includes(search) ? '' : 'none';
            });
        });
        
        // Выбор упражнения
        modal.querySelectorAll('.exercise-select-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const exerciseId = btn.dataset.exerciseId;
                if (!template.exercises) template.exercises = [];
                
                template.exercises.push({
                    exerciseId: exerciseId,
                    plannedSets: 3,
                    plannedReps: 10
                });
                
                await DB.put('templates', template);
                await this.renderTemplateExercises(template);
                
                bsModal.hide();
                modal.remove();
            });
        });
        
        modal.addEventListener('hidden.bs.modal', () => {
            modal.remove();
        });
    }
    
    static async removeExercise(template, exerciseIndex) {
        const confirmed = await Utils.confirm('Удалить упражнение из шаблона?');
        if (!confirmed) return;
        
        template.exercises.splice(exerciseIndex, 1);
        await DB.put('templates', template);
        await this.renderTemplateExercises(template);
        Utils.showToast('Упражнение удалено');
    }
    
    static async updateExercisePlan(template, exerciseIndex, field, value) {
        template.exercises[exerciseIndex][field] = parseInt(value);
        await DB.put('templates', template);
    }
    
    static async deleteTemplate(templateId) {
        const confirmed = await Utils.confirm('Удалить шаблон? Это действие нельзя отменить.');
        if (!confirmed) return;
        
        await DB.delete('templates', templateId);
        Utils.showToast('Шаблон удалён');
        await this.loadTemplatesList();
    }
}

window.TemplatesManager = TemplatesManager;