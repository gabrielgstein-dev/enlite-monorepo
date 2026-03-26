import { TFunction } from 'i18next';
import { VacancyRow } from '@presentation/components/features/admin/VacanciesTable';
import { SelectOption } from '@presentation/components/molecules/SelectField';

export const mockVacancies: VacancyRow[] = [
  {
    id: '1',
    caso: 'Caso 234',
    status: 'Em Processo',
    grau: 'Muito Grave',
    grauColor: 'text-[#ed0006]',
    diasAberto: '05',
    convidados: '00',
    postulados: '',
    selecionados: '',
    faltantes: '',
  },
  {
    id: '2',
    caso: 'Caso SN21',
    status: 'Ativo',
    grau: 'Grave',
    grauColor: 'text-[#f9a000]',
    diasAberto: '04',
    convidados: '17',
    postulados: '',
    selecionados: '',
    faltantes: '',
  },
  {
    id: '3',
    caso: 'Caso 245',
    status: 'Em Processo',
    grau: 'Moderado',
    grauColor: 'text-[#fdc405]',
    diasAberto: '07',
    convidados: '15',
    postulados: '',
    selecionados: '',
    faltantes: '',
  },
  {
    id: '4',
    caso: 'Caso 265',
    status: 'Inativo',
    grau: 'Leve',
    grauColor: 'text-[#81c784]',
    diasAberto: '18',
    convidados: '12',
    postulados: '',
    selecionados: '',
    faltantes: '',
  },
  {
    id: '5',
    caso: 'Caso 257',
    status: 'Ativo',
    grau: 'Leve',
    grauColor: 'text-[#81c784]',
    diasAberto: '20',
    convidados: '02',
    postulados: '',
    selecionados: '',
    faltantes: '',
  },
  {
    id: '6',
    caso: 'Caso 321',
    status: 'Esperando Ativação',
    grau: 'Moderado',
    grauColor: 'text-[#fdc405]',
    diasAberto: '25',
    convidados: '07',
    postulados: '',
    selecionados: '',
    faltantes: '',
  },
  {
    id: '7',
    caso: 'Caso 314',
    status: 'Ativo',
    grau: 'Moderado',
    grauColor: 'text-[#fdc405]',
    diasAberto: '22',
    convidados: '18',
    postulados: '',
    selecionados: '',
    faltantes: '',
  },
];

export const getStatsData = (t: TFunction) => [
  { label: t('admin.vacancies.stats.moreThan7Days'), value: '2', icon: 'clock' as const },
  { label: t('admin.vacancies.stats.moreThan24Days'), value: '20', icon: 'clock' as const },
  { label: t('admin.vacancies.stats.inSelection'), value: '44', icon: 'user-check' as const },
  { label: t('admin.vacancies.stats.totalVacancies'), value: '4,5h', icon: 'user-search' as const },
];

export const getClientOptions = (t: TFunction): SelectOption[] => [
  { value: '', label: t('admin.vacancies.clientOptions.placeholder') },
  { value: 'osde', label: t('admin.vacancies.clientOptions.osde') },
  { value: 'swiss', label: t('admin.vacancies.clientOptions.swissMedical') },
];

export const getStatusOptions = (t: TFunction): SelectOption[] => [
  { value: '', label: t('admin.vacancies.statusOptions.all') },
  { value: 'ativo', label: t('admin.vacancies.statusOptions.active') },
  { value: 'processo', label: t('admin.vacancies.statusOptions.inProcess') },
  { value: 'pausado', label: t('admin.vacancies.statusOptions.paused') },
];

export const getPriorityOptions = (t: TFunction): SelectOption[] => [
  { value: '', label: t('admin.vacancies.priorityOptions.all') },
  { value: 'urgent', label: t('admin.vacancies.priorityOptions.urgent') },
  { value: 'high', label: t('admin.vacancies.priorityOptions.high') },
  { value: 'normal', label: t('admin.vacancies.priorityOptions.normal') },
  { value: 'low', label: t('admin.vacancies.priorityOptions.low') },
];
