/**
 * Domain entities for Recruitment Dashboard
 * Represents data from ClickUp, Talentum, and Operational Spreadsheet
 */

export interface ClickUpRow {
  [key: string]: string;
}

export type TalentumRow = Record<string, string> & {
  __fecha?: string; // Standardized date field
};

export interface PublicationRow {
  [key: string]: string;
}

export interface BaseRow {
  [key: string]: string;
}

export type ProgresoRow = Record<string, string> & {
  __fecha?: string; // Standardized date field
};

export interface ActiveCase {
  id: string;
  name: string;
  status: 'BUSQUEDA' | 'REEMPLAZOS' | 'REEMPLAZO';
  inicioBusqueda: string;
  inicioBusquedaObj: Date;
}

export interface ReemplazosCounts {
  sel: number;
  rem: number;
}

export interface GlobalMetrics {
  activeCasesCount: number;
  busquedaCount: number;
  reemplazoCount: number;
  postulantesInTalentumCount: number;
  candidatosEnProgresoCount: number;
  totalPubs: number;
  pubChartData: Array<{ name: string; value: number }>;
  cantidadEncuadres: number;
  warnings: string[];
}

export interface CaseMetrics {
  pubChartData: Array<{ name: string; value: number }>;
  publicacionesList: Array<{
    fechaObj: Date | null;
    fecha: string;
    canal: string;
    publicadoPor: string;
    descripcion: string;
  }>;
  candidatosCount: number;
  postuladosCount: number;
  invitados: number;
  asistentes: number;
  asistenciaPct: number;
  seleccionadosCount: number;
  reemplazosCount: number;
  resultadosChartData: Array<{ name: string; value: number }>;
  cantidadEncuadres: number;
  warnings: string[];
}

export interface ClickUpCaseInfo {
  status: string;
  prioridad: string;
  dependencia: string;
  diagnostico: string;
  horarios: string;
  perfil: string;
  perfilPaciente: string;
  edad: string;
  comentario: string;
  zona: string;
  tiempoBusqueda: string;
  fechaCreacion: string;
  fechaFinal: string;
}

export interface ZonaMetrics {
  zonas: Array<{
    name: string;
    count: number;
    pct: number;
    pctOfTotal: number;
  }>;
  nullCount: number;
  nullPct: string;
  total: number;
  validTotal: number;
  maxCount: number;
}

export type DateFilterType = 'all' | 'hoy' | 'ayer' | '1w' | '1m' | 'custom';
