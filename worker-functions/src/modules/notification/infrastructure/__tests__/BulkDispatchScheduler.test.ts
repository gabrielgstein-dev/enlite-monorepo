/**
 * BulkDispatchScheduler.test.ts
 *
 * Testa o scheduler stateless de bulk dispatch (Cloud Scheduler).
 *
 * Cenários:
 * 1. run() executa use case e retorna resultado
 * 2. run() propaga erro quando use case falha
 * 3. API: não expõe start()/stop()
 */

import { BulkDispatchScheduler } from '../BulkDispatchScheduler';

// Mock the use case module
jest.mock('../../../application/use-cases/BulkDispatchIncompleteWorkersUseCase', () => ({
  BulkDispatchIncompleteWorkersUseCase: jest.fn().mockImplementation(() => ({
    execute: jest.fn(),
  })),
}));

import { BulkDispatchIncompleteWorkersUseCase } from '../../../application/use-cases/BulkDispatchIncompleteWorkersUseCase';

describe('BulkDispatchScheduler', () => {
  let mockDb: any;
  let mockMessaging: any;
  let scheduler: BulkDispatchScheduler;

  beforeEach(() => {
    mockDb = {};
    mockMessaging = {};
    scheduler = new BulkDispatchScheduler(mockDb, mockMessaging);
    jest.clearAllMocks();
  });

  describe('run', () => {
    it('executa use case e retorna resultado', async () => {
      const mockResult = { total: 10, sent: 8, errors: 2 };
      (BulkDispatchIncompleteWorkersUseCase as jest.Mock).mockImplementation(() => ({
        execute: jest.fn().mockResolvedValue({
          isFailure: false,
          getValue: () => mockResult,
        }),
      }));

      const result = await scheduler.run();

      expect(result).toEqual({ total: 10, sent: 8, errors: 2 });
      expect(BulkDispatchIncompleteWorkersUseCase).toHaveBeenCalledWith(mockDb, mockMessaging);
    });

    it('lança erro quando use case retorna isFailure', async () => {
      (BulkDispatchIncompleteWorkersUseCase as jest.Mock).mockImplementation(() => ({
        execute: jest.fn().mockResolvedValue({
          isFailure: true,
          error: 'No workers found',
        }),
      }));

      await expect(scheduler.run()).rejects.toThrow('No workers found');
    });
  });

  describe('API surface', () => {
    it('não expõe start() nem stop()', () => {
      expect((scheduler as any).start).toBeUndefined();
      expect((scheduler as any).stop).toBeUndefined();
      expect((scheduler as any).timeout).toBeUndefined();
      expect((scheduler as any).interval).toBeUndefined();
    });
  });
});
