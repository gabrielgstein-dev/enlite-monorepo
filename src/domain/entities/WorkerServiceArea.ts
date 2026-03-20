export interface WorkerServiceArea {
  id: string;
  workerId: string;
  address: string;
  addressComplement?: string;
  serviceRadiusKm: number;
  lat: number;
  lng: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateServiceAreaDTO {
  workerId: string;
  address: string;
  addressComplement?: string;
  serviceRadiusKm: number;
  lat: number;
  lng: number;
}
