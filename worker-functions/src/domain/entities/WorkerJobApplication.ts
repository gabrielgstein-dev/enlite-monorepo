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
