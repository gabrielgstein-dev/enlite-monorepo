import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Typography } from '@presentation/components/atoms';
import { FirebaseAuthService } from '@infrastructure/services/FirebaseAuthService';

interface UploadZone {
  key: string;
  labelKey: string;
  defaultLabel: string;
  descKey: string;
  defaultDesc: string;
  type: string;
}

const UPLOAD_ZONES: UploadZone[] = [
  {
    key: 'ana_care_control',
    labelKey: 'admin.uploads.anaCare',
    defaultLabel: 'Ana Care Control',
    descKey: 'admin.uploads.anaCareDesc',
    defaultDesc: 'Planilla de control de Ana Care (.xlsx)',
    type: 'ana_care_control',
  },
  {
    key: 'candidatos',
    labelKey: 'admin.uploads.candidatos',
    defaultLabel: 'Candidatos',
    descKey: 'admin.uploads.candidatosDesc',
    defaultDesc: 'Planilla de candidatos (.xlsx)',
    type: 'candidatos',
  },
  {
    key: 'planilla_operativa',
    labelKey: 'admin.uploads.planilla',
    defaultLabel: 'Planilla Operativa',
    descKey: 'admin.uploads.planillaDesc',
    defaultDesc: 'Planilla operativa de encuadres (.xlsx)',
    type: 'planilla_operativa',
  },
];

interface UploadStatus {
  state: 'idle' | 'uploading' | 'processing' | 'done' | 'error';
  message?: string;
  jobId?: string;
  progress?: { inserted: number; updated: number; errors: number };
}

export function AdminUploadsPage() {
  const { t } = useTranslation();
  const authService = new FirebaseAuthService();
  const baseURL = (import.meta as any).env?.VITE_API_WORKER_FUNCTIONS_URL || 'http://localhost:8080';

  const [statuses, setStatuses] = useState<Record<string, UploadStatus>>(
    Object.fromEntries(UPLOAD_ZONES.map(z => [z.key, { state: 'idle' }]))
  );

  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const updateStatus = (key: string, status: Partial<UploadStatus>) => {
    setStatuses(prev => ({ ...prev, [key]: { ...prev[key], ...status } }));
  };

  const handleUpload = async (zone: UploadZone, file: File) => {
    updateStatus(zone.key, { state: 'uploading', message: undefined });

    try {
      const token = await authService.getIdToken();
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', zone.type);

      const response = await fetch(`${baseURL}/api/import/upload`, {
        method: 'POST',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: formData,
      });

      const json = await response.json();
      if (!json.success) throw new Error(json.error || 'Upload failed');

      const jobId = json.data?.jobId;
      updateStatus(zone.key, { state: 'processing', jobId });

      // Poll status
      if (jobId) {
        pollStatus(zone.key, jobId, token);
      } else {
        updateStatus(zone.key, {
          state: 'done',
          progress: json.data,
          message: t('admin.uploads.success', 'Procesado exitosamente'),
        });
      }
    } catch (err) {
      updateStatus(zone.key, {
        state: 'error',
        message: err instanceof Error ? err.message : 'Error',
      });
    }
  };

  const pollStatus = async (key: string, jobId: string, token: string | null) => {
    const maxAttempts = 30;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, 2000));
      try {
        const res = await fetch(`${baseURL}/api/import/status/${jobId}`, {
          headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        });
        const json = await res.json();
        if (json.data?.status === 'done') {
          updateStatus(key, { state: 'done', progress: json.data, message: t('admin.uploads.success', 'Procesado') });
          return;
        }
        if (json.data?.status === 'error') {
          updateStatus(key, { state: 'error', message: json.data.error || 'Processing error' });
          return;
        }
      } catch {
        // continue polling
      }
    }
    updateStatus(key, { state: 'error', message: 'Timeout waiting for processing' });
  };

  const onFileChange = (zone: UploadZone, files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file.name.match(/\.xlsx?$/i)) {
      updateStatus(zone.key, { state: 'error', message: t('admin.uploads.invalidFormat', 'Solo archivos .xlsx') });
      return;
    }
    handleUpload(zone, file);
  };

  return (
    <div className="space-y-6">
      <Typography variant="h1" weight="semibold" color="primary">
        {t('admin.uploads.title', 'Importar Archivos')}
      </Typography>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {UPLOAD_ZONES.map((zone) => {
          const status = statuses[zone.key];
          return (
            <div
              key={zone.key}
              className="bg-white rounded-xl shadow-sm border-2 border-dashed border-gray-200 hover:border-primary/40 transition-colors p-6 flex flex-col items-center text-center"
            >
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>

              <Typography variant="h3" weight="semibold" color="primary" className="mb-1">
                {t(zone.labelKey, zone.defaultLabel)}
              </Typography>
              <p className="text-xs text-gray-500 mb-4">
                {t(zone.descKey, zone.defaultDesc)}
              </p>

              <input
                ref={(el) => { fileRefs.current[zone.key] = el; }}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => onFileChange(zone, e.target.files)}
              />

              {status.state === 'idle' && (
                <button
                  className="px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary/90 transition-colors"
                  onClick={() => fileRefs.current[zone.key]?.click()}
                >
                  {t('admin.uploads.selectFile', 'Seleccionar archivo')}
                </button>
              )}

              {status.state === 'uploading' && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
                  {t('admin.uploads.uploading', 'Subiendo...')}
                </div>
              )}

              {status.state === 'processing' && (
                <div className="flex items-center gap-2 text-sm text-blue-600">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
                  {t('admin.uploads.processing', 'Procesando...')}
                </div>
              )}

              {status.state === 'done' && (
                <div className="text-sm text-green-600 space-y-1">
                  <p>{status.message}</p>
                  {status.progress && (
                    <p className="text-xs text-gray-500">
                      {JSON.stringify(status.progress)}
                    </p>
                  )}
                  <button
                    className="text-xs text-primary underline mt-2"
                    onClick={() => {
                      updateStatus(zone.key, { state: 'idle', message: undefined, progress: undefined });
                      fileRefs.current[zone.key]?.click();
                    }}
                  >
                    {t('admin.uploads.uploadAnother', 'Subir otro')}
                  </button>
                </div>
              )}

              {status.state === 'error' && (
                <div className="text-sm text-red-600 space-y-1">
                  <p>{status.message}</p>
                  <button
                    className="text-xs text-primary underline mt-2"
                    onClick={() => {
                      updateStatus(zone.key, { state: 'idle', message: undefined });
                      fileRefs.current[zone.key]?.click();
                    }}
                  >
                    {t('admin.uploads.retry', 'Intentar de nuevo')}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
