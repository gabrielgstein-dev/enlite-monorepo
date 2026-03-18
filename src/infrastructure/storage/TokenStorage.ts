import { AuthToken } from '@domain/entities/AuthToken';

const TOKEN_KEY = 'auth_token';

export class TokenStorage {
  save(token: AuthToken): void {
    const serialized = JSON.stringify({
      ...token,
      expiresAt: token.expiresAt.toISOString(),
    });
    localStorage.setItem(TOKEN_KEY, serialized);
  }

  get(): AuthToken | null {
    const serialized = localStorage.getItem(TOKEN_KEY);
    if (!serialized) return null;

    const parsed = JSON.parse(serialized);
    return {
      ...parsed,
      expiresAt: new Date(parsed.expiresAt),
    };
  }

  remove(): void {
    localStorage.removeItem(TOKEN_KEY);
  }

  isExpired(): boolean {
    const token = this.get();
    if (!token) return true;
    return new Date() >= token.expiresAt;
  }
}
