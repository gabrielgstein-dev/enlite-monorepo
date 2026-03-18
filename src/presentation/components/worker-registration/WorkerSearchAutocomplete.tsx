import { useState, useEffect, useRef } from 'react';

interface Worker {
  id: string;
  email: string;
  fullName: string;
  phone: string;
  cpf?: string;
  birthDate?: string;
}

interface WorkerSearchAutocompleteProps {
  onWorkerSelect: (worker: Worker | null) => void;
  selectedWorker: Worker | null;
  disabled?: boolean;
}

export function WorkerSearchAutocomplete({ 
  onWorkerSelect, 
  selectedWorker,
  disabled = false 
}: WorkerSearchAutocompleteProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedWorker) {
      setSearchTerm(selectedWorker.email);
    }
  }, [selectedWorker]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const searchWorkers = async () => {
      if (searchTerm.length < 3) {
        setWorkers([]);
        return;
      }

      setIsLoading(true);
      try {
        // TODO: Implementar chamada real à API
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Mock data
        const mockWorkers: Worker[] = [
          {
            id: '1',
            email: 'joao.silva@example.com',
            fullName: 'João Silva',
            phone: '(11) 98765-4321',
            cpf: '123.456.789-00',
            birthDate: '1990-05-15',
          },
          {
            id: '2',
            email: 'maria.santos@example.com',
            fullName: 'Maria Santos',
            phone: '(11) 91234-5678',
            cpf: '987.654.321-00',
            birthDate: '1985-08-20',
          },
        ].filter(w => 
          w.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
          w.fullName.toLowerCase().includes(searchTerm.toLowerCase())
        );

        setWorkers(mockWorkers);
      } catch (error) {
        console.error('Error searching workers:', error);
        setWorkers([]);
      } finally {
        setIsLoading(false);
      }
    };

    const debounceTimer = setTimeout(searchWorkers, 300);
    return () => clearTimeout(debounceTimer);
  }, [searchTerm]);

  const handleInputChange = (value: string) => {
    setSearchTerm(value);
    setIsOpen(true);
    if (!value) {
      onWorkerSelect(null);
    }
  };

  const handleWorkerSelect = (worker: Worker) => {
    setSearchTerm(worker.email);
    setIsOpen(false);
    onWorkerSelect(worker);
  };

  const handleClear = () => {
    setSearchTerm('');
    onWorkerSelect(null);
    setIsOpen(false);
  };

  return (
    <div ref={wrapperRef} className="relative w-full">
      <div className="flex flex-col gap-2">
        <label className="font-poppins text-lg font-semibold text-[#737373]">
          Buscar Worker por Email
        </label>
        
        <div className="relative">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => handleInputChange(e.target.value)}
            onFocus={() => searchTerm.length >= 3 && setIsOpen(true)}
            disabled={disabled}
            placeholder="Digite o email do worker..."
            className="w-full px-6 py-4 pr-12 rounded-[16px] border-2 border-[#D9D9D9] 
                     font-lexend text-base text-[#180149] placeholder:text-[#D9D9D9]
                     focus:border-[#180149] focus:outline-none transition-colors
                     disabled:bg-gray-100 disabled:cursor-not-allowed"
          />
          
          {searchTerm && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-[#737373] 
                       hover:text-[#180149] transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10 0C4.47 0 0 4.47 0 10C0 15.53 4.47 20 10 20C15.53 20 20 15.53 20 10C20 4.47 15.53 0 10 0ZM14.3 13.3C14.5 13.5 14.5 13.8 14.3 14C14.2 14.1 14.1 14.1 14 14.1C13.9 14.1 13.8 14.1 13.7 14L10 10.3L6.3 14C6.2 14.1 6.1 14.1 6 14.1C5.9 14.1 5.8 14.1 5.7 14C5.5 13.8 5.5 13.5 5.7 13.3L9.4 9.6L5.7 5.9C5.5 5.7 5.5 5.4 5.7 5.2C5.9 5 6.2 5 6.4 5.2L10.1 8.9L13.8 5.2C14 5 14.3 5 14.5 5.2C14.7 5.4 14.7 5.7 14.5 5.9L10.8 9.6L14.3 13.3Z"/>
              </svg>
            </button>
          )}
        </div>

        {isLoading && (
          <div className="text-sm text-[#737373] font-lexend">
            Buscando...
          </div>
        )}
      </div>

      {isOpen && workers.length > 0 && (
        <div className="absolute z-50 w-full mt-2 bg-white border-2 border-[#D9D9D9] 
                      rounded-[16px] shadow-lg max-h-[300px] overflow-y-auto">
          {workers.map((worker) => (
            <button
              key={worker.id}
              type="button"
              onClick={() => handleWorkerSelect(worker)}
              className="w-full px-6 py-4 text-left hover:bg-[#FFF9FC] transition-colors
                       border-b border-[#D9D9D9] last:border-b-0 flex flex-col gap-1"
            >
              <div className="font-poppins text-base font-semibold text-[#180149]">
                {worker.fullName}
              </div>
              <div className="font-lexend text-sm text-[#737373]">
                {worker.email}
              </div>
              {worker.phone && (
                <div className="font-lexend text-xs text-[#737373]">
                  {worker.phone}
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {isOpen && !isLoading && searchTerm.length >= 3 && workers.length === 0 && (
        <div className="absolute z-50 w-full mt-2 bg-white border-2 border-[#D9D9D9] 
                      rounded-[16px] shadow-lg px-6 py-4">
          <p className="font-lexend text-sm text-[#737373]">
            Nenhum worker encontrado com "{searchTerm}"
          </p>
        </div>
      )}
    </div>
  );
}
