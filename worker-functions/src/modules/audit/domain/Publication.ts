// =====================
// Publication
// =====================
export interface Publication {
  id: string;
  jobPostingId: string | null;
  channel: string | null;
  groupName: string | null;
  recruiterName: string | null;
  publishedAt: Date | null;
  observations: string | null;
  dedupHash: string;
  createdAt: Date;
}

export interface CreatePublicationDTO {
  jobPostingId?: string | null;
  channel?: string | null;
  groupName?: string | null;
  recruiterName?: string | null;
  publishedAt?: Date | null;
  observations?: string | null;
  dedupHash: string;
}
