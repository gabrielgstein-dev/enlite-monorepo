import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WorkerDocumentsCard } from '../WorkerDocumentsCard';
import type { WorkerDocument } from '@domain/entities/Worker';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const fullDoc: WorkerDocument = {
  id: 'doc-1',
  resumeCvUrl: 'https://storage.example.com/cv.pdf',
  identityDocumentUrl: 'https://storage.example.com/id.pdf',
  criminalRecordUrl: 'https://storage.example.com/criminal.pdf',
  professionalRegistrationUrl: null,
  liabilityInsuranceUrl: null,
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
    render(<WorkerDocumentsCard documents={fullDoc} />);
    expect(screen.getByText('admin.workerDetail.documents')).toBeInTheDocument();
  });

  it('renders title even when documents is null', () => {
    render(<WorkerDocumentsCard documents={null} />);
    expect(screen.getByText('admin.workerDetail.documents')).toBeInTheDocument();
  });

  it('renders noDocuments message using i18n key admin.workerDetail.noDocuments', () => {
    render(<WorkerDocumentsCard documents={null} />);
    expect(screen.getByText('admin.workerDetail.noDocuments')).toBeInTheDocument();
  });

  it('renders docType table header using i18n key admin.workerDetail.docType', () => {
    render(<WorkerDocumentsCard documents={fullDoc} />);
    expect(screen.getByText('admin.workerDetail.docType')).toBeInTheDocument();
  });

  it('renders docLink table header using i18n key admin.workerDetail.docLink', () => {
    render(<WorkerDocumentsCard documents={fullDoc} />);
    expect(screen.getByText('admin.workerDetail.docLink')).toBeInTheDocument();
  });

  it('renders resume row label using i18n key admin.workerDetail.resume', () => {
    render(<WorkerDocumentsCard documents={fullDoc} />);
    expect(screen.getByText('admin.workerDetail.resume')).toBeInTheDocument();
  });

  it('renders identityDoc row label using i18n key admin.workerDetail.identityDoc', () => {
    render(<WorkerDocumentsCard documents={fullDoc} />);
    expect(screen.getByText('admin.workerDetail.identityDoc')).toBeInTheDocument();
  });

  it('renders criminalRecord row label using i18n key admin.workerDetail.criminalRecord', () => {
    render(<WorkerDocumentsCard documents={fullDoc} />);
    expect(screen.getByText('admin.workerDetail.criminalRecord')).toBeInTheDocument();
  });

  it('renders professionalReg row label using i18n key admin.workerDetail.professionalReg', () => {
    render(<WorkerDocumentsCard documents={fullDoc} />);
    expect(screen.getByText('admin.workerDetail.professionalReg')).toBeInTheDocument();
  });

  it('renders insurance row label using i18n key admin.workerDetail.insurance', () => {
    render(<WorkerDocumentsCard documents={fullDoc} />);
    expect(screen.getByText('admin.workerDetail.insurance')).toBeInTheDocument();
  });

  it('renders reviewNotes label using i18n key admin.workerDetail.reviewNotes', () => {
    render(<WorkerDocumentsCard documents={fullDoc} />);
    expect(screen.getByText('admin.workerDetail.reviewNotes')).toBeInTheDocument();
  });

  // ── Document links ─────────────────────────────────────────────────────────

  it('renders viewDoc links for documents with URLs', () => {
    render(<WorkerDocumentsCard documents={fullDoc} />);
    const viewLinks = screen.getAllByText('admin.workerDetail.viewDoc');
    // cv + id + criminal + cert1 = 4 links
    expect(viewLinks.length).toBe(4);
  });

  it('renders dash for documents without URLs', () => {
    render(<WorkerDocumentsCard documents={fullDoc} />);
    // professionalRegistrationUrl and liabilityInsuranceUrl are null
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBe(2);
  });

  it('renders view links as external anchors with target=_blank', () => {
    render(<WorkerDocumentsCard documents={fullDoc} />);
    const viewLinks = screen.getAllByText('admin.workerDetail.viewDoc');
    viewLinks.forEach((link) => {
      const anchor = link.closest('a');
      expect(anchor).toHaveAttribute('target', '_blank');
      expect(anchor).toHaveAttribute('rel', 'noopener noreferrer');
    });
  });

  // ── Status badges ──────────────────────────────────────────────────────────

  it('renders status badge text', () => {
    render(<WorkerDocumentsCard documents={fullDoc} />);
    expect(screen.getByText('approved')).toBeInTheDocument();
  });

  it('applies green badge for approved status', () => {
    render(<WorkerDocumentsCard documents={fullDoc} />);
    const badge = screen.getByText('approved');
    expect(badge.className).toContain('bg-green-100');
    expect(badge.className).toContain('text-green-700');
  });

  it('applies red badge for rejected status', () => {
    render(<WorkerDocumentsCard documents={{ ...fullDoc, documentsStatus: 'rejected' }} />);
    const badge = screen.getByText('rejected');
    expect(badge.className).toContain('bg-red-100');
    expect(badge.className).toContain('text-red-700');
  });

  it('applies yellow badge for under_review status', () => {
    render(<WorkerDocumentsCard documents={{ ...fullDoc, documentsStatus: 'under_review' }} />);
    const badge = screen.getByText('under_review');
    expect(badge.className).toContain('bg-yellow-100');
    expect(badge.className).toContain('text-yellow-700');
  });

  it('applies blue badge for submitted status', () => {
    render(<WorkerDocumentsCard documents={{ ...fullDoc, documentsStatus: 'submitted' }} />);
    const badge = screen.getByText('submitted');
    expect(badge.className).toContain('bg-blue-100');
    expect(badge.className).toContain('text-blue-700');
  });

  it('applies gray badge for pending status', () => {
    render(<WorkerDocumentsCard documents={{ ...fullDoc, documentsStatus: 'pending' }} />);
    const badge = screen.getByText('pending');
    expect(badge.className).toContain('bg-gray-100');
    expect(badge.className).toContain('text-gray-600');
  });

  it('applies gray badge for incomplete status', () => {
    render(<WorkerDocumentsCard documents={{ ...fullDoc, documentsStatus: 'incomplete' }} />);
    const badge = screen.getByText('incomplete');
    expect(badge.className).toContain('bg-gray-100');
    expect(badge.className).toContain('text-gray-600');
  });

  it('applies gray fallback for unknown status', () => {
    render(<WorkerDocumentsCard documents={{ ...fullDoc, documentsStatus: 'some_unknown' }} />);
    const badge = screen.getByText('some_unknown');
    expect(badge.className).toContain('bg-gray-100');
  });

  // ── Review notes ───────────────────────────────────────────────────────────

  it('renders review notes text when present', () => {
    render(<WorkerDocumentsCard documents={fullDoc} />);
    expect(screen.getByText('Tudo verificado.')).toBeInTheDocument();
  });

  it('hides review notes section when reviewNotes is null', () => {
    render(<WorkerDocumentsCard documents={{ ...fullDoc, reviewNotes: null }} />);
    expect(screen.queryByText('admin.workerDetail.reviewNotes')).not.toBeInTheDocument();
  });

  // ── Additional certificates ────────────────────────────────────────────────

  it('renders additional certificates with numbered labels', () => {
    const docWithCerts: WorkerDocument = {
      ...fullDoc,
      additionalCertificatesUrls: ['https://a.com/1.pdf', 'https://a.com/2.pdf'],
    };
    render(<WorkerDocumentsCard documents={docWithCerts} />);
    expect(screen.getByText('admin.workerDetail.certificate 1')).toBeInTheDocument();
    expect(screen.getByText('admin.workerDetail.certificate 2')).toBeInTheDocument();
  });

  it('renders no certificate rows when additionalCertificatesUrls is empty', () => {
    render(<WorkerDocumentsCard documents={{ ...fullDoc, additionalCertificatesUrls: [] }} />);
    expect(screen.queryByText(/admin\.workerDetail\.certificate \d/)).not.toBeInTheDocument();
  });
});
