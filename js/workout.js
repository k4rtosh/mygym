// Активная тренировка

class WorkoutManager {
    static currentSession = null;
    static timerInterval = null;
    static startTime = null;
    static elapsedSeconds = 0;
    static exerciseTimers = {};
    static exerciseTimes = {};
    
    static async loadStartWorkout() {
        const user = Auth.getCurrentUser();
        const templates = await DB.getByIndex('templates', 'userId', user.id);
        
        const container = document.getElementById('app');
        
        // Проверяем, есть ли уже начатая тренировка
        const activeSession = await DB.get('settings', 'activeSession');
        if (activeSession && activeSession.sessionId) {
            Router.navigate('active-workout', {sessionId: activeSession.sessionId});
            return;
        }
        
        let templatesHTML = '';
        
        if (templates.length > 0) {
            const templateButtons = templates.map(function(t) {
                const exercisesCount = t.exercises ? t.exercises.length : 0;
                return `
                    <button class="btn btn-outline-light w-100 mb-2 text-start" 
                            onclick="WorkoutManager.startFromTemplate('${t.id}')">
                        <strong>${t.name}</strong><br>
                        <small class="text-muted">${exercisesCount} упражнений</small>
                    </button>
                `;
            }).join('');
            
            templatesHTML = `
                <div class="card mb-3">
                    <div class="card-header">
                        <h6 class="mb-0">Выберите шаблон</h6>
                    </div>
                    <div class="card-body">
                        ${templateButtons}
                    </div>
                </div>
            `;
        }
        
        container.innerHTML = `
            <div class="app-header fade-in">
                <div class="d-flex align-items-center">
                    <button class="btn btn-link text-white me-2" onclick="Router.navigate('home')">
                        <i class="bi bi-arrow-left"></i>
                    </button>
                    <h4 class="mb-0">Новая тренировка</h4>
                </div>
            </div>
            
            <div class="container fade-in">
                ${templatesHTML}
                
                <div class="card">
                    <div class="card-body text-center">
                        <p class="mb-3">Или начните пустую тренировку</p>
                        <button class="btn btn-primary w-100" onclick="WorkoutManager.startEmpty()">
                            <i class="bi bi-lightning"></i> Начать пустую тренировку
                        </button>
                    </div>
                </div>
            </div>
            
            <nav class="bottom-nav">
                <div class="nav-item" onclick="Router.navigate('home')">
                    <i class="bi bi-house"></i>
                    <span>Главная</span>
                </div>
                <div class="nav-item" onclick="Router.navigate('templates')">
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
    
    static async startFromTemplate(templateId) {
        const template = await DB.get('templates', templateId);
        if (!template) {
            Utils.showToast('Шаблон не найден', 'danger');
            return;
        }
        
        const sessionId = Utils.generateId();
        const user = Auth.getCurrentUser();
        
        const session = {
            id: sessionId,
            userId: user.id,
            templateId: templateId,
            templateName: template.name,
            date: Utils.getTodayStr(),
            startTime: new Date().toISOString(),
            exercises: [],
            completed: false
        };
        
        // Копируем упражнения из шаблона
        if (template.exercises && template.exercises.length > 0) {
            session.exercises = template.exercises.map(function(ex) {
                return {
                    exerciseId: ex.exerciseId,
                    plannedSets: ex.plannedSets || 3,
                    plannedReps: ex.plannedReps || 10,
                    sets: [],
                    completed: false,
                    exerciseTime: 0
                };
            });
        }
        
        await DB.add('sessions', session);
        
        // Сохраняем активную сессию
        await DB.put('settings', {
            key: 'activeSession',
            sessionId: sessionId
        });
        
        Router.navigate('active-workout', {sessionId: sessionId});
    }
    
    static async startEmpty() {
        const sessionId = Utils.generateId();
        const user = Auth.getCurrentUser();
        
        const session = {
            id: sessionId,
            userId: user.id,
            templateName: 'Свободная тренировка',
            date: Utils.getTodayStr(),
            startTime: new Date().toISOString(),
            exercises: [],
            completed: false
        };
        
        await DB.add('sessions', session);
        
        await DB.put('settings', {
            key: 'activeSession',
            sessionId: sessionId
        });
        
        Router.navigate('active-workout', {sessionId: sessionId});
    }
    
    static async startActiveWorkout(sessionId) {
        this.currentSession = await DB.get('sessions', sessionId);
        if (!this.currentSession) {
            Utils.showToast('Тренировка не найдена', 'danger');
            Router.navigate('workout');
            return;
        }
        
        // Проверяем, не завершена ли уже тренировка
        if (this.currentSession.endTime) {
            await DB.delete('settings', 'activeSession');
            Router.navigate('history-detail', {sessionId: sessionId});
            return;
        }
        
        this.startTime = new Date(this.currentSession.startTime);
        this.startTimer();
        
        // Восстанавливаем таймеры упражнений
        this.restoreExerciseTimers();
        
        await this.renderActiveWorkout();
    }
    
    static startTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }
        
        this.timerInterval = setInterval(() => {
            this.elapsedSeconds = Math.floor((new Date() - this.startTime) / 1000);
            const timerDisplay = document.getElementById('timer-display');
            if (timerDisplay) {
                timerDisplay.textContent = Utils.formatTime(this.elapsedSeconds);
            }
        }, 1000);
    }
    
    static stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }
    
    static async renderActiveWorkout() {
        if (!this.currentSession) return;
        
        const container = document.getElementById('app');
        const allExercises = await DB.getAll('exercises');
        
        let exercisesHTML = '';
        
        if (this.currentSession.exercises && this.currentSession.exercises.length > 0) {
            exercisesHTML = this.currentSession.exercises.map((ex, index) => {
                const exerciseInfo = allExercises.find(e => e.id === ex.exerciseId);
                const exerciseName = exerciseInfo ? exerciseInfo.name : 'Неизвестное упражнение';
                const timerValue = this.exerciseTimes[index] || ex.exerciseTime || 0;
                const isTimerRunning = !!this.exerciseTimers[index];
                
                return `
                    <div class="card mb-3 ${ex.completed ? 'border-success' : ''}">
                        <div class="card-header d-flex justify-content-between align-items-center">
                            <h6 class="mb-0">${exerciseName}</h6>
                            <div class="d-flex align-items-center gap-2">
                                <span class="badge bg-info" id="exercise-timer-${index}">
                                    ${Utils.formatTime(timerValue)}
                                </span>
                                <button class="btn btn-sm ${isTimerRunning ? 'btn-danger' : 'btn-outline-primary'}" 
                                        id="timer-btn-${index}"
                                        onclick="WorkoutManager.toggleExerciseTimer(${index})">
                                    ${isTimerRunning ? '⏹ Стоп' : '▶ Старт'}
                                </button>
                                ${ex.completed ? '<span class="badge bg-success">✅</span>' : ''}
                            </div>
                        </div>
                        <div class="card-body">
                            <div class="sets-list" id="sets-${index}">
                                ${this.renderSets(ex, index)}
                            </div>
                            <div class="mt-2">
                                <button class="btn btn-sm btn-outline-light" 
                                        onclick="WorkoutManager.addSet(${index})">
                                    <i class="bi bi-plus"></i> Добавить подход
                                </button>
                                ${!ex.completed ? `
                                    <button class="btn btn-sm btn-outline-success ms-2" 
                                            onclick="WorkoutManager.completeExercise(${index})">
                                        <i class="bi bi-check-lg"></i> Завершить
                                    </button>
                                ` : `
                                    <button class="btn btn-sm btn-outline-warning ms-2" 
                                            onclick="WorkoutManager.uncompleteExercise(${index})">
                                        <i class="bi bi-arrow-counterclockwise"></i> Вернуть
                                    </button>
                                `}
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        } else {
            exercisesHTML = `
                <div class="text-center py-4">
                    <p class="text-muted">Нет добавленных упражнений</p>
                </div>
            `;
        }
        
        container.innerHTML = `
            <div class="app-header fade-in">
                <div class="d-flex justify-content-between align-items-center">
                    <h4 class="mb-0">${this.currentSession.templateName || 'Тренировка'}</h4>
                    <div class="timer-display" id="timer-display">00:00</div>
                </div>
            </div>
            
            <div class="container fade-in">
                <div id="exercises-container">
                    ${exercisesHTML}
                    
                    <button class="btn btn-outline-primary w-100 mt-3" onclick="WorkoutManager.showAddExerciseModal()">
                        <i class="bi bi-plus-circle"></i> Добавить упражнение
                    </button>
                </div>
                
                <div class="mt-4 mb-4">
                    <button class="btn btn-danger w-100" id="finish-workout-btn">
                        <i class="bi bi-flag"></i> Завершить тренировку
                    </button>
                </div>
            </div>
            
            <nav class="bottom-nav">
                <div class="nav-item" onclick="Router.navigate('home')">
                    <i class="bi bi-house"></i>
                    <span>Главная</span>
                </div>
                <div class="nav-item" onclick="Router.navigate('templates')">
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
        
        // Обработчик завершения тренировки
        const finishBtn = document.getElementById('finish-workout-btn');
        if (finishBtn) {
            finishBtn.addEventListener('click', () => {
                this.finishWorkout();
            });
        }
        
        // Обновляем таймер
        this.elapsedSeconds = Math.floor((new Date() - this.startTime) / 1000);
        const timerDisplay = document.getElementById('timer-display');
        if (timerDisplay) {
            timerDisplay.textContent = Utils.formatTime(this.elapsedSeconds);
        }
        
        // Обновляем таймеры упражнений
        this.currentSession.exercises.forEach((ex, index) => {
            const timerDisplay = document.getElementById(`exercise-timer-${index}`);
            if (timerDisplay) {
                const time = this.exerciseTimes[index] || ex.exerciseTime || 0;
                timerDisplay.textContent = Utils.formatTime(time);
            }
        });
    }
    
    static renderSets(exercise, exerciseIndex) {
        if (!exercise.sets || exercise.sets.length === 0) {
            return '<p class="text-muted small mb-0">Нет записанных подходов</p>';
        }
        
        return exercise.sets.map((set, setIndex) => `
            <div class="set-row">
                <div class="row align-items-center">
                    <div class="col-2">
                        <span class="set-number">#${setIndex + 1}</span>
                    </div>
                    <div class="col-4">
                        <input type="number" 
                               class="form-control form-control-sm" 
                               placeholder="Вес (кг)" 
                               value="${set.weight || ''}"
                               onchange="WorkoutManager.updateSet(${exerciseIndex}, ${setIndex}, 'weight', this.value)">
                    </div>
                    <div class="col-4">
                        <input type="number" 
                               class="form-control form-control-sm" 
                               placeholder="Повт." 
                               value="${set.reps || ''}"
                               onchange="WorkoutManager.updateSet(${exerciseIndex}, ${setIndex}, 'reps', this.value)">
                    </div>
                    <div class="col-2">
                        <button class="btn btn-sm btn-outline-danger" 
                                onclick="WorkoutManager.removeSet(${exerciseIndex}, ${setIndex})">
                            <i class="bi bi-x"></i>
                        </button>
                    </div>
                </div>
            </div>
        `).join('');
    }
    
    static addSet(exerciseIndex) {
        if (!this.currentSession.exercises[exerciseIndex].sets) {
            this.currentSession.exercises[exerciseIndex].sets = [];
        }
        
        this.currentSession.exercises[exerciseIndex].sets.push({
            weight: 0,
            reps: 0
        });
        
        this.saveAndRender();
    }
    
    static removeSet(exerciseIndex, setIndex) {
        this.currentSession.exercises[exerciseIndex].sets.splice(setIndex, 1);
        this.saveAndRender();
    }
    
    static updateSet(exerciseIndex, setIndex, field, value) {
        this.currentSession.exercises[exerciseIndex].sets[setIndex][field] = parseInt(value) || 0;
        this.saveCurrentSession();
    }
    
    static completeExercise(exerciseIndex) {
        this.currentSession.exercises[exerciseIndex].completed = true;
        this.saveAndRender();
    }
    
    static uncompleteExercise(exerciseIndex) {
        this.currentSession.exercises[exerciseIndex].completed = false;
        this.saveAndRender();
    }
    
    static async showAddExerciseModal() {
        const allExercises = await DB.getAll('exercises');
        
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
                        <h5 class="modal-title">Добавить упражнение</h5>
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
            btn.addEventListener('click', () => {
                const exerciseId = btn.dataset.exerciseId;
                const newIndex = this.currentSession.exercises.length;
                this.currentSession.exercises.push({
                    exerciseId: exerciseId,
                    plannedSets: 3,
                    plannedReps: 10,
                    sets: [],
                    completed: false,
                    exerciseTime: 0
                });
                
                this.exerciseTimes[newIndex] = 0;
                this.saveAndRender();
                bsModal.hide();
                modal.remove();
            });
        });
        
        modal.addEventListener('hidden.bs.modal', () => {
            modal.remove();
        });
    }
    
    static async saveCurrentSession() {
        await DB.put('sessions', this.currentSession);
    }
    
    static async saveAndRender() {
        await this.saveCurrentSession();
        await this.renderActiveWorkout();
    }
    
    static async finishWorkout() {
        const confirmed = await Utils.confirm('Завершить тренировку?');
        if (!confirmed) return;
        
        this.stopTimer();
        
        // Останавливаем все таймеры упражнений
        if (this.currentSession && this.currentSession.exercises) {
            this.currentSession.exercises.forEach((ex, index) => {
                if (this.exerciseTimers[index]) {
                    this.stopExerciseTimer(index);
                }
            });
        }
        
        this.currentSession.endTime = new Date().toISOString();
        this.currentSession.duration = Math.floor((new Date(this.currentSession.endTime) - new Date(this.currentSession.startTime)) / 1000);
        this.currentSession.completed = true;
        
        await DB.put('sessions', this.currentSession);
        await DB.delete('settings', 'activeSession');
        
        Utils.showToast('Тренировка завершена!');
        
        this.currentSession = null;
        this.startTime = null;
        this.elapsedSeconds = 0;
        this.exerciseTimers = {};
        this.exerciseTimes = {};
        
        Router.navigate('history');
    }
    
    // === НОВЫЕ МЕТОДЫ ДЛЯ ТАЙМЕРОВ УПРАЖНЕНИЙ ===
    
    static startExerciseTimer(exerciseIndex) {
        if (this.exerciseTimers[exerciseIndex]) {
            clearInterval(this.exerciseTimers[exerciseIndex]);
        }
        
        if (!this.exerciseTimes[exerciseIndex]) {
            this.exerciseTimes[exerciseIndex] = 0;
        }
        
        this.exerciseTimers[exerciseIndex] = setInterval(() => {
            this.exerciseTimes[exerciseIndex]++;
            
            const timerDisplay = document.getElementById(`exercise-timer-${exerciseIndex}`);
            if (timerDisplay) {
                timerDisplay.textContent = Utils.formatTime(this.exerciseTimes[exerciseIndex]);
            }
            
            // Сохраняем в сессию
            if (this.currentSession && this.currentSession.exercises[exerciseIndex]) {
                this.currentSession.exercises[exerciseIndex].exerciseTime = this.exerciseTimes[exerciseIndex];
                this.saveCurrentSession();
            }
        }, 1000);
        
        this.updateExerciseTimerButton(exerciseIndex, true);
    }
    
    static stopExerciseTimer(exerciseIndex) {
        if (this.exerciseTimers[exerciseIndex]) {
            clearInterval(this.exerciseTimers[exerciseIndex]);
            this.exerciseTimers[exerciseIndex] = null;
            
            if (this.currentSession && this.currentSession.exercises[exerciseIndex]) {
                this.currentSession.exercises[exerciseIndex].exerciseTime = this.exerciseTimes[exerciseIndex];
                this.saveCurrentSession();
            }
            
            this.updateExerciseTimerButton(exerciseIndex, false);
        }
    }
    
    static toggleExerciseTimer(exerciseIndex) {
        if (this.exerciseTimers[exerciseIndex]) {
            this.stopExerciseTimer(exerciseIndex);
        } else {
            this.startExerciseTimer(exerciseIndex);
        }
    }
    
    static updateExerciseTimerButton(exerciseIndex, isRunning) {
        const button = document.getElementById(`timer-btn-${exerciseIndex}`);
        if (button) {
            button.textContent = isRunning ? '⏹ Стоп' : '▶ Старт';
            button.className = `btn btn-sm ${isRunning ? 'btn-danger' : 'btn-outline-primary'}`;
        }
    }
    
    static restoreExerciseTimers() {
        if (!this.currentSession || !this.currentSession.exercises) return;
        
        this.currentSession.exercises.forEach((ex, index) => {
            if (ex.exerciseTime) {
                this.exerciseTimes[index] = ex.exerciseTime;
            } else {
                this.exerciseTimes[index] = 0;
            }
        });
    }
}

window.WorkoutManager = WorkoutManager;