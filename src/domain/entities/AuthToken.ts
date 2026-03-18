export interface AuthToken {
  accessToken: string;
  idToken: string;
  expiresAt: Date;
  refreshToken?: string;
}

export interface GoogleCredential {
  credential: string;
  clientId: string;
}
