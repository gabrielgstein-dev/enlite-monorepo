import { GoogleAuth } from 'google-auth-library';

const MEET_LINK_REGEX = /^https:\/\/meet\.google\.com\/[a-z0-9]+-[a-z0-9]+-[a-z0-9]+$/;

// Scope de escrita cobre leitura também — usado em ambos os métodos.
const CALENDAR_SCOPES = ['https://www.googleapis.com/auth/calendar'];

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
   * Lista todos os calendários acessíveis pelo usuário impersonado.
   * Retorna os IDs dos calendários (inclui primary + compartilhados + de outros usuários do domínio).
   */
  private async listCalendarIds(token: string): Promise<string[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(
        'https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250',
        { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal }
      );
      if (!response.ok) {
        console.warn(`[GoogleCalendarService] calendarList error: ${response.status}`);
        return [this.calendarId];
      }
      const data = await response.json() as { items?: { id?: string }[] };
      const ids = (data.items ?? []).map((c) => c.id).filter((id): id is string => !!id);
      console.log(`[GoogleCalendarService] Found ${ids.length} calendars to search`);
      return ids.length > 0 ? ids : [this.calendarId];
    } catch (err: unknown) {
      console.warn('[GoogleCalendarService] calendarList fetch error:', err instanceof Error ? err.message : err);
      return [this.calendarId];
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Busca o evento do Calendar pelo código do Meet link.
   * Pesquisa nos últimos 30 dias e próximos 90 dias em TODOS os calendários acessíveis,
   * para encontrar eventos criados por qualquer usuário do domínio.
   * Retorna o evento completo (com id e attendees) ou null se não encontrado.
   */
  private async findEventByMeetLink(meetLink: string, token: string): Promise<FoundEvent | null> {
    const meetingCode = this.extractMeetingCode(meetLink);
    const calendarIds = await this.listCalendarIds(token);

    const now = new Date();
    const timeMin = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const timeMax = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString();

    // Busca em paralelo em todos os calendários
    const results = await Promise.allSettled(
      calendarIds.map((calId) => this.searchCalendarForMeet(calId, meetingCode, timeMin, timeMax, token))
    );

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        return result.value;
      }
    }

    return null;
  }

  /**
   * Busca um evento com o código Meet em um calendário específico.
   */
  private async searchCalendarForMeet(
    calendarId: string,
    meetingCode: string,
    timeMin: string,
    timeMax: string,
    token: string
  ): Promise<FoundEvent | null> {
    const encodedCalId = encodeURIComponent(calendarId);
    const params = new URLSearchParams({
      q: meetingCode,
      maxResults: '10',
      orderBy: 'startTime',
      singleEvents: 'true',
      timeMin,
      timeMax,
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    let response: Response;
    try {
      response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodedCalId}/events?${params}`,
        { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal }
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) return null;

    const data = await response.json() as { items?: CalendarEvent[] };
    const event = (data.items ?? []).find((ev) => {
      if (ev.hangoutLink?.includes(meetingCode)) return true;
      return (ev.conferenceData?.entryPoints ?? []).some((ep) => ep.uri?.includes(meetingCode));
    });
    return event ? { event, calendarId } : null;
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

      const found = await this.findEventByMeetLink(meetLink, token);
      if (!found) {
        console.warn(`[GoogleCalendarService] No event found for: ${this.extractMeetingCode(meetLink)}`);
        return null;
      }

      return found.event.start?.dateTime ?? found.event.start?.date ?? null;
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

      const found = await this.findEventByMeetLink(meetLink, token);
      if (!found?.event.id) return { success: false, reason: 'event_not_found' };

      const currentAttendees = found.event.attendees ?? [];
      const normalized = guestEmail.trim().toLowerCase();

      // Idempotente: não adiciona se já está na lista
      const alreadyInvited = currentAttendees.some(
        (a) => a.email?.toLowerCase() === normalized
      );
      if (alreadyInvited) {
        return { success: false, reason: 'already_invited' };
      }

      const updatedAttendees = [...currentAttendees, { email: normalized }];
      const encodedCalId = encodeURIComponent(found.calendarId);
      const sendUpdates = sendInvite ? 'externalOnly' : 'none';

      const patchController = new AbortController();
      const patchTimeout = setTimeout(() => patchController.abort(), 10000);

      let patchResponse: Response;
      try {
        patchResponse = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodedCalId}/events/${found.event.id}?sendUpdates=${sendUpdates}`,
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

      const found = await this.findEventByMeetLink(meetLink, token);
      if (!found?.event.id) return { success: false, reason: 'event_not_found' };

      const currentAttendees = found.event.attendees ?? [];
      const normalized = guestEmail.trim().toLowerCase();

      const filtered = currentAttendees.filter(
        (a) => a.email?.toLowerCase() !== normalized,
      );

      if (filtered.length === currentAttendees.length) {
        return { success: false, reason: 'not_invited' };
      }

      const encodedCalId = encodeURIComponent(found.calendarId);

      const patchController = new AbortController();
      const patchTimeout = setTimeout(() => patchController.abort(), 10000);

      let patchResponse: Response;
      try {
        patchResponse = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodedCalId}/events/${found.event.id}?sendUpdates=none`,
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

interface FoundEvent {
  event: CalendarEvent;
  calendarId: string;
}

export const googleCalendarService = new GoogleCalendarService();
