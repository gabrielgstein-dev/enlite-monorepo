import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GeminiParseStep } from '../GeminiParseStep';

// ── Mock AdminApiService ────────────────────────────────────────
const mockParseFromText = vi.fn();
const mockParseVacancyFull = vi.fn();

vi.mock('@infrastructure/http/AdminApiService', () => ({
  AdminApiService: {
    parseVacancyFromText: (...args: any[]) => mockParseFromText(...args),
    parseVacancyFull: (...args: any[]) => mockParseVacancyFull(...args),
  },
}));

// ── Mock i18n ───────────────────────────────────────────────────
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'admin.createVacancy.geminiStep.title': 'Datos del Caso',
        'admin.createVacancy.geminiStep.description': 'Pega la info...',
        'admin.createVacancy.geminiStep.workerTypeLabel': 'Tipo de Profesional',
        'admin.createVacancy.geminiStep.workerType_AT': 'AT',
        'admin.createVacancy.geminiStep.workerType_CUIDADOR': 'Cuidador/a',
        'admin.createVacancy.geminiStep.inputModeText': 'Pegar texto',
        'admin.createVacancy.geminiStep.inputModePdf': 'Subir PDF',
        'admin.createVacancy.geminiStep.textLabel': 'Información del caso',
        'admin.createVacancy.geminiStep.textPlaceholder': 'Pega acá...',
        'admin.createVacancy.geminiStep.pdfLabel': 'Archivo PDF del caso',
        'admin.createVacancy.geminiStep.pdfPlaceholder': 'Hacé clic o arrastrá un PDF acá',
        'admin.createVacancy.geminiStep.pdfSizeError': 'El archivo supera el límite de 20 MB',
        'admin.createVacancy.geminiStep.pdfTypeError': 'Solo se aceptan archivos PDF',
        'admin.createVacancy.geminiStep.parseButton': 'Analizar con IA',
        'admin.createVacancy.geminiStep.parsing': 'Analizando...',
        'admin.createVacancy.geminiStep.skipButton': 'Completar manualmente',
        'admin.createVacancy.cancel': 'Cancelar',
      };
      return map[key] ?? key;
    },
  }),
}));

// ── Fixtures ─────────────────────────────────────────────────────

/** Legacy shape returned by parseVacancyFromText */
const LEGACY_VACANCY = {
  vacancy: { case_number: 42, title: 'CASO 42' },
  prescreening: { questions: [], faq: [] },
  description: { titulo_propuesta: '', descripcion_propuesta: '', perfil_profesional: '' },
};

/** Full shape returned by parseVacancyFull (PDF mode) */
const FULL_RESULT = {
  parsed: LEGACY_VACANCY,
  addressMatches: [
    { patient_address_id: 'addr-1', addressFormatted: 'Av. Corrientes 1234', confidence: 1, matchType: 'EXACT' as const },
  ],
  fieldClashes: [],
  patientId: 'pat-42',
};

/** Expected onParsed shape for text mode */
const TEXT_PARSED_RESULT = {
  parsed: LEGACY_VACANCY,
  addressMatches: [],
  fieldClashes: [],
  patientId: null,
};

function renderStep(overrides: Partial<React.ComponentProps<typeof GeminiParseStep>> = {}) {
  const props = {
    onParsed: vi.fn(),
    onSkip: vi.fn(),
    onCancel: vi.fn(),
    isParsing: false,
    setIsParsing: vi.fn(),
    ...overrides,
  };
  const result = render(<GeminiParseStep {...props} />);
  return { ...result, props };
}

function createFile(name: string, sizeMB: number, type = 'application/pdf'): File {
  const bytes = new Uint8Array(sizeMB * 1024 * 1024);
  return new File([bytes], name, { type });
}

// ── Tests ────────────────────────────────────────────────────────

describe('GeminiParseStep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Rendering ─────────────────────────────────────────────────

  describe('rendering', () => {
    it('renders title and description', () => {
      renderStep();
      expect(screen.getByText('Datos del Caso')).toBeInTheDocument();
      expect(screen.getByText('Pega la info...')).toBeInTheDocument();
    });

    it('renders worker type buttons', () => {
      renderStep();
      expect(screen.getByText('AT')).toBeInTheDocument();
      expect(screen.getByText('Cuidador/a')).toBeInTheDocument();
    });

    it('renders input mode tabs', () => {
      renderStep();
      expect(screen.getByText('Pegar texto')).toBeInTheDocument();
      expect(screen.getByText('Subir PDF')).toBeInTheDocument();
    });

    it('renders text mode by default', () => {
      renderStep();
      expect(screen.getByPlaceholderText('Pega acá...')).toBeInTheDocument();
    });

    it('renders action buttons', () => {
      renderStep();
      expect(screen.getByText('Analizar con IA')).toBeInTheDocument();
      expect(screen.getByText('Completar manualmente')).toBeInTheDocument();
    });
  });

  // ── Tab switching ─────────────────────────────────────────────

  describe('tab switching', () => {
    it('switches to PDF mode when PDF tab clicked', async () => {
      renderStep();
      await userEvent.click(screen.getByText('Subir PDF'));
      expect(screen.getByText('Archivo PDF del caso')).toBeInTheDocument();
      expect(screen.getByText('Hacé clic o arrastrá un PDF acá')).toBeInTheDocument();
    });

    it('switches back to text mode', async () => {
      renderStep();
      await userEvent.click(screen.getByText('Subir PDF'));
      await userEvent.click(screen.getByText('Pegar texto'));
      expect(screen.getByPlaceholderText('Pega acá...')).toBeInTheDocument();
    });

    it('preserves text when switching to PDF and back', async () => {
      renderStep();
      const textarea = screen.getByPlaceholderText('Pega acá...');
      await userEvent.type(textarea, 'mi caso');
      await userEvent.click(screen.getByText('Subir PDF'));
      await userEvent.click(screen.getByText('Pegar texto'));
      expect(screen.getByPlaceholderText('Pega acá...')).toHaveValue('mi caso');
    });
  });

  // ── Worker type ───────────────────────────────────────────────

  describe('worker type selector', () => {
    it('AT is selected by default', () => {
      renderStep();
      const atBtn = screen.getByText('AT');
      expect(atBtn.className).toContain('border-primary');
    });

    it('selects CUIDADOR when clicked', async () => {
      renderStep();
      await userEvent.click(screen.getByText('Cuidador/a'));
      const cuidadorBtn = screen.getByText('Cuidador/a');
      expect(cuidadorBtn.className).toContain('border-primary');
    });
  });

  // ── Parse button state ────────────────────────────────────────

  describe('parse button state', () => {
    it('is disabled when text is empty (text mode)', () => {
      renderStep();
      const btn = screen.getByText('Analizar con IA').closest('button')!;
      expect(btn).toBeDisabled();
    });

    it('is enabled when text is provided', async () => {
      renderStep();
      await userEvent.type(screen.getByPlaceholderText('Pega acá...'), 'caso');
      const btn = screen.getByText('Analizar con IA').closest('button')!;
      expect(btn).not.toBeDisabled();
    });

    it('is disabled when no PDF file selected (PDF mode)', async () => {
      renderStep();
      await userEvent.click(screen.getByText('Subir PDF'));
      const btn = screen.getByText('Analizar con IA').closest('button')!;
      expect(btn).toBeDisabled();
    });

    it('shows spinner when isParsing=true', () => {
      renderStep({ isParsing: true });
      expect(screen.getByText('Analizando...')).toBeInTheDocument();
    });
  });

  // ── Text mode parsing ────────────────────────────────────────
  // Text mode: calls parseVacancyFromText and wraps result in { parsed, addressMatches: [], fieldClashes: [], patientId: null }

  describe('text mode parsing', () => {
    it('calls parseVacancyFromText and wraps result with empty matches/clashes', async () => {
      mockParseFromText.mockResolvedValueOnce(LEGACY_VACANCY);
      const { props } = renderStep();

      await userEvent.type(screen.getByPlaceholderText('Pega acá...'), 'caso TEA');
      await userEvent.click(screen.getByText('Analizar con IA'));

      await waitFor(() => {
        expect(mockParseFromText).toHaveBeenCalledWith({ text: 'caso TEA', workerType: 'AT' });
      });
      expect(props.onParsed).toHaveBeenCalledWith(TEXT_PARSED_RESULT);
    });

    it('calls setIsParsing(true) then setIsParsing(false)', async () => {
      mockParseFromText.mockResolvedValueOnce(LEGACY_VACANCY);
      const { props } = renderStep();

      await userEvent.type(screen.getByPlaceholderText('Pega acá...'), 'caso');
      await userEvent.click(screen.getByText('Analizar con IA'));

      await waitFor(() => {
        expect(props.setIsParsing).toHaveBeenCalledWith(true);
      });
      await waitFor(() => {
        expect(props.setIsParsing).toHaveBeenCalledWith(false);
      });
    });

    it('displays error message when parsing fails', async () => {
      mockParseFromText.mockRejectedValueOnce(new Error('Gemini API error'));
      renderStep();

      await userEvent.type(screen.getByPlaceholderText('Pega acá...'), 'caso');
      await userEvent.click(screen.getByText('Analizar con IA'));

      await waitFor(() => {
        expect(screen.getByText('Gemini API error')).toBeInTheDocument();
      });
    });

    it('uses selected workerType CUIDADOR', async () => {
      mockParseFromText.mockResolvedValueOnce(LEGACY_VACANCY);
      renderStep();

      await userEvent.click(screen.getByText('Cuidador/a'));
      await userEvent.type(screen.getByPlaceholderText('Pega acá...'), 'caso');
      await userEvent.click(screen.getByText('Analizar con IA'));

      await waitFor(() => {
        expect(mockParseFromText).toHaveBeenCalledWith({ text: 'caso', workerType: 'CUIDADOR' });
      });
    });
  });

  // ── PDF mode ──────────────────────────────────────────────────
  // PDF mode: calls parseVacancyFull and passes full result to onParsed

  describe('PDF mode', () => {
    it('shows file info after selecting a valid PDF', async () => {
      renderStep();
      await userEvent.click(screen.getByText('Subir PDF'));

      const file = createFile('case.pdf', 1);
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      await userEvent.upload(input, file);

      expect(screen.getByText('case.pdf')).toBeInTheDocument();
    });

    it('enables parse button after selecting a PDF', async () => {
      renderStep();
      await userEvent.click(screen.getByText('Subir PDF'));

      const file = createFile('case.pdf', 1);
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      await userEvent.upload(input, file);

      const btn = screen.getByText('Analizar con IA').closest('button')!;
      expect(btn).not.toBeDisabled();
    });

    it('shows size error for file > 20 MB', async () => {
      renderStep();
      await userEvent.click(screen.getByText('Subir PDF'));

      const file = createFile('big.pdf', 21);
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      await userEvent.upload(input, file);

      expect(screen.getByText('El archivo supera el límite de 20 MB')).toBeInTheDocument();
      const btn = screen.getByText('Analizar con IA').closest('button')!;
      expect(btn).toBeDisabled();
    });

    it('shows type error for non-PDF file', async () => {
      renderStep();
      await userEvent.click(screen.getByText('Subir PDF'));

      const file = new File(['data'], 'report.docx', { type: 'application/vnd.openxmlformats' });
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      fireEvent.change(input, { target: { files: [file] } });

      expect(screen.getByText('Solo se aceptan archivos PDF')).toBeInTheDocument();
    });

    it('clears file when X button clicked', async () => {
      renderStep();
      await userEvent.click(screen.getByText('Subir PDF'));

      const file = createFile('case.pdf', 1);
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      await userEvent.upload(input, file);

      expect(screen.getByText('case.pdf')).toBeInTheDocument();

      const clearBtns = screen.getAllByRole('button');
      const clearBtn = clearBtns.find(b => b.querySelector('svg.lucide-x'));
      expect(clearBtn).toBeDefined();
      await userEvent.click(clearBtn!);

      expect(screen.queryByText('case.pdf')).not.toBeInTheDocument();
      expect(screen.getByText('Hacé clic o arrastrá un PDF acá')).toBeInTheDocument();
    });

    it('calls parseVacancyFull with file and workerType and passes full result to onParsed', async () => {
      mockParseVacancyFull.mockResolvedValueOnce(FULL_RESULT);
      const { props } = renderStep();

      await userEvent.click(screen.getByText('Subir PDF'));
      const file = createFile('case.pdf', 1);
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      await userEvent.upload(input, file);
      await userEvent.click(screen.getByText('Analizar con IA'));

      await waitFor(() => {
        expect(mockParseVacancyFull).toHaveBeenCalledWith(file, 'AT');
      });
      expect(props.onParsed).toHaveBeenCalledWith(FULL_RESULT);
    });

    it('displays error when PDF parsing fails', async () => {
      mockParseVacancyFull.mockRejectedValueOnce(new Error('PDF too complex'));
      renderStep();

      await userEvent.click(screen.getByText('Subir PDF'));
      const file = createFile('case.pdf', 1);
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      await userEvent.upload(input, file);
      await userEvent.click(screen.getByText('Analizar con IA'));

      await waitFor(() => {
        expect(screen.getByText('PDF too complex')).toBeInTheDocument();
      });
    });

    it('accepts file with .pdf extension even without PDF mime type', async () => {
      renderStep();
      await userEvent.click(screen.getByText('Subir PDF'));

      const file = new File(['data'], 'report.pdf', { type: 'application/octet-stream' });
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      await userEvent.upload(input, file);

      expect(screen.getByText('report.pdf')).toBeInTheDocument();
    });
  });

  // ── Drag and drop ─────────────────────────────────────────────

  describe('drag and drop', () => {
    it('accepts PDF via drop event', async () => {
      renderStep();
      await userEvent.click(screen.getByText('Subir PDF'));

      const file = createFile('dropped.pdf', 1);
      const dropZone = screen.getByText('Hacé clic o arrastrá un PDF acá').closest('button')!;

      fireEvent.drop(dropZone, {
        dataTransfer: { files: [file] },
      });

      expect(screen.getByText('dropped.pdf')).toBeInTheDocument();
    });

    it('rejects non-PDF via drop event', async () => {
      renderStep();
      await userEvent.click(screen.getByText('Subir PDF'));

      const file = new File(['data'], 'doc.docx', { type: 'application/msword' });
      const dropZone = screen.getByText('Hacé clic o arrastrá un PDF acá').closest('button')!;

      fireEvent.drop(dropZone, {
        dataTransfer: { files: [file] },
      });

      expect(screen.getByText('Solo se aceptan archivos PDF')).toBeInTheDocument();
    });
  });

  // ── Skip and Cancel ───────────────────────────────────────────

  describe('skip and cancel', () => {
    it('calls onSkip when skip button clicked', async () => {
      const { props } = renderStep();
      await userEvent.click(screen.getByText('Completar manualmente'));
      expect(props.onSkip).toHaveBeenCalled();
    });

    it('calls onCancel when cancel button clicked', async () => {
      const { props } = renderStep();
      await userEvent.click(screen.getByText('Cancelar'));
      expect(props.onCancel).toHaveBeenCalled();
    });

    it('disables skip and cancel when isParsing', () => {
      renderStep({ isParsing: true });
      const skipBtn = screen.getByText('Completar manualmente').closest('button')!;
      const cancelBtn = screen.getByText('Cancelar').closest('button')!;
      expect(skipBtn).toBeDisabled();
      expect(cancelBtn).toBeDisabled();
    });
  });

  // ── Error handling ────────────────────────────────────────────

  describe('error handling', () => {
    it('handles non-Error thrown values', async () => {
      mockParseFromText.mockRejectedValueOnce('string error');
      renderStep();

      await userEvent.type(screen.getByPlaceholderText('Pega acá...'), 'caso');
      await userEvent.click(screen.getByText('Analizar con IA'));

      await waitFor(() => {
        expect(screen.getByText('string error')).toBeInTheDocument();
      });
    });

    it('clears previous error on new parse attempt', async () => {
      mockParseFromText.mockRejectedValueOnce(new Error('first error'));
      renderStep();

      await userEvent.type(screen.getByPlaceholderText('Pega acá...'), 'caso');
      await userEvent.click(screen.getByText('Analizar con IA'));
      await waitFor(() => {
        expect(screen.getByText('first error')).toBeInTheDocument();
      });

      mockParseFromText.mockResolvedValueOnce(LEGACY_VACANCY);
      await userEvent.click(screen.getByText('Analizar con IA'));
      await waitFor(() => {
        expect(screen.queryByText('first error')).not.toBeInTheDocument();
      });
    });
  });
});
