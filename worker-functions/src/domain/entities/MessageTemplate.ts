export interface MessageTemplate {
  id: string;
  slug: string;
  name: string;
  body: string;       // ex: 'Olá {{name}}, encontramos uma vaga...'
  category: string | null;
  isActive: boolean;
  /** Twilio Content Template SID (HX...). Quando presente, usa a Content API. */
  contentSid: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpsertMessageTemplateDTO {
  slug: string;
  name: string;
  body: string;
  category?: string | null;
  isActive?: boolean;
  contentSid?: string | null;
}
