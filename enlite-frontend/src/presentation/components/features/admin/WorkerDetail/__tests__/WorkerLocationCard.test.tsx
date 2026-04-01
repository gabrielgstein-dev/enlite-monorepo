import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WorkerLocationCard } from '../WorkerLocationCard';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('WorkerLocationCard', () => {
  // ── i18n labels ────────────────────────────────────────────────────────────

  it('renders card title using i18n key admin.workerDetail.location', () => {
    render(<WorkerLocationCard serviceAreas={[]} location={null} />);
    expect(screen.getByText('admin.workerDetail.location')).toBeInTheDocument();
  });

  it('renders address label using i18n key admin.workerDetail.address', () => {
    render(
      <WorkerLocationCard
        serviceAreas={[]}
        location={{ address: 'Rua X', city: null, workZone: null, interestZone: null }}
      />,
    );
    expect(screen.getByText('admin.workerDetail.address')).toBeInTheDocument();
  });

  it('renders city label using i18n key admin.workerDetail.city', () => {
    render(
      <WorkerLocationCard
        serviceAreas={[]}
        location={{ address: null, city: 'SP', workZone: null, interestZone: null }}
      />,
    );
    expect(screen.getByText('admin.workerDetail.city')).toBeInTheDocument();
  });

  it('renders workZone label using i18n key admin.workerDetail.workZone', () => {
    render(
      <WorkerLocationCard
        serviceAreas={[]}
        location={{ address: null, city: null, workZone: 'Norte', interestZone: null }}
      />,
    );
    expect(screen.getByText('admin.workerDetail.workZone')).toBeInTheDocument();
  });

  it('renders interestZone label using i18n key admin.workerDetail.interestZone', () => {
    render(
      <WorkerLocationCard
        serviceAreas={[]}
        location={{ address: null, city: null, workZone: null, interestZone: 'Sul' }}
      />,
    );
    expect(screen.getByText('admin.workerDetail.interestZone')).toBeInTheDocument();
  });

  it('renders serviceAreas section title using i18n key admin.workerDetail.serviceAreas', () => {
    render(
      <WorkerLocationCard
        serviceAreas={[{ id: 'sa-1', address: 'Rua X', serviceRadiusKm: 5, lat: null, lng: null }]}
        location={null}
      />,
    );
    expect(screen.getByText('admin.workerDetail.serviceAreas')).toBeInTheDocument();
  });

  it('renders radius label using i18n key admin.workerDetail.radius', () => {
    render(
      <WorkerLocationCard
        serviceAreas={[{ id: 'sa-1', address: 'Rua X', serviceRadiusKm: 10, lat: null, lng: null }]}
        location={null}
      />,
    );
    expect(screen.getByText(/admin\.workerDetail\.radius/)).toBeInTheDocument();
  });

  it('renders noLocation message using i18n key admin.workerDetail.noLocation', () => {
    render(<WorkerLocationCard serviceAreas={[]} location={null} />);
    expect(screen.getByText('admin.workerDetail.noLocation')).toBeInTheDocument();
  });

  // ── Worker Location fields (Argentina style) ──────────────────────────────

  it('renders all worker location fields', () => {
    render(
      <WorkerLocationCard
        serviceAreas={[]}
        location={{
          address: 'Av. Corrientes 1234',
          city: 'Buenos Aires',
          workZone: 'CABA',
          interestZone: 'Zona Norte',
        }}
      />,
    );
    expect(screen.getByText('Av. Corrientes 1234')).toBeInTheDocument();
    expect(screen.getByText('Buenos Aires')).toBeInTheDocument();
    expect(screen.getByText('CABA')).toBeInTheDocument();
    expect(screen.getByText('Zona Norte')).toBeInTheDocument();
  });

  it('shows dash for null location fields', () => {
    render(
      <WorkerLocationCard
        serviceAreas={[]}
        location={{ address: null, city: null, workZone: null, interestZone: null }}
      />,
    );
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBe(4);
  });

  // ── Service Areas (Brazil style) ───────────────────────────────────────────

  it('renders service areas with address and radius', () => {
    render(
      <WorkerLocationCard
        serviceAreas={[
          { id: 'sa-1', address: 'Av. Paulista, 1000', serviceRadiusKm: 10, lat: -23.5613, lng: -46.6558 },
          { id: 'sa-2', address: 'Rua Augusta, 500', serviceRadiusKm: 5, lat: null, lng: null },
        ]}
        location={null}
      />,
    );
    expect(screen.getByText('Av. Paulista, 1000')).toBeInTheDocument();
    expect(screen.getByText('Rua Augusta, 500')).toBeInTheDocument();
    expect(screen.getByText(/10 km/)).toBeInTheDocument();
    expect(screen.getByText(/5 km/)).toBeInTheDocument();
  });

  it('renders coordinates when lat/lng are available', () => {
    render(
      <WorkerLocationCard
        serviceAreas={[{ id: 'sa-1', address: 'Rua X', serviceRadiusKm: 8, lat: -23.5613, lng: -46.6558 }]}
        location={null}
      />,
    );
    expect(screen.getByText(/\(-23\.5613, -46\.6558\)/)).toBeInTheDocument();
  });

  it('hides coordinates when lat/lng are null', () => {
    render(
      <WorkerLocationCard
        serviceAreas={[{ id: 'sa-1', address: 'Rua X', serviceRadiusKm: 8, lat: null, lng: null }]}
        location={null}
      />,
    );
    expect(screen.queryByText(/\(-?\d+\.\d+, -?\d+\.\d+\)/)).not.toBeInTheDocument();
  });

  it('shows dash for null service area address', () => {
    render(
      <WorkerLocationCard
        serviceAreas={[{ id: 'sa-1', address: null, serviceRadiusKm: null, lat: null, lng: null }]}
        location={null}
      />,
    );
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  // ── Combined ───────────────────────────────────────────────────────────────

  it('renders both location and service areas when both present', () => {
    render(
      <WorkerLocationCard
        serviceAreas={[{ id: 'sa-1', address: 'Rua X', serviceRadiusKm: 8, lat: null, lng: null }]}
        location={{ address: 'Av. Y', city: 'City', workZone: 'Zone', interestZone: null }}
      />,
    );
    expect(screen.getByText('Rua X')).toBeInTheDocument();
    expect(screen.getByText('Av. Y')).toBeInTheDocument();
  });

  it('does not show noLocation message when location is present', () => {
    render(
      <WorkerLocationCard
        serviceAreas={[]}
        location={{ address: 'Some address', city: null, workZone: null, interestZone: null }}
      />,
    );
    expect(screen.queryByText('admin.workerDetail.noLocation')).not.toBeInTheDocument();
  });

  it('does not show noLocation message when serviceAreas are present', () => {
    render(
      <WorkerLocationCard
        serviceAreas={[{ id: 'sa-1', address: 'Rua Z', serviceRadiusKm: 3, lat: null, lng: null }]}
        location={null}
      />,
    );
    expect(screen.queryByText('admin.workerDetail.noLocation')).not.toBeInTheDocument();
  });
});
