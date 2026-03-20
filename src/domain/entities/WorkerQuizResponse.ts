export interface WorkerQuizResponse {
  id: string;
  workerId: string;
  sectionId: string;
  questionId: string;
  answerId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateQuizResponseDTO {
  workerId: string;
  sectionId: string;
  questionId: string;
  answerId: string;
}
