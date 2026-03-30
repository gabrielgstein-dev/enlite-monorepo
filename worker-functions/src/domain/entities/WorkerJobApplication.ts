export interface WorkerJobApplication {
  id: string;
  
  // Relationships
  workerId: string;
  jobPostingId: string;
  
  // Application status
  applicationStatus: ApplicationStatus;
  
  // Application data
  coverLetter?: string;
  
  // Match score (for future matching system)
  matchScore?: number;  // 0-100
  
  // Process tracking
  appliedAt: Date;
  reviewedAt?: Date;
  interviewScheduledAt?: Date;
  decisionAt?: Date;
  hiredAt?: Date;
  
  // Feedback
  rejectionReason?: string;
  internalNotes?: string;
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

export type ApplicationStatus = 
  | 'applied'              // Application submitted
  | 'under_review'         // Being reviewed
  | 'shortlisted'          // Pre-selected
  | 'interview_scheduled'  // Interview scheduled
  | 'approved'             // Approved for the position
  | 'rejected'             // Rejected
  | 'withdrawn'            // Worker withdrew application
  | 'hired';               // Worker was hired

export interface CreateWorkerJobApplicationDTO {
  workerId: string;
  jobPostingId: string;
  coverLetter?: string;
}

export interface UpdateWorkerJobApplicationDTO {
  id: string;
  applicationStatus?: ApplicationStatus;
  matchScore?: number;
  rejectionReason?: string;
  internalNotes?: string;
}

export interface WithdrawApplicationDTO {
  id: string;
  workerId: string;
}

/**
 * Funnel stage as displayed in the recruiter UI.
 * Mapped to systemic ApplicationStatus via FUNNEL_TO_STATUS.
 */
export type ApplicationFunnelStage =
  | 'APPLIED'
  | 'PRE_SCREENING'
  | 'INTERVIEW_SCHEDULED'
  | 'INTERVIEWED'
  | 'QUALIFIED'
  | 'REJECTED'
  | 'HIRED';

/**
 * Single source of truth for the mapping between the UI-facing funnel stage
 * and the systemic application status used by integrations.
 *
 * Decision documented in DECISIONS.md (Wave 5 — N6).
 */
export const FUNNEL_TO_STATUS: Record<ApplicationFunnelStage, ApplicationStatus> = {
  APPLIED:             'applied',
  PRE_SCREENING:       'under_review',
  INTERVIEW_SCHEDULED: 'interview_scheduled',
  INTERVIEWED:         'under_review',
  QUALIFIED:           'approved',
  REJECTED:            'rejected',
  HIRED:               'hired',
};
