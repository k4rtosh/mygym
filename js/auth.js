// Авторизация (выбор пользователя + PIN)

class AuthManager {
    constructor() {
        this.currentUser = null;
    }
    
    async init() {
        // Проверяем, есть ли сохраненная сессия
        const savedSession = await DB.get('settings', 'currentSession');
        if (savedSession) {
            this.currentUser = savedSession.user;
            return true;
        }
        return false;
    }
    
    async getUsers() {
        return await DB.getAll('users');
    }
    
    async login(userId, pin) {
        const user = await DB.get('users', userId);
        if (!user) {
            throw new Error('Пользователь не найден');
        }
        
        if (user.pin !== pin) {
            throw new Error('Неверный PIN-код');
        }
        
        this.currentUser = user;
        
        // Сохраняем сессию
        await DB.put('settings', {
            key: 'currentSession',
            user: user,
            loginTime: new Date().toISOString()
        });
        
        return user;
    }
    
    async logout() {
        this.currentUser = null;
        await DB.delete('settings', 'currentSession');
    }
    
    getCurrentUser() {
        return this.currentUser;
    }
    
    isLoggedIn() {
        return this.currentUser !== null;
    }
}

const Auth = new AuthManager();
window.Auth = Auth;