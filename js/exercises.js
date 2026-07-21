// Библиотека упражнений

class ExercisesManager {
    static async loadExercisesList() {
        const exercises = await DB.getAll('exercises');
        const container = document.getElementById('app');
        
        // Группируем по категориям
        const categories = {};
        exercises.forEach(ex => {
            if (!categories[ex.category]) {
                categories[ex.category] = [];
            }
            categories[ex.category].push(ex);
        });
        
        let exercisesHTML = '';
        
        for (const category in categories) {
            exercisesHTML += '<h5 class="mt-3 mb-2 text-primary">' + category + '</h5>';
            
            categories[category].forEach(ex => {
                exercisesHTML += `
                    <div class="card mb-2 exercise-item" data-name="${ex.name.toLowerCase()}">
                        <div class="card-body py-2">
                            <div class="d-flex justify-content-between align-items-center">
                                <div>
                                    <strong>${ex.name}</strong>
                                    <br>
                                    <small class="text-muted">${ex.muscle} &middot; ${ex.type}</small>
                                </div>
                                <button class="btn btn-sm btn-outline-info" 
                                        onclick="ExercisesManager.showDetails('${ex.id}')">
                                    <i class="bi bi-info-circle"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            });
        }
        
        container.innerHTML = `
            <div class="app-header fade-in">
                <h4>Библиотека упражнений</h4>
            </div>
            
            <div class="container fade-in">
                <input type="text" class="form-control mb-3" id="exercise-search" placeholder="Поиск упражнений...">
                
                <div id="exercises-list">
                    ${exercisesHTML}
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
                <div class="nav-item active" onclick="Router.navigate('exercises')">
                    <i class="bi bi-book"></i>
                    <span>База</span>
                </div>
            </nav>
        `;
        
        // Поиск упражнений
        const searchInput = document.getElementById('exercise-search');
        if (searchInput) {
            searchInput.addEventListener('input', function(e) {
                const search = e.target.value.toLowerCase();
                const items = document.querySelectorAll('.exercise-item');
                
                items.forEach(function(item) {
                    const name = item.getAttribute('data-name');
                    if (name && name.includes(search)) {
                        item.style.display = '';
                    } else {
                        item.style.display = 'none';
                    }
                });
                
                // Скрываем заголовки категорий если все упражнения скрыты
                const headers = document.querySelectorAll('#exercises-list h5');
                headers.forEach(function(header) {
                    let hasVisible = false;
                    let next = header.nextElementSibling;
                    
                    while (next && !next.matches('h5')) {
                        if (next.style.display !== 'none') {
                            hasVisible = true;
                            break;
                        }
                        next = next.nextElementSibling;
                    }
                    
                    header.style.display = hasVisible ? '' : 'none';
                });
            });
        }
    }
    
    static async showDetails(exerciseId) {
        const exercise = await DB.get('exercises', exerciseId);
        if (!exercise) return;
        
        const modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.setAttribute('tabindex', '-1');
        modal.innerHTML = `
            <div class="modal-dialog">
                <div class="modal-content bg-dark text-light">
                    <div class="modal-header">
                        <h5 class="modal-title">${exercise.name}</h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body">
                        <p><strong>Категория:</strong> ${exercise.category}</p>
                        <p><strong>Мышцы:</strong> ${exercise.muscle}</p>
                        <p><strong>Тип:</strong> ${exercise.type}</p>
                        <p><strong>Описание:</strong> ${exercise.description}</p>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        const bsModal = new bootstrap.Modal(modal);
        bsModal.show();
        
        modal.addEventListener('hidden.bs.modal', function() {
            modal.remove();
        });
    }
}

window.ExercisesManager = ExercisesManager;