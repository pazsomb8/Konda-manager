import { randomBytes } from "node:crypto";

/** In-memory sessions: restarting the server logs everyone out, by design. */
export class SessionStore {
  private sessions = new Map<string, number>(); // token -> expiresAt

  constructor(
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  create(): string {
    const token = randomBytes(32).toString("base64url");
    this.sessions.set(token, this.now() + this.ttlMs);
    return token;
  }

  isValid(token: string | undefined): boolean {
    if (!token) return false;
    const exp = this.sessions.get(token);
    if (exp === undefined) return false;
    if (exp < this.now()) {
      this.sessions.delete(token);
      return false;
    }
    return true;
  }

  destroy(token: string | undefined): void {
    if (token) this.sessions.delete(token);
  }
}
