import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ZoneHeatmap } from '../ZoneHeatmap';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('ZoneHeatmap', () => {
  const mockZones = [
    { zone: 'Palermo', caseCount: 10, activeCount: 5, percentage: '20' },
    { zone: 'Belgrano', caseCount: 8, activeCount: 4, percentage: '16' },
    { zone: 'Recoleta', caseCount: 5, activeCount: 2, percentage: '10' }
  ];

  it('should render zone analysis header', () => {
    render(
      <ZoneHeatmap 
        zones={mockZones} 
        totalCases={50} 
        nullCount={5} 
        identifiedZones={3} 
      />
    );

    expect(screen.getByText(/admin.recruitment.zoneAnalysis/)).toBeInTheDocument();
    expect(screen.getByText('INTEL')).toBeInTheDocument();
  });

  it('should display summary statistics', () => {
    render(
      <ZoneHeatmap 
        zones={mockZones} 
        totalCases={50} 
        nullCount={5} 
        identifiedZones={3} 
      />
    );

    expect(screen.getAllByText('50').length).toBeGreaterThan(0);
    expect(screen.getAllByText('3').length).toBeGreaterThan(0);
    expect(screen.getAllByText('5').length).toBeGreaterThan(0);
  });

  it('should render all zones', () => {
    render(
      <ZoneHeatmap 
        zones={mockZones} 
        totalCases={50} 
        nullCount={5} 
        identifiedZones={3} 
      />
    );

    expect(screen.getByText('Palermo')).toBeInTheDocument();
    expect(screen.getByText('Belgrano')).toBeInTheDocument();
    expect(screen.getByText('Recoleta')).toBeInTheDocument();
  });

  it('should display case counts for each zone', () => {
    render(
      <ZoneHeatmap 
        zones={mockZones} 
        totalCases={50} 
        nullCount={5} 
        identifiedZones={3} 
      />
    );

    expect(screen.getAllByText('10').length).toBeGreaterThan(0);
    expect(screen.getAllByText('8').length).toBeGreaterThan(0);
  });

  it('should filter out "Sin Zona" from zone cards', () => {
    const zonesWithNull = [
      ...mockZones,
      { zone: 'Sin Zona', caseCount: 5, activeCount: 0, percentage: '10' }
    ];

    render(
      <ZoneHeatmap 
        zones={zonesWithNull} 
        totalCases={50} 
        nullCount={5} 
        identifiedZones={3} 
      />
    );

    const zoneCards = screen.queryAllByText(/Palermo|Belgrano|Recoleta/);
    expect(zoneCards.length).toBeGreaterThan(0);
    
    expect(screen.queryByText('Sin Zona')).not.toBeInTheDocument();
  });

  it('should highlight null count when greater than zero', () => {
    const { container } = render(
      <ZoneHeatmap 
        zones={mockZones} 
        totalCases={50} 
        nullCount={10} 
        identifiedZones={3} 
      />
    );

    const nullCard = container.querySelector('.bg-amber-50');
    expect(nullCard).toBeInTheDocument();
  });
});
