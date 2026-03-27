export interface WorkerAvailability {
  id: string;
  workerId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  timezone: string;
  crossesMidnight: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAvailabilityDTO {
  workerId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  timezone: string;
  crossesMidnight?: boolean;
}

export interface AvailabilitySlot {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  crossesMidnight?: boolean;
}
