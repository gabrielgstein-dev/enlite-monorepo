/**
 * ActiveCasesTable Organism
 * Displays active recruitment cases with sorting and conditional colors
 */

import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StatusBadge } from '@presentation/components/atoms/StatusBadge';
import type { ActiveCase } from '@domain/entities/RecruitmentData';
import { ChevronUp, ChevronDown } from 'lucide-react';

interface ActiveCasesTableProps {
  cases: ActiveCase[];
  onCaseClick: (caseNumber: string) => void;
  reemplazosColors?: Record<string, 'red' | 'yellow' | 'green'>;
  className?: string;
}

type SortKey = 'id' | 'name' | 'status' | 'inicioBusqueda';
type SortDirection = 'asc' | 'desc';

export function ActiveCasesTable({
  cases,
  onCaseClick,
  reemplazosColors,
  className = '',
}: ActiveCasesTableProps): JSX.Element {
  const { t } = useTranslation();
  const [sortConfig, setSortConfig] = useState<{ key: keyof ActiveCase; direction: 'asc' | 'desc' } | null>(null);

  const getRowColorClass = (caseNumber: string): string => {
    if (!reemplazosColors) return '';
    const color = reemplazosColors[caseNumber];
    if (color === 'red') return 'bg-red-50 hover:bg-red-100';
    if (color === 'yellow') return 'bg-yellow-50 hover:bg-yellow-100';
    if (color === 'green') return 'bg-green-50 hover:bg-green-100';
    return '';
  };

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
        {t('admin.recruitment.caseAnalysis.noCase')}
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
              {t('admin.recruitment.table.caseNumber')}
              {renderSortIcon('id')}
            </th>
            <th
              scope="col"
              onClick={() => requestSort('name')}
              className="cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors px-3 py-3.5 text-left text-sm font-semibold text-slate-900 dark:text-slate-200 select-none"
            >
              {t('admin.recruitment.table.taskName')}
              {renderSortIcon('name')}
            </th>
            <th
              scope="col"
              onClick={() => requestSort('status')}
              className="cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors px-3 py-3.5 text-left text-sm font-semibold text-slate-900 dark:text-slate-200 select-none"
            >
              {t('admin.recruitment.table.status')}
              {renderSortIcon('status')}
            </th>
            <th
              scope="col"
              onClick={() => requestSort('inicioBusqueda')}
              className="cursor-pointer group hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors px-3 py-3.5 text-left text-sm font-semibold text-slate-900 dark:text-slate-200 select-none"
            >
              {t('admin.recruitment.table.startDate')}
              {renderSortIcon('inicioBusqueda')}
            </th>
            <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6">
              <span className="sr-only">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 dark:divide-slate-700 bg-white dark:bg-slate-800">
          {sortedCases.map((caseItem) => (
            <tr
              key={caseItem.id}
              onClick={() => onCaseClick(caseItem.id)}
              className={`cursor-pointer transition-colors ${getRowColorClass(caseItem.id) || 'hover:bg-gray-50'}`}
            >
              <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-slate-900 dark:text-slate-200 sm:pl-6">
                {caseItem.id}
              </td>
              <td className="whitespace-nowrap px-3 py-4 text-sm text-slate-500 dark:text-slate-400">
                {caseItem.name}
              </td>
              <td className="whitespace-nowrap px-3 py-4 text-sm">
                <StatusBadge status={caseItem.status} />
              </td>
              <td className="whitespace-nowrap px-3 py-4 text-sm font-medium text-slate-900 dark:text-slate-200">
                {caseItem.inicioBusqueda}
              </td>
              <td className="whitespace-nowrap px-3 py-4 text-sm text-right">
                <span className="opacity-0 group-hover:opacity-100 transition-opacity text-primary text-xs font-medium">
                  {t('admin.recruitment.table.viewAnalysis')} &rarr;
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
