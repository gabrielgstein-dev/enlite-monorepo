import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WorkerDocumentsCard } from '../WorkerDocumentsCard';
import type { WorkerDocument } from '@domain/entities/Worker';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const noopUpload = vi.fn().mockResolvedValue(undefined);
const noopDelete = vi.fn().mockResolvedValue(undefined);
const noopView = vi.fn().mockResolvedValue(undefined);
const defaultHandlers = {
  profession: null,
  onUpload: noopUpload,
  onDelete: noopDelete,
  onView: noopView,
  loadingTypes: new Set() as Set<any>,
  errors: {},
};

const fullDoc: WorkerDocument = {
  id: 'doc-1',
  resumeCvUrl: 'https://storage.example.com/cv.pdf',
  identityDocumentUrl: 'https://storage.example.com/id.pdf',
  identityDocumentBackUrl: null,
  criminalRecordUrl: 'https://storage.example.com/criminal.pdf',
  professionalRegistrationUrl: null,
  liabilityInsuranceUrl: null,
  monotributoCertificateUrl: null,
  atCertificateUrl: null,
  additionalCertificatesUrls: ['https://storage.example.com/cert1.pdf'],
  documentsStatus: 'approved',
  reviewNotes: 'Tudo verificado.',
  reviewedBy: 'admin-1',
  reviewedAt: '2026-03-15T00:00:00Z',
  submittedAt: '2026-03-10T00:00:00Z',
};

describe('WorkerDocumentsCard', () => {
  // ── i18n labels ────────────────────────────────────────────────────────────

  it('renders card title using i18n key admin.workerDetail.documents', () => {
    render(<WorkerDocumentsCard documents={fullDoc} {...defaultHandlers} />);
    expect(screen.getByText('admin.workerDetail.documents')).toBeInTheDocument();
  });

  it('renders title even when documents is null', () => {
    render(<WorkerDocumentsCard documents={null} {...defaultHandlers} />);
    expect(screen.getByText('admin.workerDetail.documents')).toBeInTheDocument();
  });

  it('renders document cards even when documents is null', () => {
    render(<WorkerDocumentsCard documents={null} {...defaultHandlers} />);
    expect(screen.getByText('admin.workerDetail.resume')).toBeInTheDocument();
    expect(screen.getByText('admin.workerDetail.identityDoc')).toBeInTheDocument();
  });

  it('renders document labels for all document types', () => {
    render(<WorkerDocumentsCard documents={fullDoc} {...defaultHandlers} />);
    expect(screen.getByText('admin.workerDetail.resume')).toBeInTheDocument();
    expect(screen.getByText('admin.workerDetail.identityDoc')).toBeInTheDocument();
    expect(screen.getByText('admin.workerDetail.criminalRecord')).toBeInTheDocument();
    expect(screen.getByText('admin.workerDetail.professionalReg')).toBeInTheDocument();
    expect(screen.getByText('admin.workerDetail.insurance')).toBeInTheDocument();
  });

  // ── Document card links ───────────────────────────────────────────────────

  it('renders view buttons for documents with URLs', () => {
    render(<WorkerDocumentsCard documents={fullDoc} {...defaultHandlers} />);
    // cv + id + criminal = 3 documents with URLs → 3 view buttons
    // (additionalCertificatesUrls moved to AdditionalDocumentsSection)
    const viewButtons = screen.getAllByLabelText('Visualizar documento');
    expect(viewButtons.length).toBe(3);
  });

  it('renders uploaded state for documents with URLs', () => {
    render(<WorkerDocumentsCard documents={fullDoc} {...defaultHandlers} />);
    const uploadedCards = screen.getAllByRole('generic').filter(
      el => el.getAttribute('data-state') === 'uploaded',
    );
    // resume, identity, criminal = 3 uploaded
    // (additionalCertificatesUrls moved to AdditionalDocumentsSection)
    expect(uploadedCards.length).toBe(3);
  });

  it('renders empty state for documents without URLs', () => {
    render(<WorkerDocumentsCard documents={fullDoc} {...defaultHandlers} />);
    const emptyCards = screen.getAllByRole('button').filter(
      el => el.getAttribute('data-state') === 'empty',
    );
    // professionalReg + insurance + identityDocumentBack = 3 empty (profession is null, so AT docs hidden)
    expect(emptyCards.length).toBe(3);
  });

  // ── Status badges ──────────────────────────────────────────────────────────

  it('renders status badge text', () => {
    render(<WorkerDocumentsCard documents={fullDoc} {...defaultHandlers} />);
    expect(screen.getByText('approved')).toBeInTheDocument();
  });

  it('applies turquoise badge for approved status', () => {
    render(<WorkerDocumentsCard documents={fullDoc} {...defaultHandlers} />);
    const badge = screen.getByText('approved');
    expect(badge.className).toContain('bg-turquoise/20');
    expect(badge.className).toContain('text-primary');
  });

  it('applies red badge for rejected status', () => {
    render(<WorkerDocumentsCard {...defaultHandlers} documents={{ ...fullDoc, documentsStatus: 'rejected' }} />);
    const badge = screen.getByText('rejected');
    expect(badge.className).toContain('bg-cancelled/20');
    expect(badge.className).toContain('text-red-700');
  });

  it('applies yellow badge for under_review status', () => {
    render(<WorkerDocumentsCard {...defaultHandlers} documents={{ ...fullDoc, documentsStatus: 'under_review' }} />);
    const badge = screen.getByText('under_review');
    expect(badge.className).toContain('bg-wait/20');
    expect(badge.className).toContain('text-yellow-700');
  });

  it('applies blue badge for submitted status', () => {
    render(<WorkerDocumentsCard {...defaultHandlers} documents={{ ...fullDoc, documentsStatus: 'submitted' }} />);
    const badge = screen.getByText('submitted');
    expect(badge.className).toContain('bg-blue-100');
    expect(badge.className).toContain('text-blue-700');
  });

  it('applies gray badge for pending status', () => {
    render(<WorkerDocumentsCard {...defaultHandlers} documents={{ ...fullDoc, documentsStatus: 'pending' }} />);
    const badge = screen.getByText('pending');
    expect(badge.className).toContain('bg-gray-300');
    expect(badge.className).toContain('text-gray-800');
  });

  it('applies gray badge for incomplete status', () => {
    render(<WorkerDocumentsCard {...defaultHandlers} documents={{ ...fullDoc, documentsStatus: 'incomplete' }} />);
    const badge = screen.getByText('incomplete');
    expect(badge.className).toContain('bg-gray-300');
    expect(badge.className).toContain('text-gray-800');
  });

  it('applies gray fallback for unknown status', () => {
    render(<WorkerDocumentsCard {...defaultHandlers} documents={{ ...fullDoc, documentsStatus: 'some_unknown' }} />);
    const badge = screen.getByText('some_unknown');
    expect(badge.className).toContain('bg-gray-300');
  });

  // ── Review notes ───────────────────────────────────────────────────────────

  it('renders review notes text when present', () => {
    render(<WorkerDocumentsCard documents={fullDoc} {...defaultHandlers} />);
    expect(screen.getByText('Tudo verificado.')).toBeInTheDocument();
  });

  it('hides review notes section when reviewNotes is null', () => {
    render(<WorkerDocumentsCard {...defaultHandlers} documents={{ ...fullDoc, reviewNotes: null }} />);
    expect(screen.queryByText('admin.workerDetail.reviewNotes')).not.toBeInTheDocument();
  });

  // Note: additional certificates are now handled by AdditionalDocumentsSection component
  // and stored in worker_additional_documents table, not in the deprecated TEXT[] array
});
