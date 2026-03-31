import { GoogleAuth } from 'google-auth-library';

const MEET_LINK_REGEX = /^https:\/\/meet\.google\.com\/[a-z0-9]+-[a-z0-9]+-[a-z0-9]+$/;

// Scope de escrita cobre leitura também — usado em ambos os métodos.
const CALENDAR_SCOPES = ['https://www.googleapis.com/auth/calendar.events'];

export type AddGuestResult =
  | { success: true }
  | {
      success: false;
      reason: 'invalid_link' | 'invalid_email' | 'event_not_found' | 'already_invited' | 'auth_error' | 'api_error';
      detail?: string;
    };

export type RemoveGuestResult =
  | { success: true }
  | {
      success: false;
      reason: 'invalid_link' | 'invalid_email' | 'event_not_found' | 'not_invited' | 'auth_error' | 'api_error';
      detail?: string;
    };

export class GoogleCalendarService {
  private impersonateEmail: string;
  private calendarId: string;

  constructor() {
    this.impersonateEmail = process.env.GOOGLE_CALENDAR_IMPERSONATE_EMAIL || '';
    this.calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';
  }

  isValidMeetLink(link: string): boolean {
    return MEET_LINK_REGEX.test(link.trim());
  }

  extractMeetingCode(link: string): string {
    return link.trim().split('/').pop() || '';
  }

  // ─── Busca de evento (compartilhado) ────────────────────────────────────────

  /**
   * Obtém um token de acesso usando Domain-Wide Delegation.
   * Retorna null se não houver credenciais configuradas.
   */
  private async getAccessToken(): Promise<string | null> {
    if (!this.impersonateEmail) {
      console.warn('[GoogleCalendarService] GOOGLE_CALENDAR_IMPERSONATE_EMAIL not set');
      return null;
    }
    try {
      const auth = new GoogleAuth({
        scopes: CALENDAR_SCOPES,
        clientOptions: { subject: this.impersonateEmail },
      });
      const client = await auth.getClient();
      const tokenResponse = await client.getAccessToken();
      return tokenResponse.token ?? null;
    } catch (err: unknown) {
      console.warn('[GoogleCalendarService] Auth error:', err instanceof Error ? err.message : err);
      return null;
    }
  }

  /**
   * Busca o evento do Calendar pelo código do Meet link.
   * Pesquisa nos últimos 30 dias e próximos 90 dias do calendário configurado.
   * Retorna o evento completo (com id e attendees) ou null se não encontrado.
   */
  private async findEventByMeetLink(meetLink: string, token: string): Promise<CalendarEvent | null> {
    const meetingCode = this.extractMeetingCode(meetLink);
    const calendarId = encodeURIComponent(this.calendarId);
    const now = new Date();
    const params = new URLSearchParams({
      q: meetingCode,
      maxResults: '10',
      orderBy: 'startTime',
      singleEvents: 'true',
      timeMin: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      timeMax: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    let response: Response;
    try {
      response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?${params}`,
        { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal }
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      console.warn(`[GoogleCalendarService] Calendar API error: ${response.status}`);
      return null;
    }

    const data = await response.json() as { items?: CalendarEvent[] };
    return (data.items ?? []).find((event) => {
      if (event.hangoutLink?.includes(meetingCode)) return true;
      return (event.conferenceData?.entryPoints ?? []).some((ep) => ep.uri?.includes(meetingCode));
    }) ?? null;
  }

  // ─── Métodos públicos ────────────────────────────────────────────────────────

  /**
   * Resolve o datetime de início de uma reunião a partir do Meet link.
   * Retorna ISO 8601 ou null se o evento não for encontrado.
   */
  async resolveDateTime(meetLink: string): Promise<string | null> {
    if (!meetLink || !this.isValidMeetLink(meetLink)) return null;

    if (process.env.USE_MOCK_GOOGLE_CALENDAR === 'true') {
      return '2026-04-05T14:00:00-03:00';
    }

    try {
      const token = await this.getAccessToken();
      if (!token) return null;

      const event = await this.findEventByMeetLink(meetLink, token);
      if (!event) {
        console.warn(`[GoogleCalendarService] No event found for: ${this.extractMeetingCode(meetLink)}`);
        return null;
      }

      return event.start?.dateTime ?? event.start?.date ?? null;
    } catch (err: unknown) {
      const name = err instanceof Error ? err.name : '';
      const msg  = err instanceof Error ? err.message : String(err);
      console.warn(`[GoogleCalendarService] resolveDateTime error (${name}): ${msg}`);
      return null;
    }
  }

  /**
   * Adiciona um convidado externo a uma reunião do Google Meet.
   *
   * Uso futuro: quando for necessário convidar candidatos, pacientes ou
   * familiares para uma call vinculada a uma vaga.
   *
   * @param meetLink  - URL completa do Google Meet (https://meet.google.com/xxx-xxxx-xxx)
   * @param guestEmail - E-mail do convidado a ser adicionado
   * @param sendInvite - Se true, envia e-mail de convite ao convidado (default: true)
   *
   * Retorna um AddGuestResult discriminado para permitir mensagens de erro precisas.
   * Nunca lança exceção — toda falha vira { success: false, reason: ... }.
   */
  async addGuestToMeeting(
    meetLink: string,
    guestEmail: string,
    sendInvite = true
  ): Promise<AddGuestResult> {
    if (!meetLink || !this.isValidMeetLink(meetLink)) {
      return { success: false, reason: 'invalid_link' };
    }
    if (!guestEmail || !guestEmail.includes('@')) {
      return { success: false, reason: 'invalid_email' };
    }

    if (process.env.USE_MOCK_GOOGLE_CALENDAR === 'true') {
      return { success: true };
    }

    try {
      const token = await this.getAccessToken();
      if (!token) return { success: false, reason: 'auth_error' };

      const event = await this.findEventByMeetLink(meetLink, token);
      if (!event?.id) return { success: false, reason: 'event_not_found' };

      const currentAttendees = event.attendees ?? [];
      const normalized = guestEmail.trim().toLowerCase();

      // Idempotente: não adiciona se já está na lista
      const alreadyInvited = currentAttendees.some(
        (a) => a.email?.toLowerCase() === normalized
      );
      if (alreadyInvited) {
        return { success: false, reason: 'already_invited' };
      }

      const updatedAttendees = [...currentAttendees, { email: normalized }];
      const calendarId = encodeURIComponent(this.calendarId);
      const sendUpdates = sendInvite ? 'externalOnly' : 'none';

      const patchController = new AbortController();
      const patchTimeout = setTimeout(() => patchController.abort(), 10000);

      let patchResponse: Response;
      try {
        patchResponse = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${event.id}?sendUpdates=${sendUpdates}`,
          {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ attendees: updatedAttendees }),
            signal: patchController.signal,
          }
        );
      } finally {
        clearTimeout(patchTimeout);
      }

      if (!patchResponse.ok) {
        const detail = await patchResponse.text().catch(() => '');
        console.warn(`[GoogleCalendarService] PATCH error ${patchResponse.status}: ${detail}`);
        return { success: false, reason: 'api_error', detail: `HTTP ${patchResponse.status}` };
      }

      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[GoogleCalendarService] addGuestToMeeting error:', msg);
      return { success: false, reason: 'api_error', detail: msg };
    }
  }

  /**
   * Remove um convidado de uma reunião do Google Meet.
   *
   * Usado quando o worker declina a entrevista (Step 8 — fluxo de declínio).
   * Idempotente: retorna not_invited se o e-mail não está na lista.
   */
  async removeGuestFromMeeting(
    meetLink: string,
    guestEmail: string,
  ): Promise<RemoveGuestResult> {
    if (!meetLink || !this.isValidMeetLink(meetLink)) {
      return { success: false, reason: 'invalid_link' };
    }
    if (!guestEmail || !guestEmail.includes('@')) {
      return { success: false, reason: 'invalid_email' };
    }

    if (process.env.USE_MOCK_GOOGLE_CALENDAR === 'true') {
      return { success: true };
    }

    try {
      const token = await this.getAccessToken();
      if (!token) return { success: false, reason: 'auth_error' };

      const event = await this.findEventByMeetLink(meetLink, token);
      if (!event?.id) return { success: false, reason: 'event_not_found' };

      const currentAttendees = event.attendees ?? [];
      const normalized = guestEmail.trim().toLowerCase();

      const filtered = currentAttendees.filter(
        (a) => a.email?.toLowerCase() !== normalized,
      );

      if (filtered.length === currentAttendees.length) {
        return { success: false, reason: 'not_invited' };
      }

      const calendarId = encodeURIComponent(this.calendarId);

      const patchController = new AbortController();
      const patchTimeout = setTimeout(() => patchController.abort(), 10000);

      let patchResponse: Response;
      try {
        patchResponse = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${event.id}?sendUpdates=none`,
          {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ attendees: filtered }),
            signal: patchController.signal,
          }
        );
      } finally {
        clearTimeout(patchTimeout);
      }

      if (!patchResponse.ok) {
        const detail = await patchResponse.text().catch(() => '');
        console.warn(`[GoogleCalendarService] PATCH remove error ${patchResponse.status}: ${detail}`);
        return { success: false, reason: 'api_error', detail: `HTTP ${patchResponse.status}` };
      }

      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[GoogleCalendarService] removeGuestFromMeeting error:', msg);
      return { success: false, reason: 'api_error', detail: msg };
    }
  }
}

// ─── Internal types ────────────────────────────────────────────────────────────

interface ConferenceEntryPoint {
  uri?: string;
}

interface CalendarAttendee {
  email?: string;
}

interface CalendarEvent {
  id?: string;
  hangoutLink?: string;
  attendees?: CalendarAttendee[];
  conferenceData?: {
    entryPoints?: ConferenceEntryPoint[];
  };
  start?: {
    dateTime?: string;
    date?: string;
  };
}

export const googleCalendarService = new GoogleCalendarService();
