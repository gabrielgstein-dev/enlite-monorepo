/**
 * useGlobalMetrics Hook
 * Calculates global recruitment metrics from dashboard data
 */

import { useMemo } from 'react';
import type {
  ClickUpRow,
  TalentumRow,
  PublicationRow,
  BaseRow,
  ProgresoRow,
  GlobalMetrics,
  DateFilterType,
} from '@domain/entities/RecruitmentData';
import {
  getMatchingKey,
  parseDate,
  isAsistente,
} from '@presentation/utils/recruitmentHelpers';

interface UseGlobalMetricsParams {
  clickUpData: ClickUpRow[];
  talentumData: TalentumRow[];
  pubData: PublicationRow[];
  baseData: BaseRow[];
  progresoData: ProgresoRow[];
  dateFilter: DateFilterType;
  customStartDate?: string;
  customEndDate?: string;
}

export function useGlobalMetrics({
  clickUpData,
  talentumData,
  pubData,
  baseData,
  progresoData,
  dateFilter,
  customStartDate,
  customEndDate,
}: UseGlobalMetricsParams): GlobalMetrics {
  return useMemo(() => {
    const warnings: string[] = [];

    // Filter function based on date
    const filterByDate = <T extends Record<string, string>>(
      data: T[],
      dateColumns: string[]
    ): T[] => {
      if (dateFilter === 'all') return data;

      const now = new Date();
      let startDate: Date | null = null;
      let endDate: Date | null = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

      if (dateFilter === 'hoy') {
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      } else if (dateFilter === 'ayer') {
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        startDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 0, 0, 0);
        endDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59);
      } else if (dateFilter === '1w') {
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 7);
      } else if (dateFilter === '1m') {
        startDate = new Date(now);
        startDate.setMonth(startDate.getMonth() - 1);
      } else if (dateFilter === 'custom' && customStartDate && customEndDate) {
        startDate = parseDate(customStartDate);
        endDate = parseDate(customEndDate);
      }

      if (!startDate) return data;

      const dateCol = getMatchingKey(data, dateColumns);
      if (!dateCol) return data;

      return data.filter((row) => {
        const dateVal = parseDate(row[dateCol] || '');
        if (isNaN(dateVal.getTime())) return false;
        return dateVal >= startDate! && dateVal <= endDate!;
      });
    };

    // Count active cases
    let activeCasesCount = 0;
    let busquedaCount = 0;
    let reemplazoCount = 0;

    if (clickUpData.length > 0) {
      const statusCol = getMatchingKey(clickUpData, ['estado', 'status']);
      if (statusCol) {
        clickUpData.forEach((row) => {
          const status = String(row[statusCol] || '').toUpperCase().trim();
          if (status === 'BUSQUEDA' || status === 'BÚSQUEDA') {
            activeCasesCount++;
            busquedaCount++;
          } else if (status === 'REEMPLAZO' || status === 'REEMPLAZOS') {
            activeCasesCount++;
            reemplazoCount++;
          }
        });
      }
    }

    // Count postulantes in Talentum
    const filteredTalentum = filterByDate(talentumData, ['__fecha', 'fecha', 'date']);
    const postulantesInTalentumCount = filteredTalentum.filter((row) => {
      if (dateFilter !== 'all') {
        const dateCol = getMatchingKey([row], ['__fecha', 'fecha', 'date']);
        if (dateCol) {
          const dateVal = parseDate(row[dateCol] || '');
          return !isNaN(dateVal.getTime());
        }
        return false;
      }
      return true;
    }).length;

    // Count candidatos en progreso
    const filteredProgreso = filterByDate(progresoData, ['__fecha', 'fecha', 'date']);
    const resultadoCol = getMatchingKey(filteredProgreso, ['resultado', 'result', 'estado']);
    const candidatosEnProgresoCount = filteredProgreso.filter((row) => {
      if (resultadoCol) {
        const res = String(row[resultadoCol] || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toUpperCase()
          .trim();
        return res !== 'TERMINADO TALENTUM' && res !== 'NO CONTINUA' && res !== 'BLACKLIST';
      }
      return true;
    }).length;

    // Count publications by channel
    const filteredPubs = filterByDate(pubData, ['fecha', 'date', 'fecha de publicación']);
    const canalCol = getMatchingKey(filteredPubs, ['canal', 'channel', 'medio']);
    const pubCounts: Record<string, number> = {};

    if (canalCol) {
      filteredPubs.forEach((row) => {
        const canal = String(row[canalCol] || '').trim() || 'Sin canal';
        pubCounts[canal] = (pubCounts[canal] || 0) + 1;
      });
    }

    const pubChartData = Object.entries(pubCounts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    const totalPubs = filteredPubs.length;

    // Count encuadres
    const filteredBase = filterByDate(baseData, ['fecha encuadre', 'fecha']);
    const presenteCol = getMatchingKey(filteredBase, ['presente', 'asistencia']);
    const encuadresUnicos = new Set<string>();

    if (presenteCol) {
      const fechaCol = getMatchingKey(filteredBase, ['fecha encuadre', 'fecha']);
      const horaCol = getMatchingKey(filteredBase, ['hora encuadre', 'hora']);

      filteredBase.forEach((row) => {
        const presente = String(row[presenteCol] || '');
        if (isAsistente(presente)) {
          const fecha = fechaCol ? String(row[fechaCol] || '').trim() : '';
          const hora = horaCol ? String(row[horaCol] || '').trim() : '';
          if (fecha) {
            encuadresUnicos.add(`${fecha}-${hora}`);
          }
        }
      });
    }

    return {
      activeCasesCount,
      busquedaCount,
      reemplazoCount,
      postulantesInTalentumCount,
      candidatosEnProgresoCount,
      totalPubs,
      pubChartData,
      cantidadEncuadres: encuadresUnicos.size,
      warnings,
    };
  }, [
    clickUpData,
    talentumData,
    pubData,
    baseData,
    progresoData,
    dateFilter,
    customStartDate,
    customEndDate,
  ]);
}
