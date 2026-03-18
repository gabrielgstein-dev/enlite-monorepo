import { describe, it, expect } from 'vitest';
import { generalInfoSchema } from '../workerRegistrationSchemas';

describe('generalInfoSchema - New Fields Validation', () => {
  const baseValidData = {
    profilePhoto: null,
    fullName: 'John Doe',
    lastName: 'Silva',
    cpf: '12345678901',
    phone: '+5511999999999',
    email: 'john@example.com',
    birthDate: '1990-01-01',
    sex: 'Masculino',
    gender: 'Masculino',
    documentType: 'CPF',
    professionalLicense: 'CRM-12345',
    languages: ['Português'],
    profession: 'Psicólogo',
    knowledgeLevel: 'Bacharelado',
    experienceTypes: ['Adultos'],
    yearsExperience: '3-5 anos',
    preferredTypes: ['Adultos'],
    preferredAgeRange: 'Adultos (18-59 anos)',
  };

  describe('lastName field', () => {
    it('should accept valid lastName', () => {
      const result = generalInfoSchema.safeParse(baseValidData);
      expect(result.success).toBe(true);
    });

    it('should reject empty lastName', () => {
      const invalidData = { ...baseValidData, lastName: '' };
      const result = generalInfoSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('Sobrenome é obrigatório');
      }
    });
  });

  describe('sex field', () => {
    it('should accept Masculino', () => {
      const data = { ...baseValidData, sex: 'Masculino' };
      const result = generalInfoSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should accept Feminino', () => {
      const data = { ...baseValidData, sex: 'Feminino' };
      const result = generalInfoSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should reject empty sex', () => {
      const invalidData = { ...baseValidData, sex: '' };
      const result = generalInfoSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('Sexo é obrigatório');
      }
    });
  });

  describe('gender field', () => {
    it('should accept Masculino', () => {
      const data = { ...baseValidData, gender: 'Masculino' };
      const result = generalInfoSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should accept Feminino', () => {
      const data = { ...baseValidData, gender: 'Feminino' };
      const result = generalInfoSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should accept Outro', () => {
      const data = { ...baseValidData, gender: 'Outro' };
      const result = generalInfoSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should reject empty gender', () => {
      const invalidData = { ...baseValidData, gender: '' };
      const result = generalInfoSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('Gênero é obrigatório');
      }
    });
  });

  describe('documentType field', () => {
    it('should accept CPF', () => {
      const data = { ...baseValidData, documentType: 'CPF' };
      const result = generalInfoSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should accept RG', () => {
      const data = { ...baseValidData, documentType: 'RG' };
      const result = generalInfoSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should accept CNH', () => {
      const data = { ...baseValidData, documentType: 'CNH' };
      const result = generalInfoSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should reject empty documentType', () => {
      const invalidData = { ...baseValidData, documentType: '' };
      const result = generalInfoSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('Tipo de documento é obrigatório');
      }
    });
  });

  describe('languages field', () => {
    it('should accept single language', () => {
      const data = { ...baseValidData, languages: ['Português'] };
      const result = generalInfoSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should accept multiple languages', () => {
      const data = { ...baseValidData, languages: ['Português', 'Espanhol', 'Inglês'] };
      const result = generalInfoSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should reject empty languages array', () => {
      const invalidData = { ...baseValidData, languages: [] };
      const result = generalInfoSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('pelo menos um idioma');
      }
    });
  });

  describe('profession field', () => {
    it('should accept Cuidador', () => {
      const data = { ...baseValidData, profession: 'Cuidador' };
      const result = generalInfoSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should accept Enfermeiro', () => {
      const data = { ...baseValidData, profession: 'Enfermeiro' };
      const result = generalInfoSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should accept Psicólogo', () => {
      const data = { ...baseValidData, profession: 'Psicólogo' };
      const result = generalInfoSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should reject empty profession', () => {
      const invalidData = { ...baseValidData, profession: '' };
      const result = generalInfoSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('Profissão é obrigatória');
      }
    });
  });

  describe('knowledgeLevel field', () => {
    it('should accept Bacharelado', () => {
      const data = { ...baseValidData, knowledgeLevel: 'Bacharelado' };
      const result = generalInfoSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should accept Técnico', () => {
      const data = { ...baseValidData, knowledgeLevel: 'Técnico' };
      const result = generalInfoSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should accept Mestrado', () => {
      const data = { ...baseValidData, knowledgeLevel: 'Mestrado' };
      const result = generalInfoSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should reject empty knowledgeLevel', () => {
      const invalidData = { ...baseValidData, knowledgeLevel: '' };
      const result = generalInfoSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('Nível de conhecimento é obrigatório');
      }
    });
  });

  describe('experienceTypes field', () => {
    it('should accept single experience type', () => {
      const data = { ...baseValidData, experienceTypes: ['Idosos'] };
      const result = generalInfoSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should accept multiple experience types', () => {
      const data = { ...baseValidData, experienceTypes: ['Idosos', 'Crianças', 'Adultos'] };
      const result = generalInfoSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should reject empty experienceTypes array', () => {
      const invalidData = { ...baseValidData, experienceTypes: [] };
      const result = generalInfoSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('pelo menos um tipo de experiência');
      }
    });
  });

  describe('yearsExperience field', () => {
    it('should accept 0-2 anos', () => {
      const data = { ...baseValidData, yearsExperience: '0-2 anos' };
      const result = generalInfoSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should accept 3-5 anos', () => {
      const data = { ...baseValidData, yearsExperience: '3-5 anos' };
      const result = generalInfoSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should accept 10 ou +', () => {
      const data = { ...baseValidData, yearsExperience: '10 ou +' };
      const result = generalInfoSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should reject empty yearsExperience', () => {
      const invalidData = { ...baseValidData, yearsExperience: '' };
      const result = generalInfoSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('Anos de experiência é obrigatório');
      }
    });
  });

  describe('preferredTypes field', () => {
    it('should accept single preferred type', () => {
      const data = { ...baseValidData, preferredTypes: ['Portadores de TDAH'] };
      const result = generalInfoSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should accept multiple preferred types', () => {
      const data = { ...baseValidData, preferredTypes: ['Idosos', 'Crianças'] };
      const result = generalInfoSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should reject empty preferredTypes array', () => {
      const invalidData = { ...baseValidData, preferredTypes: [] };
      const result = generalInfoSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('pelo menos um tipo preferido');
      }
    });
  });

  describe('preferredAgeRange field', () => {
    it('should accept Crianças (0-12 anos)', () => {
      const data = { ...baseValidData, preferredAgeRange: 'Crianças (0-12 anos)' };
      const result = generalInfoSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should accept Adolescentes (13-17 anos)', () => {
      const data = { ...baseValidData, preferredAgeRange: 'Adolescentes (13-17 anos)' };
      const result = generalInfoSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should accept Adultos (18-59 anos)', () => {
      const data = { ...baseValidData, preferredAgeRange: 'Adultos (18-59 anos)' };
      const result = generalInfoSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should accept Idosos', () => {
      const data = { ...baseValidData, preferredAgeRange: 'Idosos' };
      const result = generalInfoSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should reject empty preferredAgeRange', () => {
      const invalidData = { ...baseValidData, preferredAgeRange: '' };
      const result = generalInfoSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('Faixa etária preferida é obrigatória');
      }
    });
  });

  describe('Complete validation with all new fields', () => {
    it('should validate complete data with all fields filled correctly', () => {
      const completeData = {
        profilePhoto: 'data:image/png;base64,abc123',
        fullName: 'Alberto Marquez',
        lastName: 'Marquez',
        cpf: '12345678901',
        phone: '+5511999999999',
        email: 'alberto@example.com',
        birthDate: '1980-03-18',
        sex: 'Masculino',
        gender: 'Masculino',
        documentType: 'CPF',
        professionalLicense: 'Licenciado em psicologia',
        languages: ['Português', 'Espanhol'],
        profession: 'Psicólogo',
        knowledgeLevel: 'Mestrado',
        experienceTypes: ['Idosos', 'Portadores de TDAH'],
        yearsExperience: '10 ou +',
        preferredTypes: ['Portadores de TDAH'],
        preferredAgeRange: 'Idosos',
      };

      const result = generalInfoSchema.safeParse(completeData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.lastName).toBe('Marquez');
        expect(result.data.sex).toBe('Masculino');
        expect(result.data.gender).toBe('Masculino');
        expect(result.data.documentType).toBe('CPF');
        expect(result.data.languages).toHaveLength(2);
        expect(result.data.profession).toBe('Psicólogo');
        expect(result.data.knowledgeLevel).toBe('Mestrado');
        expect(result.data.experienceTypes).toHaveLength(2);
        expect(result.data.yearsExperience).toBe('10 ou +');
        expect(result.data.preferredTypes).toHaveLength(1);
        expect(result.data.preferredAgeRange).toBe('Idosos');
      }
    });

    it('should reject data missing any required field', () => {
      const requiredFields = [
        'lastName', 'sex', 'gender', 'documentType', 'languages',
        'profession', 'knowledgeLevel', 'experienceTypes',
        'yearsExperience', 'preferredTypes', 'preferredAgeRange'
      ];

      requiredFields.forEach(field => {
        const incompleteData = { ...baseValidData, [field]: field.includes('Types') || field === 'languages' ? [] : '' };
        const result = generalInfoSchema.safeParse(incompleteData);
        expect(result.success).toBe(false, `Field ${field} should be required`);
      });
    });
  });
});
