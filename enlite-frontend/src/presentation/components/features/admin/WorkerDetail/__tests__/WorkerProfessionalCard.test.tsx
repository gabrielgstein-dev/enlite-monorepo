import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WorkerProfessionalCard } from '../WorkerProfessionalCard';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const baseProps = {
  profession: 'Psicóloga',
  occupation: 'AT',
  knowledgeLevel: 'Senior',
  titleCertificate: 'CRP 06/12345',
  experienceTypes: ['TEA', 'TDAH'],
  yearsExperience: '5',
  preferredTypes: ['Presencial'],
  preferredAgeRange: 'Adulto',
  languages: ['Português', 'Inglês'],
  linkedinUrl: 'https://linkedin.com/in/ana-silva',
};

describe('WorkerProfessionalCard', () => {
  // ── i18n labels ────────────────────────────────────────────────────────────

  it('renders card title using i18n key admin.workerDetail.professionalData', () => {
    render(<WorkerProfessionalCard {...baseProps} />);
    expect(screen.getByText('admin.workerDetail.professionalData')).toBeInTheDocument();
  });

  it('renders profession label using i18n key admin.workerDetail.profession', () => {
    render(<WorkerProfessionalCard {...baseProps} />);
    expect(screen.getByText('admin.workerDetail.profession')).toBeInTheDocument();
  });

  it('renders occupation label using i18n key admin.workerDetail.occupation', () => {
    render(<WorkerProfessionalCard {...baseProps} />);
    expect(screen.getByText('admin.workerDetail.occupation')).toBeInTheDocument();
  });

  it('renders knowledgeLevel label using i18n key admin.workerDetail.knowledgeLevel', () => {
    render(<WorkerProfessionalCard {...baseProps} />);
    expect(screen.getByText('admin.workerDetail.knowledgeLevel')).toBeInTheDocument();
  });

  it('renders titleCertificate label using i18n key admin.workerDetail.titleCertificate', () => {
    render(<WorkerProfessionalCard {...baseProps} />);
    expect(screen.getByText('admin.workerDetail.titleCertificate')).toBeInTheDocument();
  });

  it('renders yearsExperience label using i18n key admin.workerDetail.yearsExperience', () => {
    render(<WorkerProfessionalCard {...baseProps} />);
    expect(screen.getByText('admin.workerDetail.yearsExperience')).toBeInTheDocument();
  });

  it('renders preferredAgeRange label using i18n key admin.workerDetail.preferredAgeRange', () => {
    render(<WorkerProfessionalCard {...baseProps} />);
    expect(screen.getByText('admin.workerDetail.preferredAgeRange')).toBeInTheDocument();
  });

  it('renders experienceTypes label using i18n key admin.workerDetail.experienceTypes', () => {
    render(<WorkerProfessionalCard {...baseProps} />);
    expect(screen.getByText('admin.workerDetail.experienceTypes')).toBeInTheDocument();
  });

  it('renders preferredTypes label using i18n key admin.workerDetail.preferredTypes', () => {
    render(<WorkerProfessionalCard {...baseProps} />);
    expect(screen.getByText('admin.workerDetail.preferredTypes')).toBeInTheDocument();
  });

  it('renders languages label using i18n key admin.workerDetail.languages', () => {
    render(<WorkerProfessionalCard {...baseProps} />);
    expect(screen.getByText('admin.workerDetail.languages')).toBeInTheDocument();
  });

  // ── Scalar field values ────────────────────────────────────────────────────

  it('renders all scalar field values', () => {
    render(<WorkerProfessionalCard {...baseProps} />);
    expect(screen.getByText('Psicóloga')).toBeInTheDocument();
    expect(screen.getByText('AT')).toBeInTheDocument();
    expect(screen.getByText('Senior')).toBeInTheDocument();
    expect(screen.getByText('CRP 06/12345')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('Adulto')).toBeInTheDocument();
  });

  // ── Array fields (tags) ────────────────────────────────────────────────────

  it('renders array fields as individual tags', () => {
    render(<WorkerProfessionalCard {...baseProps} />);
    expect(screen.getByText('TEA')).toBeInTheDocument();
    expect(screen.getByText('TDAH')).toBeInTheDocument();
    expect(screen.getByText('Presencial')).toBeInTheDocument();
    expect(screen.getByText('Português')).toBeInTheDocument();
    expect(screen.getByText('Inglês')).toBeInTheDocument();
  });

  it('shows dash for empty arrays', () => {
    render(
      <WorkerProfessionalCard
        {...baseProps}
        experienceTypes={[]}
        preferredTypes={[]}
        languages={[]}
      />,
    );
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(3);
  });

  // ── LinkedIn ───────────────────────────────────────────────────────────────

  it('renders LinkedIn link with viewProfile i18n key when URL provided', () => {
    render(<WorkerProfessionalCard {...baseProps} />);
    const link = screen.getByText('admin.workerDetail.viewProfile');
    expect(link.closest('a')).toHaveAttribute('href', 'https://linkedin.com/in/ana-silva');
    expect(link.closest('a')).toHaveAttribute('target', '_blank');
    expect(link.closest('a')).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('hides LinkedIn section when url is null', () => {
    render(<WorkerProfessionalCard {...baseProps} linkedinUrl={null} />);
    expect(screen.queryByText('admin.workerDetail.viewProfile')).not.toBeInTheDocument();
    expect(screen.queryByText('LinkedIn')).not.toBeInTheDocument();
  });

  // ── Null scalar fields ─────────────────────────────────────────────────────

  it('shows dash for all null scalar fields', () => {
    render(
      <WorkerProfessionalCard
        {...baseProps}
        profession={null}
        occupation={null}
        knowledgeLevel={null}
        titleCertificate={null}
        yearsExperience={null}
        preferredAgeRange={null}
      />,
    );
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(6);
  });
});
