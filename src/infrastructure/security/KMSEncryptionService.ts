import { KeyManagementServiceClient } from '@google-cloud/kms';

export class KMSEncryptionService {
  private client: KeyManagementServiceClient;
  private keyName: string;

  constructor() {
    const projectId = process.env.GCP_PROJECT_ID || 'enlite-prd';
    const location = process.env.GCP_REGION || 'southamerica-west1';
    const keyRing = process.env.KMS_KEYRING || 'enlite-keyring';
    const keyName = process.env.KMS_KEY_NAME || 'worker-data-key';

    this.client = new KeyManagementServiceClient();
    this.keyName = this.client.cryptoKeyPath(projectId, location, keyRing, keyName);
  }

  async encrypt(plaintext: string): Promise<string> {
    if (!plaintext) return '';
    
    try {
      const [result] = await this.client.encrypt({
        name: this.keyName,
        plaintext: Buffer.from(plaintext, 'utf8'),
      });

      // Return base64 encoded ciphertext
      return Buffer.from(result.ciphertext || '').toString('base64');
    } catch (error) {
      console.error('KMS encryption error:', error);
      throw new Error('Failed to encrypt data');
    }
  }

  async decrypt(ciphertext: string): Promise<string> {
    if (!ciphertext) return '';
    
    try {
      const [result] = await this.client.decrypt({
        name: this.keyName,
        ciphertext: Buffer.from(ciphertext, 'base64'),
      });

      return Buffer.from(result.plaintext || '').toString('utf8');
    } catch (error) {
      console.error('KMS decryption error:', error);
      throw new Error('Failed to decrypt data');
    }
  }
}
