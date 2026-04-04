import { useTranslation } from 'react-i18next';
import { TFunction } from 'i18next';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState, useMemo } from 'react';
import { SelectField, type SelectOption } from '@presentation/components/molecules/SelectField';
import { SearchInput } from '@presentation/components/molecules/SearchBar';

interface Job {
  code: string;
  title: string;
  workerType: string;
  provincia: string;
  localidad: string;
  workerSex: string;
  pathologies: string;
  description: string;
  service: string;
  daysAndHours: string;
  ageRange: string;
  profile: string;
  whatsappLink: string;
  detailLink: string;
}

// Factory functions for i18n options
const getWorkerTypeOptions = (t: TFunction): SelectOption[] => [
  { value: 'acompañante terapéutico', label: t('jobs.types.at') },
  { value: 'acompañante terapéutico (at)', label: t('jobs.types.at_full') },
  { value: 'acompañante terapéutico (at) escolar', label: t('jobs.types.at_school') },
  { value: 'cuidador/a', label: t('jobs.types.caregiver') },
];

const getProvinceOptions = (t: TFunction): SelectOption[] => [
  { value: 'caba', label: t('jobs.provinces.caba') },
  { value: 'provincia de buenos aires', label: t('jobs.provinces.buenos_aires') },
  { value: 'provincia de misiones', label: t('jobs.provinces.misiones') },
];

// Localities are proper names - no translation needed, just return as-is
const getLocalityOptions = (): SelectOption[] => [
  { value: 'adrogué (internación) y boedo, caba', label: 'Adrogué (Internación) y Boedo, CABA' },
  { value: 'almagro', label: 'Almagro' },
  { value: 'avellaneda', label: 'Avellaneda' },
  { value: 'bahía blanca', label: 'Bahía Blanca' },
  { value: 'balvanera', label: 'Balvanera' },
  { value: 'balvanera/constitución', label: 'Balvanera/Constitución' },
  { value: 'belgrano', label: 'Belgrano' },
  { value: 'belgrano, cdad. autónoma de buenos aires', label: 'Belgrano, Cdad. Autónoma de Buenos Aires' },
  { value: 'boedo', label: 'Boedo' },
  { value: 'caba', label: 'CABA' },
  { value: 'caballito', label: 'Caballito' },
  { value: 'caballito/ almagro', label: 'Caballito/ Almagro' },
  { value: 'colegiales', label: 'Colegiales' },
  { value: 'congreso y flores', label: 'Congreso y Flores' },
  { value: 'florencio varela', label: 'Florencio Varela' },
  { value: 'flores', label: 'Flores' },
  { value: 'flores / palermo', label: 'Flores / Palermo' },
  { value: 'flores, caba', label: 'Flores, CABA' },
  { value: 'florida', label: 'Florida' },
  { value: 'gerli, avellaneda', label: 'Gerli, Avellaneda' },
  { value: 'ing. pablo nogués', label: 'Ing. Pablo Nogués' },
  { value: 'isidro casanova, la matanza', label: 'Isidro Casanova, La Matanza' },
  { value: 'ituzaingó', label: 'Ituzaingó' },
  { value: 'la boca', label: 'La Boca' },
  { value: 'lanús este', label: 'Lanús Este' },
  { value: 'leandro n. alem', label: 'Leandro N. Alem' },
  { value: 'lomas de zamora, provincia de buenos aires', label: 'Lomas de Zamora, Provincia de Buenos Aires' },
  { value: 'mar del plata', label: 'Mar del Plata' },
  { value: 'mataderos', label: 'Mataderos' },
  { value: 'morón', label: 'Morón' },
  { value: 'nordelta (tigre) y puerto madero (caba)', label: 'Nordelta (Tigre) y Puerto Madero (CABA)' },
  { value: 'nuñez', label: 'Nuñez' },
  { value: 'olivos', label: 'Olivos' },
  { value: 'palermo', label: 'Palermo' },
  { value: 'palermo, caba (escuela martin buber)', label: 'Palermo, CABA (Escuela Martin Buber)' },
  { value: 'parque avellaneda', label: 'Parque Avellaneda' },
  { value: 'presidente derqui', label: 'Presidente Derqui' },
  { value: 'quilmes', label: 'Quilmes' },
  { value: 'quilmes, buenos aires', label: 'Quilmes, Buenos Aires' },
  { value: 'recoleta', label: 'Recoleta' },
  { value: 'san cristóbal', label: 'San Cristóbal' },
  { value: 'san fernando', label: 'San Fernando' },
  { value: 'san isidro', label: 'San Isidro' },
  { value: 'san miguel', label: 'San Miguel' },
  { value: 'san nicolás', label: 'San Nicolás' },
  { value: 'sarandí', label: 'Sarandí' },
  { value: 'tandil', label: 'Tandil' },
  { value: 'temperley', label: 'Temperley' },
  { value: 'tortuguitas', label: 'Tortuguitas' },
  { value: 'tribunales, caba', label: 'Tribunales, CABA' },
  { value: 'turdera, provincia de buenos aires', label: 'Turdera, Provincia de Buenos Aires' },
  { value: 'versalles', label: 'Versalles' },
  { value: 'villa celina, la matanza', label: 'Villa Celina, La Matanza' },
  { value: 'villa crespo', label: 'Villa Crespo' },
  { value: 'villa real', label: 'Villa Real' },
  { value: 'villa urquiza', label: 'Villa Urquiza' },
];

// Pathologies are medical terms - keep in Spanish as they are standardized
const getPathologyOptions = (): SelectOption[] => [
  { value: 'alzheimer / demencia', label: 'Alzheimer / Demencia' },
  { value: 'ansiedad por separación', label: 'Ansiedad por separación' },
  { value: 'autismo, retraso madurativo leve.', label: 'Autismo, Retraso Madurativo Leve' },
  { value: 'depresión', label: 'Depresión' },
  { value: 'discapacidad intelectual leve, trastorno del lenguaje expresivo.', label: 'Discapacidad Intelectual Leve, Trastorno del Lenguaje' },
  { value: 'esquizofrenia', label: 'Esquizofrenia' },
  { value: 'parkinson', label: 'Parkinson' },
  { value: 'tea (trastorno del espectro autista)', label: 'TEA (Trastorno del Espectro Autista)' },
  { value: 'trastorno disociativo, tlp, tca, estrés postraumático.', label: 'Trastorno Disociativo, TLP, TCA, Estrés Postraumático' },
  { value: 'trastorno del lenguaje', label: 'Trastorno del Lenguaje' },
];

const getSexOptions = (t: TFunction): SelectOption[] => [
  { value: 'femenino', label: t('jobs.sex.female') },
  { value: 'hombre', label: t('jobs.sex.male') },
  { value: 'indistinto', label: t('jobs.sex.indifferent') },
  { value: 'mujer', label: t('jobs.sex.woman') },
];
const MOCK_JOBS: Job[] = [
  {
    code: '736',
    title: '736 - Acompañante Terapéutico - Provincia de Buenos Aires - Lanús Este',
    workerType: 'acompañante terapéutico',
    provincia: 'provincia de buenos aires',
    localidad: 'lanús este',
    workerSex: 'indistinto',
    pathologies: 'trastorno disociativo, tlp, tca, estrés postraumático.',
    description: 'prestación de servicios para acompañamiento terapéutico domiciliario en lanús. paciente joven con trastorno disociativo de la personalidad y tlp. se requiere experiencia previa y manejo de herramientas clínicas para el abordaje de trauma y tca.',
    service: 'domiciliario',
    daysAndHours: 'Lunes a viernes de 09:00 a 15:00 hs.',
    ageRange: '25 a 40 años',
    profile: 'AT con experiencia en casos complejos de salud mental y trastornos de personalidad.',
    whatsappLink: 'https://wa.me/5491127227852?text=Hola!%20Estoy%20interesado%20en%20la%20posición%20de%20CASO%20736',
    detailLink: 'https://jobs.enlite.health/es/vagas/736/'
  },
  {
    code: '732',
    title: '732 - Acompañante Terapéutico - Provincia de Buenos Aires - Nordelta (Tigre) y Puerto Madero (CABA)',
    workerType: 'acompañante terapéutico',
    provincia: 'provincia de buenos aires',
    localidad: 'nordelta (tigre) y puerto madero (caba)',
    workerSex: 'mujer',
    pathologies: 'discapacidad intelectual leve, trastorno del lenguaje expresivo.',
    description: 'prestación de servicio de at para acompañar a una joven de 19 años durante sus traslados educativos. el objetivo es brindar soporte frente a su discapacidad intelectual leve y trastorno del lenguaje, promoviendo su seguridad y autonomía en la vía pública.',
    service: 'traslado',
    daysAndHours: 'Lunes y jueves de 11:00 a 14:00. (A partir de mayo se suma el viernes).',
    ageRange: '20 a 45 años (Sugerido)',
    profile: 'Profesional mujer con formación en AT y experiencia en discapacidad intelectual y comunicación.',
    whatsappLink: 'https://wa.me/5491127227852?text=Hola!%20Estoy%20interesado%20en%20la%20posición%20de%20CASO%20732',
    detailLink: 'https://jobs.enlite.health/es/vagas/732/'
  },
  {
    code: '735',
    title: '735 - Acompañante Terapéutico - Provincia de Buenos Aires - Lomas de Zamora',
    workerType: 'acompañante terapéutico',
    provincia: 'provincia de buenos aires',
    localidad: 'lomas de zamora',
    workerSex: 'indistinto',
    pathologies: 'trastorno del lenguaje',
    description: 'prestación de servicios de at para acompañamiento escolar de un niño con trastorno del lenguaje. el objetivo es brindar soporte pedagógico-vincular en lomas de zamora, integrándose a un equipo con supervisión clínica.',
    service: 'escolar',
    daysAndHours: 'Lunes, miércoles y viernes 8-12h; martes y jueves 10-14h.',
    ageRange: 'Adulto',
    profile: 'Profesional con experiencia en discapacidad infantil y entorno educativo.',
    whatsappLink: 'https://wa.me/5491127227852?text=Hola!%20Estoy%20interesado%20en%20la%20posición%20de%20CASO%20735',
    detailLink: 'https://jobs.enlite.health/es/vagas/735/'
  },
  {
    code: '734',
    title: '734 - Acompañante Terapéutico - CABA - Balvanera',
    workerType: 'acompañante terapéutico',
    provincia: 'caba',
    localidad: 'balvanera',
    workerSex: 'hombre',
    pathologies: 'tea (trastorno del espectro autista)',
    description: 'prestación de servicios para at masculino en domicilio. paciente adolescente con diagnóstico de tea. el foco está en el soporte post-internación y cumplimiento de objetivos terapéuticos.',
    service: 'domiciliario',
    daysAndHours: 'Lunes a sábados de 08:30 a 11:30.',
    ageRange: 'Adolescente (15 años)',
    profile: 'Profesional independiente masculino con experiencia en adolescentes.',
    whatsappLink: 'https://wa.me/5491127227852?text=Hola!%20Estoy%20interesado%20en%20la%20posición%20de%20CASO%20734',
    detailLink: 'https://jobs.enlite.health/es/vagas/734/'
  },
  {
    code: '733',
    title: '733 - Acompañante Terapéutico - Provincia de Buenos Aires - Quilmes',
    workerType: 'acompañante terapéutico',
    provincia: 'provincia de buenos aires',
    localidad: 'quilmes',
    workerSex: 'mujer',
    pathologies: 'ansiedad por separación',
    description: 'prestación de servicios para acompañamiento escolar de niña de 5 años con ansiedad por separación. se busca perfil con experiencia en integración escolar y manejo de vínculos en infancia.',
    service: 'escolar',
    daysAndHours: 'Lunes a viernes de 13:00 a 17:00.',
    ageRange: '20 a 30 años',
    profile: 'AT mujer con formación en discapacidad o integración escolar.',
    whatsappLink: 'https://wa.me/5491127227852?text=Hola!%20Estoy%20interesado%20en%20la%20posición%20de%20CASO%20733',
    detailLink: 'https://jobs.enlite.health/es/vagas/733/'
  }
];

// Flag para usar mock (true = modo teste local)
const USE_MOCK = false;

interface JobsResponse {
  success: boolean;
  data: Job[];
  count: number;
  cached?: boolean;
}

export const JobsEmbeddedSection = (): JSX.Element => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  
  // Get translated options
  const workerTypeOptions = useMemo(() => getWorkerTypeOptions(t), [t]);
  const provinceOptions = useMemo(() => getProvinceOptions(t), [t]);
  const localityOptions = useMemo(() => getLocalityOptions(), []);
  const pathologyOptions = useMemo(() => getPathologyOptions(), []);
  const sexOptions = useMemo(() => getSexOptions(t), [t]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Estado do modal de cadastro incompleto
  const [showIncompleteModal, setShowIncompleteModal] = useState(false);
  
  // Mock: verificar se cadastro está completo (deve vir do contexto/auth)
  const isRegistrationComplete = false; // TODO: Integrar com status real do worker

  // Handler para clique no WhatsApp
  const handleWhatsAppClick = (job: Job): void => {
    if (!isRegistrationComplete) {
      setShowIncompleteModal(true);
      return;
    }
    window.open(job.whatsappLink, '_blank');
  };

  // Handler para clique em Ver Detalhes
  const handleDetailsClick = (job: Job): void => {
    if (!isRegistrationComplete) {
      setShowIncompleteModal(true);
      return;
    }
    window.open(job.detailLink, '_blank');
  };

  // Handler para clique em Completar Cadastro - navega para tela de registro
  const handleCompleteRegistration = (): void => {
    navigate('/worker-registration');
  };

  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterProvince, setFilterProvince] = useState('');
  const [filterLocality, setFilterLocality] = useState('');
  const [filterPathology, setFilterPathology] = useState('');
  const [filterSex, setFilterSex] = useState('');

  // Vagas filtradas
  const filteredJobs = useMemo(() => {
    return jobs.filter(job => {
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch = !searchTerm || 
        job.title.toLowerCase().includes(searchLower) ||
        job.code.includes(searchTerm) ||
        job.pathologies.toLowerCase().includes(searchLower) ||
        job.workerType.toLowerCase().includes(searchLower) ||
        job.localidad.toLowerCase().includes(searchLower) ||
        job.provincia.toLowerCase().includes(searchLower);
      
      const matchesType = !filterType || job.workerType === filterType;
      const matchesProvince = !filterProvince || job.provincia === filterProvince;
      const matchesLocality = !filterLocality || job.localidad === filterLocality;
      const matchesPathology = !filterPathology || job.pathologies.toLowerCase().includes(filterPathology.toLowerCase());
      const matchesSex = !filterSex || job.workerSex === filterSex;

      return matchesSearch && matchesType && matchesProvince && matchesLocality && matchesPathology && matchesSex;
    });
  }, [jobs, searchTerm, filterType, filterProvince, filterLocality, filterPathology, filterSex]);

  // Buscar vagas da API ou usar mock
  useEffect(() => {
    const fetchJobs = async (): Promise<void> => {
      try {
        setIsLoading(true);

        // Usar mock em modo de desenvolvimento/teste
        if (USE_MOCK) {
          console.log('🧪 Usando mock de vagas para teste local');
          // Simular delay de rede
          await new Promise(resolve => setTimeout(resolve, 500));
          setJobs(MOCK_JOBS);
          setIsLoading(false);
          return;
        }

        const apiUrl = import.meta.env.VITE_API_WORKER_FUNCTIONS_URL || 'http://localhost:8081';
        const response = await fetch(`${apiUrl}/api/jobs`);
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data: JobsResponse = await response.json();
        
        if (data.success) {
          setJobs(data.data);
        } else {
          throw new Error('Failed to fetch jobs');
        }
      } catch (err) {
        console.error('Error fetching jobs:', err);
        setError(t('jobs.error', 'Error loading jobs'));
      } finally {
        setIsLoading(false);
      }
    };

    fetchJobs();
  }, [t]);

  const clearFilters = (): void => {
    setSearchTerm('');
    setFilterType('');
    setFilterProvince('');
    setFilterLocality('');
    setFilterPathology('');
    setFilterSex('');
  };

  const activeFiltersCount = [
    searchTerm, filterType, filterProvince, filterLocality, filterPathology, filterSex
  ].filter(Boolean).length;

  if (isLoading) {
    return (
      <div className="w-full bg-white rounded-xl shadow-sm p-8">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full bg-white rounded-xl shadow-sm p-8">
        <div className="text-center text-red-600">{error}</div>
      </div>
    );
  }

  return (
    <div id="jobs-section" className="w-full bg-white rounded-[20px] border border-[#d9d9d9] border-b-2 border-l-2 border-r-2 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="p-6">
        <h2 className="text-xl font-semibold text-[#180149] mb-4 font-lexend">
          {t('jobs.title', 'Consultar Vagas')}
        </h2>

        {/* Search */}
        <div className="mb-4">
          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder={t('jobs.searchPlaceholder', 'Buscar por código, tipo, local, diagnóstico...')}
          />
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-4">
          <SelectField
            value={filterType}
            onChange={setFilterType}
            options={workerTypeOptions}
            placeholder={t('jobs.filters.workerType', 'Tipos de Trabajador')}
            label={t('jobs.filters.workerType', 'Tipos de Trabajador')}
          />

          <SelectField
            value={filterProvince}
            onChange={setFilterProvince}
            options={provinceOptions}
            placeholder={t('jobs.filters.province', 'Provincia')}
            label={t('jobs.filters.province', 'Provincia')}
          />

          <SelectField
            value={filterLocality}
            onChange={setFilterLocality}
            options={localityOptions}
            placeholder={t('jobs.filters.locality', 'Localidad')}
            label={t('jobs.filters.locality', 'Localidad')}
          />

          <SelectField
            value={filterPathology}
            onChange={setFilterPathology}
            options={pathologyOptions}
            placeholder={t('jobs.filters.pathology', 'Patología/s')}
            label={t('jobs.filters.pathology', 'Patología/s')}
          />

          <SelectField
            value={filterSex}
            onChange={setFilterSex}
            options={sexOptions}
            placeholder={t('jobs.filters.sex', 'Sexo')}
            label={t('jobs.filters.sex', 'Sexo')}
          />
        </div>

        {/* Active Filters */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[14px] text-[#737373] font-lexend font-medium">
              {t('jobs.activeFilters', 'Filtros Ativos:')}
            </span>
            {activeFiltersCount > 0 && (
              <span className="px-2 py-1 bg-[#180149] text-white text-xs rounded-full font-lexend">
                {activeFiltersCount}
              </span>
            )}
            <span className="text-[14px] text-[#737373] font-lexend font-medium ml-2">
              {filteredJobs.length} {t('jobs.results', 'vagas')}
            </span>
          </div>
          <button
            onClick={clearFilters}
            disabled={activeFiltersCount === 0}
            className="px-6 py-2 rounded-full border border-[#d9d9d9] bg-white text-[#180149] font-lexend font-medium text-sm hover:border-[#180149] disabled:bg-white disabled:text-[#999] disabled:border-[#d9d9d9] disabled:cursor-not-allowed transition-colors"
            style={{ backgroundColor: activeFiltersCount === 0 ? 'white' : undefined }}
          >
            {t('jobs.clearFilters', 'Limpar Filtros')}
          </button>
        </div>
      </div>

      {/* Jobs List */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6 pb-6 space-y-3 max-h-[50vh] md:max-h-[600px]">
        {filteredJobs.length === 0 ? (
          <div className="text-center py-8 text-[#737373] font-lexend text-[14px] font-medium">
            {t('jobs.noResults', 'Nenhuma vaga encontrada')}
          </div>
        ) : (
          filteredJobs.map((job) => (
            <div
              key={job.code}
              className="border border-[#d9d9d9] rounded-[10px] p-4 hover:border-[#180149] transition-colors bg-white"
            >
              {/* Job Header */}
              <div className="flex items-start justify-between mb-3 gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="px-2 py-1 bg-[#180149] text-white text-xs rounded font-medium font-lexend">
                      {job.code}
                    </span>
                    <span className="text-xs text-[#737373] capitalize font-lexend font-medium">{job.workerType}</span>
                  </div>
                  <h3 className="font-semibold text-[#180149] text-sm font-lexend">
                    {job.provincia} - {job.localidad}
                  </h3>
                </div>
                <div className="flex flex-wrap gap-2 flex-shrink-0">
                  {job.whatsappLink && (
                    <button
                      onClick={() => handleWhatsAppClick(job)}
                      className="px-3 py-1.5 bg-[#25d366] text-white text-xs rounded hover:bg-[#128c7e] transition-colors font-lexend font-medium"
                    >
                      {t('jobs.apply', 'Postularse')}
                    </button>
                  )}
                  <button
                    onClick={() => handleDetailsClick(job)}
                    className="px-3 py-1.5 bg-[#180149] text-white text-xs rounded hover:bg-[#2a014d] transition-colors font-lexend font-medium"
                  >
                    {t('jobs.viewDetails', 'Ver Detalhes')}
                  </button>
                </div>
              </div>

              {/* Job Details */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-[#737373] mb-3 font-lexend font-medium">
                <div>
                  <span className="text-[#180149] font-semibold">{t('jobs.fields.sex', 'Sexo')}:</span> {job.workerSex}
                </div>
                <div>
                  <span className="text-[#180149] font-semibold">{t('jobs.fields.ageRange', 'Idade')}:</span> {job.ageRange}
                </div>
                <div>
                  <span className="text-[#180149] font-semibold">{t('jobs.fields.serviceType', 'Tipo')}:</span> {job.service}
                </div>
                <div>
                  <span className="text-[#180149] font-semibold">{t('jobs.fields.schedule', 'Horário')}:</span> {job.daysAndHours.substring(0, 30)}...
                </div>
              </div>

              {/* Pathologies */}
              <div className="text-xs text-[#737373] mb-2 font-lexend font-medium">
                <span className="text-[#180149] font-semibold">{t('jobs.fields.pathology', 'Patologias')}:</span>{' '}
                <span className="text-[#180149]">{job.pathologies}</span>
              </div>

              {/* Profile & Description */}
              <div className="text-xs text-[#737373] font-lexend font-medium">
                <p className="mb-1"><span className="text-[#180149] font-semibold">{t('jobs.fields.profile', 'Perfil')}:</span> {job.profile}</p>
                <p className="line-clamp-2">{job.description}</p>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal de Cadastro Incompleto */}
      {showIncompleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-[20px] p-8 max-w-md w-full mx-4">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-[#180149] font-lexend mb-2">
                {t('jobs.incompleteModal.title', 'Complete seu cadastro')}
              </h3>
              <p className="text-[#737373] font-lexend text-sm mb-4">
                {t('jobs.incompleteModal.description', 'Para se candidatar a esta vaga e ter acesso ao WhatsApp e detalhes completos, você precisa completar seu cadastro e fazer o upload dos documentos necessários.')}
              </p>
            </div>
            
            <div className="flex flex-col gap-3">
              <button
                onClick={handleCompleteRegistration}
                className="w-full px-6 py-3 bg-[#180149] text-white rounded-full font-lexend font-medium hover:bg-[#2a014d] transition-colors"
              >
                {t('jobs.incompleteModal.completeRegistration', 'Completar Cadastro')}
              </button>
              <button
                onClick={() => setShowIncompleteModal(false)}
                className="w-full px-6 py-3 border border-[#d9d9d9] text-[#737373] rounded-full font-lexend font-medium hover:border-[#180149] transition-colors"
              >
                {t('jobs.incompleteModal.cancel', 'Cancelar')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
