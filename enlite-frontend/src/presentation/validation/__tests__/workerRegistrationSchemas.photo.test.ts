import { describe, it, expect, beforeAll } from 'vitest';
import i18n from '../../../infrastructure/i18n/config';
import { generalInfoSchema } from '../workerRegistrationSchemas';

describe('generalInfoSchema - Photo Field Validation', () => {
  beforeAll(() => {
    i18n.changeLanguage('es');
  });

  const baseValidData = {
    profilePhoto: null,
    fullName: 'John Doe',
    lastName: 'Silva',
    cpf: '12345678901',
    phone: '+5511999999999',
    email: 'john@example.com',
    birthDate: '18/03/1990',
    sex: 'male',
    gender: 'male',
    documentType: 'DNI',
    professionalLicense: 'CRM-12345',
    languages: ['pt'],
    profession: 'PSYCHOLOGIST',
    knowledgeLevel: 'BACHELOR',
    experienceTypes: ['adicciones'],
    yearsExperience: '3_5',
    preferredTypes: ['adicciones'],
    preferredAgeRange: 'adults',
  };

  describe('profilePhoto field - should be optional', () => {
    it('should accept null profilePhoto', () => {
      const data = { ...baseValidData, profilePhoto: null };
      const result = generalInfoSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should accept undefined profilePhoto', () => {
      const data = { ...baseValidData };
      delete (data as Record<string, unknown>).profilePhoto;
      const result = generalInfoSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should accept empty string profilePhoto', () => {
      const data = { ...baseValidData, profilePhoto: '' };
      const result = generalInfoSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should accept valid base64 profilePhoto', () => {
      const data = { ...baseValidData, profilePhoto: 'data:image/jpeg;base64,/9j/4AAQSkZJRg===' };
      const result = generalInfoSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should accept compressed small image as profilePhoto', () => {
      const smallImage = 'data:image/jpeg;base64,' + 'A'.repeat(1000);
      const data = { ...baseValidData, profilePhoto: smallImage };
      const result = generalInfoSchema.safeParse(data);
      expect(result.success).toBe(true);
    });
  });

  describe('birthDate field - should accept DD/MM/AAAA format', () => {
    it('should accept valid date in DD/MM/AAAA format', () => {
      const data = { ...baseValidData, birthDate: '18/03/1990' };
      const result = generalInfoSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should reject empty birthDate', () => {
      const data = { ...baseValidData, birthDate: '' };
      const result = generalInfoSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('should accept birthDate with mask format', () => {
      const data = { ...baseValidData, birthDate: '01/01/2000' };
      const result = generalInfoSchema.safeParse(data);
      expect(result.success).toBe(true);
    });
  });

  describe('documentType field - should accept DNI', () => {
    it('should accept DNI as documentType', () => {
      const data = { ...baseValidData, documentType: 'DNI' };
      const result = generalInfoSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should accept CPF as documentType', () => {
      const data = { ...baseValidData, documentType: 'CPF' };
      const result = generalInfoSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should reject invalid documentType', () => {
      const data = { ...baseValidData, documentType: 'INVALID' };
      const result = generalInfoSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });
});
