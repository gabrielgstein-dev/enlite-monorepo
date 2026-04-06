import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Copy, Check, ExternalLink } from 'lucide-react';
import { Typography } from '@presentation/components/atoms/Typography';
import { Button } from '@presentation/components/atoms/Button';
import { AdminApiService } from '@infrastructure/http/AdminApiService';

const CHANNELS = ['facebook', 'instagram', 'whatsapp', 'linkedin', 'site'] as const;
type SocialChannel = (typeof CHANNELS)[number];

const CHANNEL_ICONS: Record<SocialChannel, string> = {
  facebook: '📘',
  instagram: '📸',
  whatsapp: '💬',
  linkedin: '💼',
  site: '🌐',
};

interface Props {
  vacancyId: string;
  caseNumber: number | null;
  vacancyNumber: number | null;
  socialShortLinks: Record<string, string> | null;
  onRefresh: () => void;
}

export function VacancySocialLinksCard({
  vacancyId,
  caseNumber,
  vacancyNumber,
  socialShortLinks,
  onRefresh,
}: Props) {
  const { t } = useTranslation();
  const [links, setLinks] = useState<Record<string, string>>(socialShortLinks ?? {});
  const [loadingChannel, setLoadingChannel] = useState<SocialChannel | null>(null);
  const [copiedChannel, setCopiedChannel] = useState<SocialChannel | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async (channel: SocialChannel) => {
    if (caseNumber == null) return;
    try {
      setLoadingChannel(channel);
      setError(null);
      const result = await AdminApiService.generateSocialLink(vacancyId, channel);
      setLinks(result.social_short_links);
      onRefresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('admin.vacancyDetail.socialLinksCard.generateError');
      setError(message);
    } finally {
      setLoadingChannel(null);
    }
  };

  const handleCopy = async (channel: SocialChannel) => {
    const url = links[channel];
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopiedChannel(channel);
    setTimeout(() => setCopiedChannel(null), 2000);
  };

  const noCaseNumber = caseNumber == null;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col gap-4">
      <div>
        <Typography variant="h3" weight="semibold" className="text-[#737373]">
          {t('admin.vacancyDetail.socialLinksCard.title')}
        </Typography>
        <Typography variant="body" className="text-[#737373] text-sm mt-1">
          {noCaseNumber
            ? t('admin.vacancyDetail.socialLinksCard.noCaseNumber')
            : t('admin.vacancyDetail.socialLinksCard.subtitle')}
        </Typography>
      </div>

      {!noCaseNumber && (
        <div className="text-xs text-slate-400 bg-slate-50 rounded-lg px-3 py-2 font-mono truncate">
          https://app.enlite.health/vacantes/caso{caseNumber}-{vacancyNumber}
        </div>
      )}

      <div className="flex flex-col gap-3">
        {CHANNELS.map((channel) => {
          const shortUrl = links[channel] ?? '';
          const isLoading = loadingChannel === channel;
          const isCopied = copiedChannel === channel;
          const i18nKey = `admin.vacancyDetail.socialLinksCard.${channel}` as const;

          return (
            <div key={channel} className="flex items-center gap-3">
              <span className="text-lg shrink-0 w-6 text-center">{CHANNEL_ICONS[channel]}</span>
              <span className="text-sm font-medium text-slate-700 w-24 shrink-0">
                {t(i18nKey)}
              </span>

              <input
                type="text"
                readOnly
                value={shortUrl}
                placeholder="—"
                className="flex-1 border border-[#D9D9D9] rounded-lg px-3 py-2 text-sm text-slate-700 bg-slate-50 focus:outline-none truncate"
              />

              {shortUrl && (
                <>
                  <button
                    onClick={() => handleCopy(channel)}
                    className="text-[#737373] hover:text-primary transition-colors shrink-0"
                    title={t('admin.vacancyDetail.socialLinksCard.copy')}
                  >
                    {isCopied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                  </button>
                  <a
                    href={shortUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#737373] hover:text-primary transition-colors shrink-0"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={() => handleGenerate(channel)}
                disabled={noCaseNumber || isLoading}
                className="flex items-center gap-1.5 px-3 shrink-0"
              >
                {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {isLoading
                  ? t('admin.vacancyDetail.socialLinksCard.generating')
                  : shortUrl
                    ? t('admin.vacancyDetail.socialLinksCard.generate')
                    : t('admin.vacancyDetail.socialLinksCard.generate')}
              </Button>
            </div>
          );
        })}
      </div>

      {error && (
        <div className="rounded-lg px-4 py-2.5 text-sm bg-red-50 text-red-700 border border-red-200">
          {error}
        </div>
      )}
    </div>
  );
}
