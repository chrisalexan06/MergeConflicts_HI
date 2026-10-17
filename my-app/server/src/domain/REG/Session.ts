import { Account } from './Account.js';

export class Session {
  public readonly sessionToken: string;
  public readonly account: Account;
  public readonly createdAt: Date;
  private valid: boolean;
  private readonly maxAgeMs: number;

  constructor(sessionToken: string, account: Account, maxAgeHours: number = 24) {
    this.sessionToken = sessionToken;
    this.account = account;
    this.createdAt = new Date();
    this.valid = true;
    this.maxAgeMs = maxAgeHours * 60 * 60 * 1000;
  }

  public isActive(): boolean {
    if (!this.valid) return false;
    const elapsed = Date.now() - this.createdAt.getTime();
    if (elapsed > this.maxAgeMs) {
      this.valid = false;
      return false;
    }
    return true;
  }

  public invalidate(): void {
    this.valid = false;
  }
}