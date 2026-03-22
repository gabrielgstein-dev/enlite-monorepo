/**
 * useDashboardData Hook
 * Fetches recruitment data from worker-functions
 * Currently using mock data - will be replaced with real API calls
 */

import { useState, useEffect } from 'react';
import type {
  ClickUpRow,
  TalentumRow,
  PublicationRow,
  BaseRow,
  ProgresoRow,
} from '@domain/entities/RecruitmentData';

interface DashboardData {
  clickUpData: ClickUpRow[];
  talentumData: TalentumRow[];
  pubData: PublicationRow[];
  baseData: BaseRow[];
  progresoData: ProgresoRow[];
  isLoading: boolean;
  error: string | null;
}

export function useDashboardData(): DashboardData {
  const [data, setData] = useState<DashboardData>({
    clickUpData: [],
    talentumData: [],
    pubData: [],
    baseData: [],
    progresoData: [],
    isLoading: true,
    error: null,
  });

  useEffect(() => {
    // TODO: Replace with real API calls to worker-functions
    // const fetchData = async () => {
    //   try {
    //     const [clickUp, talentum, pub, base, progreso] = await Promise.all([
    //       fetch('/api/recruitment/clickup').then(r => r.json()),
    //       fetch('/api/recruitment/talentum').then(r => r.json()),
    //       fetch('/api/recruitment/publications').then(r => r.json()),
    //       fetch('/api/recruitment/base').then(r => r.json()),
    //       fetch('/api/recruitment/progreso').then(r => r.json()),
    //     ]);
    //     setData({ clickUpData: clickUp, talentumData: talentum, ... });
    //   } catch (error) {
    //     setData(prev => ({ ...prev, error: 'Error loading data' }));
    //   }
    // };

    // Mock data simulation
    setTimeout(() => {
      setData({
        clickUpData: generateMockClickUpData(),
        talentumData: generateMockTalentumData(),
        pubData: generateMockPublicationData(),
        baseData: generateMockBaseData(),
        progresoData: generateMockProgresoData(),
        isLoading: false,
        error: null,
      });
    }, 500);
  }, []);

  return data;
}

// Mock data generators
function generateMockClickUpData(): ClickUpRow[] {
  return [
    {
      'caso número (number)': '442',
      'task name': 'AT para paciente con ansiedad - Palermo',
      estado: 'BUSQUEDA',
      'date created': '2024-01-15',
      'zona o barrio paciente': 'Palermo',
      diagnóstico: 'Ansiedad',
      prioridad: 'Alta',
    },
    {
      'caso número (number)': '443',
      'task name': 'AT para paciente con depresión - Belgrano',
      estado: 'REEMPLAZO',
      'date created': '2024-01-20',
      'zona o barrio paciente': 'Belgrano',
      diagnóstico: 'Depresión',
      prioridad: 'Media',
    },
    {
      'caso número (number)': '444',
      'task name': 'AT para paciente con TLP - Caballito',
      estado: 'BUSQUEDA',
      'date created': '2024-02-01',
      'zona o barrio paciente': 'Caballito',
      diagnóstico: 'TLP',
      prioridad: 'Alta',
    },
  ];
}

function generateMockTalentumData(): TalentumRow[] {
  return [
    {
      nombre: 'Juan Pérez',
      apellido: 'García',
      teléfono: '1145678901',
      'pre screenings': 'CASO 442, CASO 443',
      __fecha: '2024-03-01',
    },
    {
      nombre: 'María',
      apellido: 'López',
      teléfono: '1156789012',
      'pre screenings': 'CASO 442',
      __fecha: '2024-03-05',
    },
    {
      nombre: 'Carlos',
      apellido: 'Rodríguez',
      teléfono: '1167890123',
      'pre screenings': 'CASO 444',
      __fecha: '2024-03-10',
    },
  ];
}

function generateMockPublicationData(): PublicationRow[] {
  return [
    {
      caso: '442',
      fecha: '2024-03-01',
      canal: 'LinkedIn',
      'publicado por': 'Admin',
      descripción: 'Búsqueda AT Palermo',
    },
    {
      caso: '442',
      fecha: '2024-03-05',
      canal: 'Instagram',
      'publicado por': 'RRHH',
      descripción: 'Repost búsqueda',
    },
    {
      caso: '443',
      fecha: '2024-02-28',
      canal: 'LinkedIn',
      'publicado por': 'Admin',
      descripción: 'Búsqueda AT Belgrano',
    },
    {
      caso: '444',
      fecha: '2024-03-08',
      canal: 'Facebook',
      'publicado por': 'RRHH',
      descripción: 'Búsqueda AT Caballito',
    },
  ];
}

function generateMockBaseData(): BaseRow[] {
  return [
    {
      caso: '442',
      'fecha encuadre': '2024-03-15',
      'hora encuadre': '10:00',
      presente: 'true',
      resultado: 'SELECCIONADO',
    },
    {
      caso: '442',
      'fecha encuadre': '2024-03-16',
      'hora encuadre': '14:00',
      presente: 'true',
      resultado: 'REEMPLAZO',
    },
    {
      caso: '443',
      'fecha encuadre': '2024-03-12',
      'hora encuadre': '11:00',
      presente: 'true',
      resultado: 'SELECCIONADO',
    },
  ];
}

function generateMockProgresoData(): ProgresoRow[] {
  return [
    {
      nombre: 'Ana',
      apellido: 'Martínez',
      caso: 'CASO 442',
      resultado: 'En proceso',
      __fecha: '2024-03-01',
    },
    {
      nombre: 'Pedro',
      apellido: 'Sánchez',
      caso: 'CASO 443',
      resultado: 'En proceso',
      __fecha: '2024-03-02',
    },
  ];
}
