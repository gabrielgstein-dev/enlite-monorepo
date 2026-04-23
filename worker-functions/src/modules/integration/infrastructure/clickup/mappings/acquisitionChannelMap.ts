import type { AcquisitionChannel } from '@modules/case';

/**
 * Translates ClickUp "Canales de Marketing" drop-down labels to canonical AcquisitionChannel.
 * Note: "Wahtsapp" is a typo in ClickUp (should be "WhatsApp") — preserved as-is.
 */
export const CLICKUP_TO_ACQUISITION_CHANNEL: Record<string, AcquisitionChannel> = {
  'Grupos de Wahtsapp':           'WHATSAPP_GROUPS',   // ClickUp: "Grupos de Wahtsapp" (sic — typo "Wahtsapp")
  'Facebook':                     'FACEBOOK',           // ClickUp: "Facebook"
  'Instagram':                    'INSTAGRAM',          // ClickUp: "Instagram"
  'Por un amigo/a':               'REFERRAL',           // ClickUp: "Por un amigo/a" (es)
  'Mail':                         'EMAIL',              // ClickUp: "Mail" (es)
  'Linkedin':                     'LINKEDIN',           // ClickUp: "Linkedin"
  'Centro Psicosocial Argentino': 'CPSA',               // ClickUp: "Centro Psicosocial Argentino" (es)
  'Universidad':                  'UNIVERSITY',         // ClickUp: "Universidad" (es)
  'Otra Institución':             'OTHER_INSTITUTION',  // ClickUp: "Otra Institución" (es)
};

export function mapClickUpAcquisitionChannel(label: string | null): AcquisitionChannel | null {
  if (!label) return null;
  return CLICKUP_TO_ACQUISITION_CHANNEL[label] ?? null;
}
