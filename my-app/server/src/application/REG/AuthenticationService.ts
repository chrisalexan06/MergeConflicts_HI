import { RegistrationService } from './RegistrationService.js';
import { SessionManager } from './SessionManager.js';
import { Account } from '../../domain/REG/Account.js';

export class AuthenticationService {
  private registrationService: RegistrationService;
  private sessionManager: SessionManager;

  constructor(registrationService: RegistrationService) {
    this.registrationService = registrationService;
    this.sessionManager = SessionManager.getInstance();
  }

  public async login(accountName: string, password: string): Promise<{ sessionToken: string; account: Account }> {
    const account = await this.registrationService.findAccountByName(accountName);
    if (!account) {
      throw new Error('Authentication failed: user does not exist.');
    }
    if (account.password !== password) {
      throw new Error('Authentication failed: incorrect password.');
    }

    const session = this.sessionManager.createSession(account);
    return { sessionToken: session.sessionToken, account };
  }

  public logout(sessionToken: string): void {
    this.sessionManager.invalidateSession(sessionToken);
  }

  public isAuthenticated(sessionToken: string): boolean {
    return this.sessionManager.isAuthenticated(sessionToken);
  }

  public getCurrentUser(sessionToken: string): Account | null {
    return this.sessionManager.getCurrentUser(sessionToken);
  }
}