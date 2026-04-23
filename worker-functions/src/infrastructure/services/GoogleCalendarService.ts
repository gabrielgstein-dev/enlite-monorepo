import { Pool } from 'pg';
import { DatabaseConnection } from '@shared/database/DatabaseConnection';

const MEET_LINK_REGEX = /^https:\/\/meet\.google\.com\/[a-z0-9]+-[a-z0-9]+-[a-z0-9]+$/;
const METADATA_BASE = 'http://metadata.google.internal/computeMetadata/v1';
const METADATA_HEADERS = { 'Metadata-Flavor': 'Google' };

const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar';

const SEARCH_BATCH_SIZE = 5;

export type AddGuestResult =
  | { success: true }
  | { success: false; reason: 'invalid_link' | 'invalid_email' | 'event_not_found' | 'already_invited' | 'auth_error' | 'api_error'; detail?: string };

export type RemoveGuestResult =
  | { success: true }
  | { success: false; reason: 'invalid_link' | 'invalid_email' | 'event_not_found' | 'not_invited' | 'auth_error' | 'api_error'; detail?: string };

export type ConfirmAttendeeResult =
  | { success: true }
  | { success: false; reason: 'invalid_link' | 'invalid_email' | 'event_not_found' | 'not_invited' | 'auth_error' | 'api_error'; detail?: string };

export class GoogleCalendarService {
  private impersonateEmail: string;
  private db: Pool;

  constructor() {
    this.impersonateEmail = process.env.GOOGLE_CALENDAR_IMPERSONATE_EMAIL || '';
    this.db = DatabaseConnection.getInstance().getPool();
  }

  isValidMeetLink(link: string): boolean {
    return MEET_LINK_REGEX.test(link.trim());
  }

  extractMeetingCode(link: string): string {
    return link.trim().split('/').pop() || '';
  }

  // ─── Auth via Domain-Wide Delegation (IAM signJwt) ──────────────────────────

  /**
   * Obtém access token impersonando via signJwt.
   * No Cloud Run, GoogleAuth ignora clientOptions.subject — por isso usamos
   * metadata server → signJwt → token exchange.
   */
  private async getAccessToken(subjectEmail?: string): Promise<string | null> {
    const subject = subjectEmail || this.impersonateEmail;
    if (!subject) {
      console.warn('[GoogleCalendarService] GOOGLE_CALENDAR_IMPERSONATE_EMAIL not set');
      return null;
    }
    try {
      const [saEmailRes, saTokenRes] = await Promise.all([
        fetch(`${METADATA_BASE}/instance/service-accounts/default/email`, { headers: METADATA_HEADERS }),
        fetch(`${METADATA_BASE}/instance/service-accounts/default/token`, { headers: METADATA_HEADERS }),
      ]);
      if (!saEmailRes.ok || !saTokenRes.ok) {
        console.warn('[GoogleCalendarService] metadata server error');
        return null;
      }
      const saEmail = await saEmailRes.text();
      const { access_token: saToken } = (await saTokenRes.json()) as { access_token: string };

      const now = Math.floor(Date.now() / 1000);
      const claimSet = {
        iss: saEmail,
        sub: subject,
        scope: CALENDAR_SCOPE,
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
      };

      const signRes = await fetch(
        `https://iam.googleapis.com/v1/projects/-/serviceAccounts/${saEmail}:signJwt`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${saToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ payload: JSON.stringify(claimSet) }),
        },
      );
      if (!signRes.ok) {
        const detail = await signRes.text().catch(() => '');
        console.warn(`[GoogleCalendarService] signJwt error ${signRes.status}: ${detail}`);
        return null;
      }
      const { signedJwt } = (await signRes.json()) as { signedJwt: string };

      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion: signedJwt,
        }),
      });
      if (!tokenRes.ok) {
        const detail = await tokenRes.text().catch(() => '');
        console.warn(`[GoogleCalendarService] token exchange error ${tokenRes.status}: ${detail}`);
        return null;
      }
      const { access_token } = (await tokenRes.json()) as { access_token: string };
      return access_token ?? null;
    } catch (err: unknown) {
      console.warn('[GoogleCalendarService] Auth error:', err instanceof Error ? err.message : err);
      return null;
    }
  }

  // ─── Busca de evento ────────────────────────────────────────────────────────

  /** Lista emails dos staff do domínio a partir da tabela users (sem Admin SDK). */
  private async listStaffEmails(): Promise<string[]> {
    const domain = this.impersonateEmail.split('@')[1];
    if (!domain) return [];

    try {
      const result = await this.db.query<{ email: string }>(
        `SELECT DISTINCT email FROM users
         WHERE email LIKE $1 AND is_active = true
           AND role IN ('admin', 'recruiter', 'community_manager')`,
        [`%@${domain}`],
      );
      const emails = result.rows.map((r) => r.email);
      console.log(`[GoogleCalendarService] Staff emails from DB: ${emails.length}`);
      return emails;
    } catch (err: unknown) {
      console.warn('[GoogleCalendarService] DB staff query error:', err instanceof Error ? err.message : err);
      return [];
    }
  }

  /**
   * Busca evento pelo Meet link em duas fases:
   *   1. Calendários no calendarList do impersonateEmail (compartilhados/inscritos)
   *   2. Calendário primário de cada staff do domínio (via DB)
   * Para em cada fase assim que encontra. Não usa parâmetro `q` porque a
   * Calendar API não pesquisa hangoutLink/conferenceData por texto.
   */
  private async findEventByMeetLink(meetLink: string, token: string, targetDate?: string): Promise<FoundEvent | null> {
    const meetingCode = this.extractMeetingCode(meetLink);
    const now = new Date();
    const timeMin = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const timeMax = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString();

    // Phase 1: calendarList do impersonateEmail
    const calListRes = await fetch(
      'https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250',
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const calIds: string[] = calListRes.ok
      ? ((await calListRes.json()) as { items?: { id?: string }[] }).items
          ?.map((c) => c.id)
          .filter((id): id is string => !!id) ?? []
      : [];
    console.log(`[GoogleCalendarService] Phase 1: searching ${calIds.length} subscribed calendars`);

    const phase1 = await this.searchCalendarsUntilFound(calIds, meetingCode, timeMin, timeMax, token, targetDate);
    if (phase1) return phase1;

    // Phase 2: calendário primário de cada staff do domínio
    const staffEmails = await this.listStaffEmails();
    const searched = new Set(calIds);
    const unsearched = staffEmails.filter((e) => !searched.has(e));
    console.log(`[GoogleCalendarService] Phase 2: searching ${unsearched.length} staff calendars`);

    return this.searchCalendarsUntilFound(unsearched, meetingCode, timeMin, timeMax, token, targetDate);
  }

  /**
   * Busca em lotes de SEARCH_BATCH_SIZE calendários em paralelo.
   * Aborta todas as requests pendentes assim que encontra o evento.
   */
  private async searchCalendarsUntilFound(
    calendarIds: string[],
    meetingCode: string,
    timeMin: string,
    timeMax: string,
    token: string,
    targetDate?: string,
  ): Promise<FoundEvent | null> {
    let found: FoundEvent | null = null;
    const abortController = new AbortController();

    for (let i = 0; i < calendarIds.length && !found; i += SEARCH_BATCH_SIZE) {
      const batch = calendarIds.slice(i, i + SEARCH_BATCH_SIZE);
      await Promise.all(
        batch.map(async (calId) => {
          if (found || abortController.signal.aborted) return;
          const result = await this.searchCalendarForMeet(
            calId, meetingCode, timeMin, timeMax, token, abortController.signal, targetDate,
          );
          if (result && !found) {
            found = result;
            abortController.abort();
          }
        }),
      );
    }

    return found;
  }

  /** Busca evento com Meet code em um calendário. Filtra por hangoutLink/conferenceData.
   *  Se targetDate fornecido, retorna a instância mais próxima dessa data (para eventos recorrentes). */
  private async searchCalendarForMeet(
    calendarId: string,
    meetingCode: string,
    timeMin: string,
    timeMax: string,
    token: string,
    signal?: AbortSignal,
    targetDate?: string,
  ): Promise<FoundEvent | null> {
    const params = new URLSearchParams({
      maxResults: '250',
      singleEvents: 'true',
      orderBy: 'startTime',
      timeMin,
      timeMax,
      fields: 'items(id,hangoutLink,conferenceData,start,attendees,organizer)',
    });

    try {
      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
        { headers: { Authorization: `Bearer ${token}` }, signal },
      );
      if (!res.ok) return null;

      const data = (await res.json()) as { items?: CalendarEvent[] };
      const matching = (data.items ?? []).filter((ev) => {
        if (ev.hangoutLink?.includes(meetingCode)) return true;
        return (ev.conferenceData?.entryPoints ?? []).some((ep) => ep.uri?.includes(meetingCode));
      });

      if (matching.length === 0) return null;

      // Se targetDate fornecido, encontra a instância mais próxima
      if (targetDate && matching.length > 1) {
        const target = new Date(targetDate).getTime();
        let closest = matching[0];
        let closestDiff = Infinity;
        for (const ev of matching) {
          const evTime = new Date(ev.start?.dateTime ?? ev.start?.date ?? '').getTime();
          const diff = Math.abs(evTime - target);
          if (diff < closestDiff) {
            closestDiff = diff;
            closest = ev;
          }
        }
        return { event: closest, calendarId };
      }

      return { event: matching[0], calendarId };
    } catch {
      return null;
    }
  }

  // ─── Métodos públicos ────────────────────────────────────────────────────────

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
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[GoogleCalendarService] resolveDateTime error: ${msg}`);
      return null;
    }
  }

  async addGuestToMeeting(meetLink: string, guestEmail: string, sendInvite = true, targetDate?: string): Promise<AddGuestResult> {
    if (!meetLink || !this.isValidMeetLink(meetLink)) return { success: false, reason: 'invalid_link' };
    if (!guestEmail || !guestEmail.includes('@')) return { success: false, reason: 'invalid_email' };
    if (process.env.USE_MOCK_GOOGLE_CALENDAR === 'true') return { success: true };

    try {
      const token = await this.getAccessToken();
      if (!token) return { success: false, reason: 'auth_error' };

      const meetingCode = this.extractMeetingCode(meetLink);
      const found = await this.findEventByMeetLink(meetLink, token, targetDate);
      if (!found?.event.id) {
        console.warn(`[GoogleCalendarService] No event found for meet code: ${meetingCode}`);
        return { success: false, reason: 'event_not_found' };
      }

      const organizerEmail = found.event.organizer?.email;
      console.log(`[GoogleCalendarService] Found event: id=${found.event.id} calendar=${found.calendarId} organizer=${organizerEmail ?? 'unknown'}`);

      const currentAttendees = found.event.attendees ?? [];
      const normalized = guestEmail.trim().toLowerCase();

      if (currentAttendees.some((a) => a.email?.toLowerCase() === normalized)) {
        return { success: false, reason: 'already_invited' };
      }

      // PATCH com token do organizador — enlite@enlite.health pode não ter permissão de escrita
      let patchToken = token;
      if (organizerEmail && organizerEmail !== this.impersonateEmail) {
        const orgToken = await this.getAccessToken(organizerEmail);
        if (orgToken) {
          patchToken = orgToken;
        } else {
          console.warn(`[GoogleCalendarService] Could not get organizer token for ${organizerEmail}, using default`);
        }
      }

      const updatedAttendees = [...currentAttendees, { email: normalized }];
      const sendUpdates = sendInvite ? 'externalOnly' : 'none';

      const result = await this.patchEventAttendees(found.calendarId, found.event.id, updatedAttendees, sendUpdates, patchToken);
      if (result.ok) {
        console.log(`[GoogleCalendarService] PATCH success: added ${normalized} to event ${found.event.id} (via ${organizerEmail ?? 'default'})`);
      }
      return result.ok ? { success: true } : { success: false, reason: 'api_error', detail: `HTTP ${result.status}` };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[GoogleCalendarService] addGuestToMeeting error:', msg);
      return { success: false, reason: 'api_error', detail: msg };
    }
  }

  async confirmAttendee(meetLink: string, guestEmail: string, targetDate?: string): Promise<ConfirmAttendeeResult> {
    if (!meetLink || !this.isValidMeetLink(meetLink)) return { success: false, reason: 'invalid_link' };
    if (!guestEmail || !guestEmail.includes('@')) return { success: false, reason: 'invalid_email' };
    if (process.env.USE_MOCK_GOOGLE_CALENDAR === 'true') return { success: true };

    try {
      const token = await this.getAccessToken();
      if (!token) return { success: false, reason: 'auth_error' };

      const found = await this.findEventByMeetLink(meetLink, token, targetDate);
      if (!found?.event.id) return { success: false, reason: 'event_not_found' };

      const currentAttendees = found.event.attendees ?? [];
      const normalized = guestEmail.trim().toLowerCase();
      const attendeeIndex = currentAttendees.findIndex((a) => a.email?.toLowerCase() === normalized);

      if (attendeeIndex === -1) return { success: false, reason: 'not_invited' };

      const updatedAttendees = currentAttendees.map((a, i) =>
        i === attendeeIndex ? { ...a, responseStatus: 'accepted' } : a,
      );

      let patchToken = token;
      const organizerEmail = found.event.organizer?.email;
      if (organizerEmail && organizerEmail !== this.impersonateEmail) {
        const orgToken = await this.getAccessToken(organizerEmail);
        if (orgToken) patchToken = orgToken;
      }

      const result = await this.patchEventAttendees(found.calendarId, found.event.id, updatedAttendees, 'none', patchToken);
      if (result.ok) {
        console.log(`[GoogleCalendarService] PATCH success: confirmed ${normalized} on event ${found.event.id}`);
      }
      return result.ok ? { success: true } : { success: false, reason: 'api_error', detail: `HTTP ${result.status}` };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[GoogleCalendarService] confirmAttendee error:', msg);
      return { success: false, reason: 'api_error', detail: msg };
    }
  }

  async declineAttendee(meetLink: string, guestEmail: string, targetDate?: string): Promise<ConfirmAttendeeResult> {
    if (!meetLink || !this.isValidMeetLink(meetLink)) return { success: false, reason: 'invalid_link' };
    if (!guestEmail || !guestEmail.includes('@')) return { success: false, reason: 'invalid_email' };
    if (process.env.USE_MOCK_GOOGLE_CALENDAR === 'true') return { success: true };

    try {
      const token = await this.getAccessToken();
      if (!token) return { success: false, reason: 'auth_error' };

      const found = await this.findEventByMeetLink(meetLink, token, targetDate);
      if (!found?.event.id) return { success: false, reason: 'event_not_found' };

      const currentAttendees = found.event.attendees ?? [];
      const normalized = guestEmail.trim().toLowerCase();
      const attendeeIndex = currentAttendees.findIndex((a) => a.email?.toLowerCase() === normalized);

      if (attendeeIndex === -1) return { success: false, reason: 'not_invited' };

      const updatedAttendees = currentAttendees.map((a, i) =>
        i === attendeeIndex ? { ...a, responseStatus: 'declined' } : a,
      );

      let patchToken = token;
      const organizerEmail = found.event.organizer?.email;
      if (organizerEmail && organizerEmail !== this.impersonateEmail) {
        const orgToken = await this.getAccessToken(organizerEmail);
        if (orgToken) patchToken = orgToken;
      }

      const result = await this.patchEventAttendees(found.calendarId, found.event.id, updatedAttendees, 'none', patchToken);
      if (result.ok) {
        console.log(`[GoogleCalendarService] PATCH success: declined ${normalized} on event ${found.event.id}`);
      }
      return result.ok ? { success: true } : { success: false, reason: 'api_error', detail: `HTTP ${result.status}` };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[GoogleCalendarService] declineAttendee error:', msg);
      return { success: false, reason: 'api_error', detail: msg };
    }
  }

  async removeGuestFromMeeting(meetLink: string, guestEmail: string, targetDate?: string): Promise<RemoveGuestResult> {
    if (!meetLink || !this.isValidMeetLink(meetLink)) return { success: false, reason: 'invalid_link' };
    if (!guestEmail || !guestEmail.includes('@')) return { success: false, reason: 'invalid_email' };
    if (process.env.USE_MOCK_GOOGLE_CALENDAR === 'true') return { success: true };

    try {
      const token = await this.getAccessToken();
      if (!token) return { success: false, reason: 'auth_error' };

      const found = await this.findEventByMeetLink(meetLink, token, targetDate);
      if (!found?.event.id) return { success: false, reason: 'event_not_found' };

      const currentAttendees = found.event.attendees ?? [];
      const normalized = guestEmail.trim().toLowerCase();
      const filtered = currentAttendees.filter((a) => a.email?.toLowerCase() !== normalized);

      if (filtered.length === currentAttendees.length) return { success: false, reason: 'not_invited' };

      let patchToken = token;
      const organizerEmail = found.event.organizer?.email;
      if (organizerEmail && organizerEmail !== this.impersonateEmail) {
        const orgToken = await this.getAccessToken(organizerEmail);
        if (orgToken) patchToken = orgToken;
      }

      const result = await this.patchEventAttendees(found.calendarId, found.event.id, filtered, 'none', patchToken);
      return result.ok ? { success: true } : { success: false, reason: 'api_error', detail: `HTTP ${result.status}` };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[GoogleCalendarService] removeGuestFromMeeting error:', msg);
      return { success: false, reason: 'api_error', detail: msg };
    }
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private async patchEventAttendees(
    calendarId: string,
    eventId: string,
    attendees: CalendarAttendee[],
    sendUpdates: string,
    token: string,
  ): Promise<{ ok: boolean; status: number }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}?sendUpdates=${sendUpdates}`,
        {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ attendees }),
          signal: controller.signal,
        },
      );
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        console.warn(`[GoogleCalendarService] PATCH error ${res.status}: ${detail}`);
      }
      return { ok: res.ok, status: res.status };
    } finally {
      clearTimeout(timeout);
    }
  }
}

// ─── Internal types ────────────────────────────────────────────────────────────

interface ConferenceEntryPoint { uri?: string }
interface CalendarAttendee { email?: string; responseStatus?: string }

interface CalendarEvent {
  id?: string;
  hangoutLink?: string;
  attendees?: CalendarAttendee[];
  conferenceData?: { entryPoints?: ConferenceEntryPoint[] };
  start?: { dateTime?: string; date?: string };
  organizer?: { email?: string };
}

interface FoundEvent {
  event: CalendarEvent;
  calendarId: string;
}

export const googleCalendarService = new GoogleCalendarService();
