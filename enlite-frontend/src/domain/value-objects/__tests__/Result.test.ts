import { describe, it, expect } from 'vitest';
import { Result } from '../Result';

describe('Result', () => {
  describe('ok', () => {
    it('should create a successful result', () => {
      const result = Result.ok('success');
      
      expect(result.isSuccess()).toBe(true);
      expect(result.isFailure()).toBe(false);
      expect(result.getValue()).toBe('success');
    });
  });

  describe('fail', () => {
    it('should create a failed result', () => {
      const error = new Error('failed');
      const result = Result.fail(error);
      
      expect(result.isSuccess()).toBe(false);
      expect(result.isFailure()).toBe(true);
      expect(result.getError()).toBe(error);
    });
  });

  describe('getValue', () => {
    it('should throw error when called on failed result', () => {
      const result = Result.fail(new Error('failed'));
      
      expect(() => result.getValue()).toThrow('Cannot get value from failed result');
    });
  });

  describe('getError', () => {
    it('should throw error when called on successful result', () => {
      const result = Result.ok('success');
      
      expect(() => result.getError()).toThrow('Cannot get error from successful result');
    });
  });
});
