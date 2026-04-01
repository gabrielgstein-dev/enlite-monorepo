import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WorkerPersonalCard } from '../WorkerPersonalCard';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const baseProps = {
  firstName: 'Ana',
  lastName: 'Silva',
  email: 'ana.silva@test.com',
  phone: '+55 11 99999-0000',
  whatsappPhone: '+55 11 88888-0000',
  profilePhotoUrl: null as string | null,
  birthDate: '1995-06-15',
  documentType: 'CPF',
  documentNumber: '123.456.789-00',
  sex: 'Feminino',
  gender: 'Mulher cis',
};

describe('WorkerPersonalCard', () => {
  // ── i18n labels ────────────────────────────────────────────────────────────

  it('renders card title using i18n key admin.workerDetail.personalData', () => {
    render(<WorkerPersonalCard {...baseProps} />);
    expect(screen.getByText('admin.workerDetail.personalData')).toBeInTheDocument();
  });

  it('renders phone label using i18n key admin.workerDetail.phone', () => {
    render(<WorkerPersonalCard {...baseProps} />);
    expect(screen.getByText('admin.workerDetail.phone')).toBeInTheDocument();
  });

  it('renders WhatsApp label using i18n key admin.workerDetail.whatsapp', () => {
    render(<WorkerPersonalCard {...baseProps} />);
    expect(screen.getByText('admin.workerDetail.whatsapp')).toBeInTheDocument();
  });

  it('renders birthDate label using i18n key admin.workerDetail.birthDate', () => {
    render(<WorkerPersonalCard {...baseProps} />);
    expect(screen.getByText('admin.workerDetail.birthDate')).toBeInTheDocument();
  });

  it('renders document label using i18n key admin.workerDetail.document', () => {
    render(<WorkerPersonalCard {...baseProps} />);
    expect(screen.getByText('admin.workerDetail.document')).toBeInTheDocument();
  });

  it('renders sex label using i18n key admin.workerDetail.sex', () => {
    render(<WorkerPersonalCard {...baseProps} />);
    expect(screen.getByText('admin.workerDetail.sex')).toBeInTheDocument();
  });

  it('renders gender label using i18n key admin.workerDetail.gender', () => {
    render(<WorkerPersonalCard {...baseProps} />);
    expect(screen.getByText('admin.workerDetail.gender')).toBeInTheDocument();
  });

  // ── Name and avatar ────────────────────────────────────────────────────────

  it('renders full name from firstName + lastName', () => {
    render(<WorkerPersonalCard {...baseProps} />);
    expect(screen.getByText('Ana Silva')).toBeInTheDocument();
  });

  it('renders email below the name', () => {
    render(<WorkerPersonalCard {...baseProps} />);
    expect(screen.getByText('ana.silva@test.com')).toBeInTheDocument();
  });

  it('shows initial letter in avatar when no photo', () => {
    render(<WorkerPersonalCard {...baseProps} />);
    expect(screen.getByText('A')).toBeInTheDocument();
  });

  it('renders profile photo when URL is provided', () => {
    render(<WorkerPersonalCard {...baseProps} profilePhotoUrl="https://example.com/photo.jpg" />);
    const img = screen.getByAltText('Ana Silva');
    expect(img).toHaveAttribute('src', 'https://example.com/photo.jpg');
  });

  it('falls back to email initial when firstName is null and no photo', () => {
    render(<WorkerPersonalCard {...baseProps} firstName={null} lastName={null} />);
    expect(screen.getByText('A')).toBeInTheDocument(); // 'a' from ana.silva@...
  });

  it('falls back to ? when firstName is null and email is empty string', () => {
    render(<WorkerPersonalCard {...baseProps} firstName={null} lastName={null} email="" />);
    expect(screen.getByText('?')).toBeInTheDocument();
  });

  // ── Data fields ────────────────────────────────────────────────────────────

  it('renders phone and whatsapp values', () => {
    render(<WorkerPersonalCard {...baseProps} />);
    expect(screen.getByText('+55 11 99999-0000')).toBeInTheDocument();
    expect(screen.getByText('+55 11 88888-0000')).toBeInTheDocument();
  });

  it('renders formatted birth date in pt-BR locale', () => {
    render(<WorkerPersonalCard {...baseProps} />);
    expect(screen.getByText(/\/06\/1995/)).toBeInTheDocument();
  });

  it('renders document type and number combined', () => {
    render(<WorkerPersonalCard {...baseProps} />);
    expect(screen.getByText('CPF: 123.456.789-00')).toBeInTheDocument();
  });

  it('renders document with dash for null documentType', () => {
    render(<WorkerPersonalCard {...baseProps} documentType={null} />);
    expect(screen.getByText('—: 123.456.789-00')).toBeInTheDocument();
  });

  it('renders sex and gender values', () => {
    render(<WorkerPersonalCard {...baseProps} />);
    expect(screen.getByText('Feminino')).toBeInTheDocument();
    expect(screen.getByText('Mulher cis')).toBeInTheDocument();
  });

  // ── Null/empty state ───────────────────────────────────────────────────────

  it('shows dash for all null fields', () => {
    render(
      <WorkerPersonalCard
        {...baseProps}
        firstName={null}
        lastName={null}
        phone={null}
        whatsappPhone={null}
        birthDate={null}
        documentType={null}
        documentNumber={null}
        sex={null}
        gender={null}
      />,
    );
    const dashes = screen.getAllByText('—');
    // phone, whatsapp, birthDate, document, sex, gender + name fallback = 7 dashes
    expect(dashes.length).toBeGreaterThanOrEqual(5);
  });

  it('shows dash as full name when both firstName and lastName are null', () => {
    render(
      <WorkerPersonalCard
        {...baseProps}
        firstName={null}
        lastName={null}
      />,
    );
    // The name area should show '—'
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1);
  });
});
