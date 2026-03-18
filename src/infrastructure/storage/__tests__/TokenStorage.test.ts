import { describe, it, expect, beforeEach } from 'vitest';
import { TokenStorage } from '../TokenStorage';
import { AuthToken } from '@domain/entities/AuthToken';

describe('TokenStorage', () => {
  let storage: TokenStorage;

  beforeEach(() => {
    localStorage.clear();
    storage = new TokenStorage();
  });

  it('should save and retrieve token', () => {
    const token: AuthToken = {
      accessToken: 'access',
      idToken: 'id',
      expiresAt: new Date('2025-12-31'),
    };

    storage.save(token);
    const retrieved = storage.get();

    expect(retrieved).toBeTruthy();
    expect(retrieved?.accessToken).toBe('access');
  });

  it('should remove token', () => {
    const token = {
      accessToken: 'access',
      idToken: 'id',
      expiresAt: new Date('2025-12-31'),
    };

    storage.save(token);
    storage.remove();
    
    expect(storage.get()).toBeNull();
  });

  it('should detect expired token', () => {
    const token: AuthToken = {
      accessToken: 'access',
      idToken: 'id',
      expiresAt: new Date('2020-01-01'),
    };

    storage.save(token);
    
    expect(storage.isExpired()).toBe(true);
  });

  it('should detect valid token', () => {
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1); // 1 year in the future
    
    const token: AuthToken = {
      accessToken: 'access',
      idToken: 'id',
      expiresAt: futureDate,
    };

    storage.save(token);
    
    expect(storage.isExpired()).toBe(false);
  });
});
