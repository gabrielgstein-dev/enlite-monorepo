export interface JobPosting {
  id: string;
  
  // Job details
  title: string;
  description: string;
  
  // Requirements (for matching)
  requiredProfession?: string;
  requiredExperienceYears?: string;
  requiredLanguages: string[];
  preferredAgeRange?: string;
  
  // Location
  city?: string;
  state?: string;
  country: 'AR' | 'BR';
  isRemote: boolean;
  
  // Compensation
  salaryRangeMin?: number;
  salaryRangeMax?: number;
  currency: 'ARS' | 'BRL' | 'USD';
  workSchedule?: string;  // 'full-time', 'part-time', 'flexible'
  
  // Configuration
  status: JobPostingStatus;
  maxApplicants?: number;
  currentApplicants: number;
  
  // Timestamps
  publishedAt?: Date;
  closesAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type JobPostingStatus = 
  | 'draft'    // Not published yet
  | 'active'   // Published and accepting applications
  | 'paused'   // Temporarily not accepting applications
  | 'closed'   // No longer accepting applications
  | 'filled';  // Position has been filled

export interface CreateJobPostingDTO {
  title: string;
  description: string;
  requiredProfession?: string;
  requiredExperienceYears?: string;
  requiredLanguages?: string[];
  preferredAgeRange?: string;
  city?: string;
  state?: string;
  country: 'AR' | 'BR';
  isRemote?: boolean;
  salaryRangeMin?: number;
  salaryRangeMax?: number;
  currency?: 'ARS' | 'BRL' | 'USD';
  workSchedule?: string;
  maxApplicants?: number;
}

export interface UpdateJobPostingDTO {
  id: string;
  title?: string;
  description?: string;
  status?: JobPostingStatus;
  maxApplicants?: number;
  closesAt?: Date;
}
