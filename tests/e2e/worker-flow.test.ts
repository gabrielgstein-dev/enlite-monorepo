import axios, { AxiosInstance } from 'axios';
import { Pool } from 'pg';

const API_URL = process.env.API_URL || 'http://localhost:8081';
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://enlite_test:test_password@localhost:5433/enlite_test';

describe('Worker E2E Flow', () => {
  let api: AxiosInstance;
  let db: Pool;
  let workerId: string;
  const testAuthUid = `test-${Date.now()}`;
  const testEmail = `test-${Date.now()}@example.com`;

  beforeAll(async () => {
    api = axios.create({
      baseURL: API_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    db = new Pool({
      connectionString: DATABASE_URL,
    });

    // Aguardar backend estar pronto
    await waitForBackend();
  });

  afterAll(async () => {
    // Limpar dados de teste
    if (workerId) {
      await db.query('DELETE FROM workers WHERE id = $1', [workerId]);
    }
    await db.end();
  });

  async function waitForBackend(maxRetries = 30) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        await api.get('/health');
        console.log('✅ Backend ready');
        return;
      } catch (error) {
        console.log(`⏳ Waiting for backend... (${i + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    throw new Error('Backend not ready after 30 seconds');
  }

  describe('Step 0: Initialize Worker', () => {
    it('should create a new worker', async () => {
      const response = await api.post('/api/workers/init', {
        authUid: testAuthUid,
        email: testEmail,
        phone: '+5511999999999',
        country: 'AR',
        timezone: 'America/Sao_Paulo',
      });

      expect(response.status).toBe(201);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toHaveProperty('id');
      expect(response.data.data.email).toBe(testEmail);
      expect(response.data.data.currentStep).toBe(1);
      expect(response.data.data.status).toBe('pending');

      workerId = response.data.data.id;
      console.log(`✅ Worker created: ${workerId}`);
    });

    it('should return existing worker if already exists', async () => {
      const response = await api.post('/api/workers/init', {
        authUid: testAuthUid,
        email: testEmail,
        phone: '+5511999999999',
      });

      expect(response.status).toBe(200);
      expect(response.data.data.id).toBe(workerId);
    });
  });

  describe('Step 1: Quiz Responses', () => {
    it('should save quiz responses', async () => {
      const response = await api.put('/api/workers/step', {
        workerId,
        step: 1,
        data: {
          responses: [
            { sectionId: '1', questionId: '1.1', answerId: 'A' },
            { sectionId: '1', questionId: '1.2', answerId: 'B' },
            { sectionId: '2', questionId: '2.1', answerId: 'C' },
            { sectionId: '2', questionId: '2.2', answerId: 'A' },
            { sectionId: '3', questionId: '3.1', answerId: 'B' },
          ],
        },
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      console.log('✅ Quiz responses saved');
    });

    it('should update worker to step 2', async () => {
      const result = await db.query(
        'SELECT current_step, status FROM workers WHERE id = $1',
        [workerId]
      );

      expect(result.rows[0].current_step).toBe(2);
      expect(result.rows[0].status).toBe('in_progress');
    });

    it('should have saved quiz responses in database', async () => {
      const result = await db.query(
        'SELECT COUNT(*) as count FROM worker_quiz_responses WHERE worker_id = $1',
        [workerId]
      );

      expect(parseInt(result.rows[0].count)).toBe(5);
    });
  });

  describe('Step 2: Personal Information', () => {
    it('should save personal information', async () => {
      const response = await api.put('/api/workers/step', {
        workerId,
        step: 2,
        data: {
          firstName: 'Alberto',
          lastName: 'Marquez',
          sex: 'Masculino',
          gender: 'Masculino',
          birthDate: '1960-03-18',
          documentType: 'CPF',
          documentNumber: '123.456.789-00',
          phone: '+5511920051588',
          profilePhotoUrl: 'https://example.com/photo.jpg',
          languages: ['Português', 'Espanhol'],
          profession: 'Cuidador',
          knowledgeLevel: 'Bacharelado',
          titleCertificate: 'Licenciado em psicologia',
          experienceTypes: ['Idosos', 'Portadores de TDAH'],
          yearsExperience: '10 ou +',
          preferredTypes: ['Portadores de TDAH'],
          preferredAgeRange: 'Idosos',
          termsAccepted: true,
          privacyAccepted: true,
        },
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toHaveProperty('firstName', 'Alberto');
      expect(response.data.data).toHaveProperty('lastName', 'Marquez');
      console.log('✅ Personal information saved');
    });

    it('should update worker to step 3', async () => {
      const result = await db.query(
        'SELECT current_step, first_name, last_name, profession FROM workers WHERE id = $1',
        [workerId]
      );

      expect(result.rows[0].current_step).toBe(3);
      expect(result.rows[0].first_name).toBe('Alberto');
      expect(result.rows[0].last_name).toBe('Marquez');
      expect(result.rows[0].profession).toBe('Cuidador');
    });

    it('should have accepted terms and privacy', async () => {
      const result = await db.query(
        'SELECT terms_accepted_at, privacy_accepted_at FROM workers WHERE id = $1',
        [workerId]
      );

      expect(result.rows[0].terms_accepted_at).not.toBeNull();
      expect(result.rows[0].privacy_accepted_at).not.toBeNull();
    });
  });

  describe('Step 3: Service Area', () => {
    it('should save service area', async () => {
      try {
        const response = await api.put('/api/workers/step', {
          workerId,
          step: 3,
          data: {
            address: 'Rua São Bento, 1500 - Centro, São Paulo/SP',
            addressComplement: 'Edifício dos Palmares, ap. 202',
            serviceRadiusKm: 10,
            lat: -23.5505,
            lng: -46.6333,
          },
        });

        expect(response.status).toBe(200);
        expect(response.data.success).toBe(true);
        console.log('✅ Service area saved');
      } catch (error: any) {
        console.error('❌ Step 3 Error:', error.response?.data || error.message);
        throw error;
      }
    });

    it('should update worker to step 4', async () => {
      const result = await db.query(
        'SELECT current_step FROM workers WHERE id = $1',
        [workerId]
      );

      expect(result.rows[0].current_step).toBe(4);
    });

    it('should have saved service area in database', async () => {
      const result = await db.query(
        'SELECT * FROM worker_service_areas WHERE worker_id = $1',
        [workerId]
      );

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].address_line).toContain('São Bento');
      expect(result.rows[0].radius_km).toBe(10);
      expect(parseFloat(result.rows[0].latitude)).toBeCloseTo(-23.5505, 4);
      expect(parseFloat(result.rows[0].longitude)).toBeCloseTo(-46.6333, 4);
    });
  });

  describe('Step 4: Availability', () => {
    it('should save availability slots', async () => {
      try {
        const response = await api.put('/api/workers/step', {
          workerId,
          step: 4,
          data: {
            availability: [
              { dayOfWeek: 0, startTime: '09:00:00', endTime: '11:30:00' },
              { dayOfWeek: 0, startTime: '14:00:00', endTime: '18:00:00' },
              { dayOfWeek: 1, startTime: '08:00:00', endTime: '12:00:00' },
              { dayOfWeek: 1, startTime: '14:00:00', endTime: '18:00:00' },
              { dayOfWeek: 2, startTime: '09:00:00', endTime: '17:00:00' },
            ],
          },
        });

        expect(response.status).toBe(200);
        expect(response.data.success).toBe(true);
        console.log('✅ Availability saved');
      } catch (error: any) {
        console.error('❌ Step 4 Error:', error.response?.data || error.message);
        throw error;
      }
    });

    it('should update worker to step 5 and status to review', async () => {
      const result = await db.query(
        'SELECT current_step, status FROM workers WHERE id = $1',
        [workerId]
      );

      expect(result.rows[0].current_step).toBe(5);
      expect(result.rows[0].status).toBe('review');
    });

    it('should have saved availability slots in database', async () => {
      const result = await db.query(
        'SELECT * FROM worker_availability WHERE worker_id = $1 ORDER BY day_of_week, start_time',
        [workerId]
      );

      expect(result.rows.length).toBe(5);
      expect(result.rows[0].day_of_week).toBe(0);
      expect(result.rows[0].start_time).toBe('09:00:00');
    });
  });

  describe('Get Worker Progress', () => {
    it('should return worker progress', async () => {
      const response = await api.get('/api/workers/me', {
        headers: {
          'x-auth-uid': testAuthUid,
        },
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.id).toBe(workerId);
      expect(response.data.data.currentStep).toBe(5);
      expect(response.data.data.status).toBe('review');
      console.log('✅ Worker progress retrieved');
    });
  });

  describe('Worker Index Sync', () => {
    it('should have synced worker to worker_index table', async () => {
      const result = await db.query(
        'SELECT * FROM worker_index WHERE id = $1',
        [workerId]
      );

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].country).toBe('AR');
      expect(result.rows[0].status).toBe('review');
      expect(result.rows[0].step).toBe(5);
    });
  });

  describe('Data Validation', () => {
    it('should have all required fields populated', async () => {
      const result = await db.query(
        `SELECT 
          first_name, last_name, sex, gender, birth_date,
          document_type, document_number, profile_photo_url,
          languages, profession, knowledge_level, title_certificate,
          experience_types, years_experience, preferred_types, preferred_age_range,
          terms_accepted_at, privacy_accepted_at, country
        FROM workers WHERE id = $1`,
        [workerId]
      );

      const worker = result.rows[0];
      expect(worker.first_name).toBe('Alberto');
      expect(worker.last_name).toBe('Marquez');
      expect(worker.sex).toBe('Masculino');
      expect(worker.profession).toBe('Cuidador');
      expect(worker.languages).toEqual(['Português', 'Espanhol']);
      expect(worker.experience_types).toEqual(['Idosos', 'Portadores de TDAH']);
      expect(worker.country).toBe('AR');
    });
  });
});
