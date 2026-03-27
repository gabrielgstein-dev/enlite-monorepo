import { useTranslation } from 'react-i18next';
import { Typography } from '@presentation/components/atoms/Typography';
import { MapPin } from 'lucide-react';

interface ZoneData {
  zone: string;
  caseCount: number;
  activeCount: number;
  percentage: string;
}

interface ZoneHeatmapProps {
  zones: ZoneData[];
  totalCases: number;
  nullCount: number;
  identifiedZones: number;
}

export function ZoneHeatmap({ 
  zones, 
  totalCases, 
  nullCount, 
  identifiedZones 
}: ZoneHeatmapProps): JSX.Element {
  const { t } = useTranslation();

  const maxCount = Math.max(...zones.map(z => z.caseCount));

  const getHeatColor = (count: number): string => {
    const intensity = count / maxCount;
    const hue = 220 - (intensity * 45);
    const saturation = 70 + (intensity * 30);
    const lightness = 85 - (intensity * 50);
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  };

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-xl p-6 text-white">
        <div className="flex items-center gap-3 mb-4">
          <div className="bg-cyan-500 px-3 py-1 rounded text-xs font-bold animate-pulse">
            INTEL
          </div>
          <Typography variant="h2" weight="bold" className="text-white">
            {t('admin.recruitment.zoneAnalysis')}
          </Typography>
        </div>
        <Typography variant="body" className="text-gray-300">
          {t('admin.recruitment.zoneSource')}
        </Typography>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-blue-50 p-4 rounded-lg">
          <Typography variant="body" className="text-gray-600 text-sm">
            {t('admin.recruitment.totalCases')}
          </Typography>
          <Typography variant="h2" weight="bold" className="text-blue-600">
            {totalCases}
          </Typography>
        </div>
        <div className="bg-green-50 p-4 rounded-lg">
          <Typography variant="body" className="text-gray-600 text-sm">
            {t('admin.recruitment.identifiedZones')}
          </Typography>
          <Typography variant="h2" weight="bold" className="text-green-600">
            {identifiedZones}
          </Typography>
        </div>
        <div className={`p-4 rounded-lg ${nullCount > 0 ? 'bg-amber-50' : 'bg-gray-50'}`}>
          <Typography variant="body" className="text-gray-600 text-sm">
            {t('admin.recruitment.noZone')}
          </Typography>
          <Typography variant="h2" weight="bold" className={nullCount > 0 ? 'text-amber-600' : 'text-gray-600'}>
            {nullCount}
          </Typography>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {zones.filter(z => z.zone !== 'Sin Zona').map((zone, idx) => (
          <div
            key={idx}
            className="p-4 rounded-lg border-2 transition-all hover:shadow-lg"
            style={{ backgroundColor: getHeatColor(zone.caseCount) }}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <MapPin size={16} className="text-gray-700" />
                <Typography variant="body" weight="bold" className="text-gray-900">
                  {zone.zone}
                </Typography>
              </div>
              <Typography variant="h3" weight="bold" className="text-gray-900">
                {zone.caseCount}
              </Typography>
            </div>
            <Typography variant="body" className="text-gray-700 text-sm">
              {zone.percentage}% {t('admin.recruitment.ofTotal')}
            </Typography>
            <div className="mt-2 h-2 bg-gray-900 bg-opacity-10 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gray-900 bg-opacity-30"
                style={{ width: `${zone.percentage}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
