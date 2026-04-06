import { describe, it, expect } from 'vitest';
import {
  isStep1Complete,
  isStep2Complete,
  isStep3Complete,
  validateRegistrationSteps,
} from '../workerProgressValidation';
import type { WorkerProgressResponse } from '@infrastructure/http/WorkerApiService';

const createMockWorkerData = (overrides?: Partial<WorkerProgressResponse>): WorkerProgressResponse => ({
  id: '123',
  authUid: 'auth123',
  email: 'test@example.com',
  status: 'active',
  country: 'BR',
  timezone: 'America/Sao_Paulo',
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
  ...overrides,
});

describe('workerProgressValidation', () => {
  describe('isStep1Complete', () => {
    it('returns false when no data is provided', () => {
      const data = createMockWorkerData();
      expect(isStep1Complete(data)).toBe(false);
    });

    it('returns false when only some fields are filled', () => {
      const data = createMockWorkerData({
        firstName: 'John',
        lastName: 'Doe',
        birthDate: '1990-01-01',
      });
      expect(isStep1Complete(data)).toBe(false);
    });

    it('returns true when all required fields are filled', () => {
      const data = createMockWorkerData({
        firstName: 'John',
        lastName: 'Doe',
        birthDate: '1990-01-01',
        sex: 'Masculino',
        gender: 'Masculino',
        documentType: 'CPF',
        documentNumber: '12345678900',
        languages: ['Português', 'Inglês'],
        profession: 'Enfermeiro',
        knowledgeLevel: 'Avançado',
        experienceTypes: ['Hospital', 'Clínica'],
        yearsExperience: '5-10',
        preferredTypes: ['Idosos', 'Adultos'],
        preferredAgeRange: ['60+'],
      });
      expect(isStep1Complete(data)).toBe(true);
    });

    it('returns false when languages array is empty', () => {
      const data = createMockWorkerData({
        firstName: 'John',
        lastName: 'Doe',
        birthDate: '1990-01-01',
        sex: 'Masculino',
        gender: 'Masculino',
        documentType: 'CPF',
        documentNumber: '12345678900',
        languages: [],
        profession: 'Enfermeiro',
        knowledgeLevel: 'Avançado',
        experienceTypes: ['Hospital'],
        yearsExperience: '5-10',
        preferredTypes: ['Idosos'],
        preferredAgeRange: ['60+'],
      });
      expect(isStep1Complete(data)).toBe(false);
    });
  });

  describe('isStep2Complete', () => {
    it('returns false when no address data is provided', () => {
      const data = createMockWorkerData();
      expect(isStep2Complete(data)).toBe(false);
    });

    it('returns false when only serviceAddress is filled without serviceRadiusKm', () => {
      const data = createMockWorkerData({
        serviceAddress: 'Rua Exemplo, 123',
      });
      expect(isStep2Complete(data)).toBe(false);
    });

    it('returns true when serviceAddress and serviceRadiusKm are filled', () => {
      const data = createMockWorkerData({
        serviceAddress: 'Rua Exemplo, 123',
        serviceRadiusKm: 10,
      });
      expect(isStep2Complete(data)).toBe(true);
    });
  });

  describe('isStep3Complete', () => {
    it('returns false when availability is not provided', () => {
      const data = createMockWorkerData();
      expect(isStep3Complete(data)).toBe(false);
    });

    it('returns false when availability is empty object', () => {
      const data = createMockWorkerData({
        availability: {},
      });
      expect(isStep3Complete(data)).toBe(false);
    });

    it('returns true when availability has data', () => {
      const data = createMockWorkerData({
        availability: {
          monday: { morning: true, afternoon: false, evening: false },
          tuesday: { morning: true, afternoon: true, evening: false },
        },
      });
      expect(isStep3Complete(data)).toBe(true);
    });
  });

  describe('validateRegistrationSteps', () => {
    it('returns all false when no data is provided', () => {
      const data = createMockWorkerData();
      const result = validateRegistrationSteps(data);
      
      expect(result.step1).toBe(false);
      expect(result.step2).toBe(false);
      expect(result.step3).toBe(false);
    });

    it('returns correct validation for partially completed registration', () => {
      const data = createMockWorkerData({
        firstName: 'John',
        lastName: 'Doe',
        birthDate: '1990-01-01',
        sex: 'Masculino',
        gender: 'Masculino',
        documentType: 'CPF',
        documentNumber: '12345678900',
        languages: ['Português'],
        profession: 'Enfermeiro',
        knowledgeLevel: 'Avançado',
        experienceTypes: ['Hospital'],
        yearsExperience: '5-10',
        preferredTypes: ['Idosos'],
        preferredAgeRange: ['60+'],
        serviceAddress: 'Rua Exemplo, 123',
        serviceRadiusKm: 10,
      });
      
      const result = validateRegistrationSteps(data);
      
      expect(result.step1).toBe(true);
      expect(result.step2).toBe(true);
      expect(result.step3).toBe(false);
    });

    it('returns all true when all steps are completed', () => {
      const data = createMockWorkerData({
        firstName: 'John',
        lastName: 'Doe',
        birthDate: '1990-01-01',
        sex: 'Masculino',
        gender: 'Masculino',
        documentType: 'CPF',
        documentNumber: '12345678900',
        languages: ['Português'],
        profession: 'Enfermeiro',
        knowledgeLevel: 'Avançado',
        experienceTypes: ['Hospital'],
        yearsExperience: '5-10',
        preferredTypes: ['Idosos'],
        preferredAgeRange: ['60+'],
        serviceAddress: 'Rua Exemplo, 123',
        serviceRadiusKm: 10,
        availability: {
          monday: { morning: true },
        },
      });
      
      const result = validateRegistrationSteps(data);
      
      expect(result.step1).toBe(true);
      expect(result.step2).toBe(true);
      expect(result.step3).toBe(true);
    });
  });
});
