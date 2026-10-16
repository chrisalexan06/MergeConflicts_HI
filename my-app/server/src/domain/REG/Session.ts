import { Account } from './Account.js';

export class Session {
  public readonly sessionToken: string;
  public readonly account: Account;
  public readonly createdAt: Date;
  private isValidSession: boolean;

  constructor(sessionToken: string, account: Account) {
    if (!sessionToken || !account) {
      throw new Error('Session requires a token and an associated Account.');
    }
    this.sessionToken = sessionToken;
    this.account = account;
    this.createdAt = new Date();
    this.isValidSession = true;
  }

  public isActive(): boolean {
    return this.isValidSession;
  }

  public invalidate(): void {
    this.isValidSession = false;
  }
}
