import { canTransition, InterviewResponse } from '../InterviewStateMachine';

describe('InterviewStateMachine', () => {
  describe('canTransition', () => {
    it('allows pending → confirmed', () => {
      expect(canTransition('pending', 'confirmed')).toBe(true);
    });

    it('allows pending → declined', () => {
      expect(canTransition('pending', 'declined')).toBe(true);
    });

    it('allows confirmed → declined (worker pode cancelar)', () => {
      expect(canTransition('confirmed', 'declined')).toBe(true);
    });

    it('blocks declined → any (estado final)', () => {
      expect(canTransition('declined', 'pending')).toBe(false);
      expect(canTransition('declined', 'confirmed')).toBe(false);
      expect(canTransition('declined', 'declined')).toBe(false);
    });

    it('blocks confirmed → pending (não pode voltar atrás)', () => {
      expect(canTransition('confirmed', 'pending')).toBe(false);
    });

    it('blocks no_response → any (estado final)', () => {
      expect(canTransition('no_response', 'pending')).toBe(false);
      expect(canTransition('no_response', 'confirmed')).toBe(false);
      expect(canTransition('no_response', 'declined')).toBe(false);
    });

    it('returns false for unknown states', () => {
      expect(canTransition('unknown', 'confirmed')).toBe(false);
      expect(canTransition('pending', 'unknown')).toBe(false);
    });
  });
});
