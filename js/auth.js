// Auth — Supabase email + password
class AuthManager {
  constructor() {
    this.currentUser = null;
    this.profile = null;
  }

  async init() {
    const { data: { session } } = await window.supabaseClient.auth.getSession();
    if (session && session.user) {
      this.currentUser = session.user;
      try {
        this.profile = await Api.getProfile();
      } catch (e) {
        this.profile = {
          id: session.user.id,
          display_name: session.user.user_metadata?.display_name || session.user.email
        };
      }
      return true;
    }
    this.currentUser = null;
    this.profile = null;
    return false;
  }

  async signUp(email, password, displayName) {
    const { data, error } = await window.supabaseClient.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { display_name: (displayName || '').trim() || email.split('@')[0] }
      }
    });
    if (error) throw error;

    if (data.user) {
      this.currentUser = data.user;
      // Ensure profile row exists even if trigger lag
      try {
        await Api.updateProfile(
          (displayName || '').trim() || email.split('@')[0]
        );
        this.profile = await Api.getProfile();
      } catch (e) {
        console.warn('Profile bootstrap:', e);
      }
    }

    // If email confirmation is required, session may be null
    if (!data.session) {
      return { needsConfirmation: true, user: data.user };
    }
    return { needsConfirmation: false, user: data.user };
  }

  async signIn(email, password) {
    const { data, error } = await window.supabaseClient.auth.signInWithPassword({
      email: email.trim(),
      password
    });
    if (error) throw error;
    this.currentUser = data.user;
    this.profile = await Api.getProfile();
    return data.user;
  }

  async logout() {
    await window.supabaseClient.auth.signOut();
    this.currentUser = null;
    this.profile = null;
    await DB.clearActiveSession();
  }

  getCurrentUser() {
    if (!this.currentUser) return null;
    return {
      id: this.currentUser.id,
      email: this.currentUser.email,
      name: this.profile?.display_name || this.currentUser.user_metadata?.display_name || this.currentUser.email,
      joinDate: this.profile?.created_at || null
    };
  }

  isLoggedIn() {
    return this.currentUser !== null;
  }
}

const Auth = new AuthManager();
window.Auth = Auth;
