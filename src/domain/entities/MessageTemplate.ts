export interface MessageTemplate {
  id: string;
  slug: string;
  name: string;
  body: string;       // ex: 'Olá {{name}}, encontramos uma vaga...'
  category: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpsertMessageTemplateDTO {
  slug: string;
  name: string;
  body: string;
  category?: string | null;
  isActive?: boolean;
}
