import { Session } from '../../domain/REG/Session.js';
import { Account } from '../../domain/REG/Account.js';

export class SessionManager {
  private static instance: SessionManager;
  private activeSessions: Map<string, Session> = new Map();

  private constructor() {}

  // Singleton Pattern
  public static getInstance(): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager();
    }
    return SessionManager.instance;
  }

  public createSession(account: Account): Session {
    const sessionToken = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const session = new Session(sessionToken, account);
    this.activeSessions.set(sessionToken, session);
    return session;
  }

  public getSession(sessionToken: string): Session | undefined {
    const session = this.activeSessions.get(sessionToken);
    if (session && session.isActive()) {
      return session;
    }
    return undefined;
  }

  public invalidateSession(sessionToken: string): void {
    const session = this.activeSessions.get(sessionToken);
    if (session) {
      session.invalidate();
      this.activeSessions.delete(sessionToken);
    }
  }

  public isAuthenticated(sessionToken: string): boolean {
    const session = this.getSession(sessionToken);
    return session !== undefined && session.isActive();
  }

  public getCurrentUser(sessionToken: string): Account | null {
    const session = this.getSession(sessionToken);
    return session ? session.account : null;
  }

  public clearAll(): void {
    this.activeSessions.clear();
  }
}