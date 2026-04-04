/**
 * ITalentumApiClient — domain interface for the Talentum.chat outbound API.
 *
 * Covers the prescreening project lifecycle: create, read, delete, list.
 * All methods are asynchronous and throw on HTTP/auth errors.
 */

// ─────────────────────────────────────────────────────────────────
// Input / Output types
// ─────────────────────────────────────────────────────────────────

export interface TalentumQuestion {
  question: string;
  type: 'text';
  responseType: ('text' | 'audio')[];
  desiredResponse: string;
  weight: number; // 1–10
  required: boolean;
  analyzed: boolean;
  earlyStoppage: boolean;
}

export interface TalentumFaq {
  question: string;
  answer: string;
}

export interface CreatePrescreeningInput {
  title: string;
  description: string;
  questions: TalentumQuestion[];
  faq?: TalentumFaq[];
  askForCv?: boolean;
  cvRequired?: boolean;
  linkedinRequired?: boolean;
}

export interface CreatePrescreeningResult {
  projectId: string;
  publicId: string;
}

// Question as it comes back from GET — extends base with server-assigned ID
export type TalentumQuestionWithId = TalentumQuestion & { questionId: string };

export interface TalentumProject {
  projectId: string;
  publicId: string;
  title: string;
  description: string;
  whatsappUrl: string;
  slug: string;
  active: boolean;
  timestamp: string;
  questions: TalentumQuestionWithId[];
  faq: TalentumFaq[];
}

// ─────────────────────────────────────────────────────────────────
// Interface
// ─────────────────────────────────────────────────────────────────

export interface ListPrescreeningsOpts {
  page?: number;
  onlyOwnedByUser?: boolean;
}

export interface ITalentumApiClient {
  /** Create a new prescreening project. Returns the server-assigned IDs. */
  createPrescreening(input: CreatePrescreeningInput): Promise<CreatePrescreeningResult>;

  /** Fetch a prescreening project by its server-assigned projectId. */
  getPrescreening(projectId: string): Promise<TalentumProject>;

  /** Permanently delete a prescreening project. */
  deletePrescreening(projectId: string): Promise<void>;

  /** List prescreening projects for a single page. */
  listPrescreenings(opts?: ListPrescreeningsOpts): Promise<{ projects: TalentumProject[]; count: number }>;

  /** Iterate all pages and return every project. */
  listAllPrescreenings(): Promise<TalentumProject[]>;
}
