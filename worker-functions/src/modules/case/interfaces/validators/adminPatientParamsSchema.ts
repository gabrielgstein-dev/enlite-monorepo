import { z } from 'zod';

/**
 * adminPatientParamsSchema — validates route params for GET /api/admin/patients/:id.
 * Enforces UUID v4 format; returns 400 on any other value.
 */
export const adminPatientParamsSchema = z.object({
  id: z.string().uuid({ message: 'id must be a valid UUID' }),
});

export type AdminPatientParams = z.infer<typeof adminPatientParamsSchema>;
