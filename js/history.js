// История тренировок

class HistoryManager {
    static async loadHistoryList() {
        const user = Auth.getCurrentUser();
        const sessions = await DB.getByIndex('sessions', 'userId', user.id);
        
        // Сортируем по дате (новые сверху)
        sessions.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
        
        const container = document.getElementById('app');
        
        let sessionsHTML = '';
        
        if (sessions.length === 0) {
            sessionsHTML = `
                <div class="text-center py-5">
                    <i class="bi bi-calendar-x display-1 text-muted"></i>
                    <p class="text-muted mt-3">История тренировок пуста</p>
                </div>
            `;
        } else {
            sessionsHTML = sessions.map(session => {
                const duration = session.duration ? Utils.formatTime(session.duration) : 'Не завершена';
                const completed = session.endTime ? true : false;
                
                return `
                    <div class="card mb-3" onclick="Router.navigate('history-detail', {sessionId: '${session.id}'})">
                        <div class="card-body">
                            <div class="d-flex justify-content-between align-items-start">
                                <div>
                                    <h6 class="mb-1">${session.templateName || 'Тренировка'}</h6>
                                    <small class="text-muted">
                                        ${Utils.formatDate(session.date)} &middot; 
                                        ${Utils.getDayOfWeek(session.date)}
                                    </small>
                                    <br>
                                    <small class="text-muted">
                                        ${session.exercises.length} упражнений &middot; ${duration}
                                    </small>
                                </div>
                                <div class="text-end">
                                    ${completed ? 
                                        '<span class="badge bg-success">Завершена</span>' : 
                                        '<span class="badge bg-warning">Не завершена</span>'
                                    }
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }
        
        container.innerHTML = `
            <div class="app-header fade-in">
                <h4>История тренировок</h4>
            </div>
            
            <div class="container fade-in">
                <div id="history-list">
                    ${sessionsHTML}
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
                <div class="nav-item active" onclick="Router.navigate('history')">
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
    
    static async loadHistoryDetail(sessionId) {
        const session = await DB.get('sessions', sessionId);
        if (!session) {
            Utils.showToast('Тренировка не найдена', 'danger');
            Router.navigate('history');
            return;
        }
        
        const allExercises = await DB.getAll('exercises');
        const container = document.getElementById('app');
        
        const duration = session.duration ? Utils.formatTime(session.duration) : 'Не завершена';
        
        let exercisesHTML = '';
        
        if (session.exercises && session.exercises.length > 0) {
            exercisesHTML = session.exercises.map(ex => {
                const exerciseInfo = allExercises.find(e => e.id === ex.exerciseId);
                const exerciseName = exerciseInfo ? exerciseInfo.name : 'Неизвестное упражнение';
                
                let setsHTML = '';
                
                if (ex.sets && ex.sets.length > 0) {
                    const setsRows = ex.sets.map((set, i) => {
                        return `
                            <tr>
                                <td>#${i + 1}</td>
                                <td>${set.weight || 0}</td>
                                <td>${set.reps || 0}</td>
                            </tr>
                        `;
                    }).join('');
                    
                    setsHTML = `
                        <div class="table-responsive">
                            <table class="table table-dark table-sm">
                                <thead>
                                    <tr>
                                        <th>Подход</th>
                                        <th>Вес (кг)</th>
                                        <th>Повторения</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${setsRows}
                                </tbody>
                            </table>
                        </div>
                    `;
                } else {
                    setsHTML = '<p class="text-muted mb-0">Нет записанных подходов</p>';
                }
                
                return `
                    <div class="card mb-3 ${ex.completed ? 'border-success' : ''}">
                        <div class="card-header d-flex justify-content-between align-items-center">
                            <h6 class="mb-0">${exerciseName}</h6>
                            ${ex.completed ? '<span class="badge bg-success">✅</span>' : ''}
                        </div>
                        <div class="card-body">
                            ${setsHTML}
                        </div>
                    </div>
                `;
            }).join('');
        } else {
            exercisesHTML = `
                <div class="text-center py-3">
                    <p class="text-muted">Нет упражнений</p>
                </div>
            `;
        }
        
        container.innerHTML = `
            <div class="app-header fade-in">
                <div class="d-flex align-items-center">
                    <button class="btn btn-link text-white me-2" onclick="Router.navigate('history')">
                        <i class="bi bi-arrow-left"></i>
                    </button>
                    <div>
                        <h4 class="mb-0">${session.templateName || 'Тренировка'}</h4>
                        <small class="text-muted">
                            ${Utils.formatDate(session.date)} &middot; ${Utils.getDayOfWeek(session.date)}
                        </small>
                    </div>
                </div>
            </div>
            
            <div class="container fade-in">
                <div class="card mb-3">
                    <div class="card-body">
                        <div class="row text-center">
                            <div class="col-6">
                                <small class="text-muted">Начало</small><br>
                                ${Utils.formatDateTime(session.startTime)}
                            </div>
                            <div class="col-6">
                                <small class="text-muted">Длительность</small><br>
                                ${duration}
                            </div>
                        </div>
                    </div>
                </div>
                
                <h5 class="mb-3">Упражнения</h5>
                
                ${exercisesHTML}
                
                <button class="btn btn-outline-danger w-100 mt-3" onclick="HistoryManager.deleteSession('${session.id}')">
                    <i class="bi bi-trash"></i> Удалить тренировку
                </button>
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
                <div class="nav-item active" onclick="Router.navigate('history')">
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
    
    static async deleteSession(sessionId) {
        const confirmed = await Utils.confirm('Удалить эту тренировку? Действие нельзя отменить.');
        if (!confirmed) return;
        
        await DB.delete('sessions', sessionId);
        Utils.showToast('Тренировка удалена');
        Router.navigate('history');
    }
}

window.HistoryManager = HistoryManager;