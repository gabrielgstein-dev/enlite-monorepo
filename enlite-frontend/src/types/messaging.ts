// Tipos do módulo de Mensageria
// Espelha o shape retornado por GET /api/admin/messaging/stats

export interface DeliveryStatus {
  delivered: number;
  read: number;
  undelivered: number;
  failed: number;
  pending: number;
}

export interface DispatchLogStats {
  total: number;
  sent: number;
  error: number;
  deliveryStatus: DeliveryStatus;
}

export interface OutboxStats {
  total: number;
  pending: number;
  sent: number;
  failed: number;
}

export interface MessageError {
  id: string;
  workerId: string;
  phone: string;
  templateSlug: string;
  errorMessage: string;
  dispatchedAt: string;
}

export interface MessageStats {
  dispatchLogs: DispatchLogStats;
  outbox: OutboxStats;
  recentErrors: MessageError[];
}
