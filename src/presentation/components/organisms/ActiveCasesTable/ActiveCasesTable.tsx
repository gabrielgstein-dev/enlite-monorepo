/**
 * ActiveCasesTable Organism
 * Displays active recruitment cases with sorting and conditional colors
 */

import { useState, useMemo } from 'react';
import { StatusBadge } from '@presentation/components/atoms/StatusBadge';
import type { ActiveCase } from '@domain/entities/RecruitmentData';
import { ChevronUp, ChevronDown } from 'lucide-react';

interface ActiveCasesTableProps {
  cases: ActiveCase[];
  onCaseClick?: (caseId: string) => void;
  className?: string;
}

type SortKey = 'id' | 'name' | 'status' | 'inicioBusqueda';
type SortDirection = 'asc' | 'desc';

interface SortConfig {
  key: SortKey;
  direction: SortDirection;
}

export function ActiveCasesTable({
  cases,
  onCaseClick,
  className = '',
}: ActiveCasesTableProps): JSX.Element {
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);

  const sortedCases = useMemo(() => {
    if (!sortConfig) return cases;

    const sorted = [...cases].sort((a, b) => {
      let aVal: string | number = '';
      let bVal: string | number = '';

      switch (sortConfig.key) {
        case 'id':
          aVal = parseInt(a.id) || a.id;
          bVal = parseInt(b.id) || b.id;
          break;
        case 'name':
          aVal = a.name.toLowerCase();
          bVal = b.name.toLowerCase();
          break;
        case 'status':
          aVal = a.status;
          bVal = b.status;
          break;
        case 'inicioBusqueda': {
          const dA = a.inicioBusquedaObj.getTime();
          const dB = b.inicioBusquedaObj.getTime();
          if (!isNaN(dA) && !isNaN(dB)) {
            return sortConfig.direction === 'asc' ? dA - dB : dB - dA;
          }
          aVal = a.inicioBusqueda;
          bVal = b.inicioBusqueda;
          break;
        }
      }

      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [cases, sortConfig]);

  const requestSort = (key: SortKey): void => {
    let direction: SortDirection = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const renderSortIcon = (key: SortKey): JSX.Element => {
    if (!sortConfig || sortConfig.key !== key) {
      return (
        <span className="text-slate-300 dark:text-slate-600 ml-1 opacity-0 group-hover:opacity-100">
          ↕
        </span>
      );
    }
    return sortConfig.direction === 'asc' ? (
      <ChevronUp className="w-4 h-4 ml-1 text-primary inline" />
    ) : (
      <ChevronDown className="w-4 h-4 ml-1 text-primary inline" />
    );
  };

  if (cases.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500">
        No hay casos activos para mostrar
      </div>
    );
  }

  return (
    <div className={`overflow-hidden shadow ring-1 ring-black ring-opacity-5 sm:rounded-lg overflow-x-auto ${className}`}>
      <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
        <thead className="bg-slate-50 dark:bg-slate-900/50">
          <tr>
            <th
              scope="col"
              onClick={() => requestSort('id')}
              className="cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-slate-900 dark:text-slate-200 sm:pl-6 select-none"
            >
              Caso Número
              {renderSortIcon('id')}
            </th>
            <th
              scope="col"
              onClick={() => requestSort('name')}
              className="cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors px-3 py-3.5 text-left text-sm font-semibold text-slate-900 dark:text-slate-200 select-none"
            >
              Task Name
              {renderSortIcon('name')}
            </th>
            <th
              scope="col"
              onClick={() => requestSort('status')}
              className="cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors px-3 py-3.5 text-left text-sm font-semibold text-slate-900 dark:text-slate-200 select-none"
            >
              Estado
              {renderSortIcon('status')}
            </th>
            <th
              scope="col"
              onClick={() => requestSort('inicioBusqueda')}
              className="cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors px-3 py-3.5 text-left text-sm font-semibold text-slate-900 dark:text-slate-200 select-none"
            >
              Inicio Búsqueda
              {renderSortIcon('inicioBusqueda')}
            </th>
            <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6">
              <span className="sr-only">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 dark:divide-slate-700 bg-white dark:bg-slate-800">
          {sortedCases.map((caso, idx) => (
            <tr
              key={`${caso.id}-${idx}`}
              onClick={() => onCaseClick?.(caso.id)}
              className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/50 group"
            >
              <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-slate-900 dark:text-slate-200 sm:pl-6">
                {caso.id}
              </td>
              <td className="whitespace-nowrap px-3 py-4 text-sm text-slate-500 dark:text-slate-400">
                {caso.name}
              </td>
              <td className="whitespace-nowrap px-3 py-4 text-sm">
                <StatusBadge status={caso.status} />
              </td>
              <td className="whitespace-nowrap px-3 py-4 text-sm font-medium text-slate-900 dark:text-slate-200">
                {caso.inicioBusqueda}
              </td>
              <td className="whitespace-nowrap px-3 py-4 text-sm text-right">
                <span className="opacity-0 group-hover:opacity-100 transition-opacity text-primary text-xs font-medium">
                  Ver análisis &rarr;
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
