import { describe, it, expect } from 'vitest';
import { isImageTooLarge, getBase64SizeInKB, extractBase64FromDataUrl } from '../imageCompression';

describe('imageCompression utilities', () => {
  describe('isImageTooLarge', () => {
    it('should return true for large images', () => {
      // Create a base64 string that is > 500KB
      const largeImage = 'data:image/jpeg;base64,' + 'A'.repeat(600 * 1024);
      expect(isImageTooLarge(largeImage, 500)).toBe(true);
    });

    it('should return false for small images', () => {
      const smallImage = 'data:image/jpeg;base64,' + 'A'.repeat(100);
      expect(isImageTooLarge(smallImage, 500)).toBe(false);
    });

    it('should use default max size of 500KB', () => {
      const mediumImage = 'data:image/jpeg;base64,' + 'A'.repeat(400 * 1024);
      expect(isImageTooLarge(mediumImage)).toBe(false);
    });
  });

  describe('getBase64SizeInKB', () => {
    it('should calculate size correctly', () => {
      const image = 'data:image/jpeg;base64,' + 'A'.repeat(1024);
      expect(getBase64SizeInKB(image)).toBeCloseTo(1 + (23 / 1024), 2); // 1KB + header
    });

    it('should handle empty string', () => {
      expect(getBase64SizeInKB('')).toBe(0);
    });
  });

  describe('extractBase64FromDataUrl', () => {
    it('should extract base64 from data URL', () => {
      const dataUrl = 'data:image/jpeg;base64,ABC123';
      expect(extractBase64FromDataUrl(dataUrl)).toBe('ABC123');
    });

    it('should return original string if no data URL format', () => {
      const base64 = 'ABC123';
      expect(extractBase64FromDataUrl(base64)).toBe('ABC123');
    });
  });
});
