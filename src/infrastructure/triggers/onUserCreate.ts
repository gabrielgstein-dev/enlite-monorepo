import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { DatabaseConnection } from '../database/DatabaseConnection';

export const onUserCreate = functions.auth.user().onCreate(async (user) => {
  const db = DatabaseConnection.getInstance();
  const client = await db.getPool().connect();
  
  try {
    await client.query('BEGIN');
    
    // Default role for new users (can be customized via custom claims later)
    const defaultRole = 'worker';
    
    // 1. Create base user record
    await client.query(`
      INSERT INTO users (firebase_uid, email, display_name, photo_url, role, email_verified)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (firebase_uid) DO UPDATE
      SET email = EXCLUDED.email,
          display_name = EXCLUDED.display_name,
          photo_url = EXCLUDED.photo_url,
          email_verified = EXCLUDED.email_verified,
          updated_at = NOW()
    `, [
      user.uid,
      user.email,
      user.displayName || null,
      user.photoURL || null,
      defaultRole,
      user.emailVerified
    ]);
    
    // 2. Create role-specific extension record
    if (defaultRole === 'worker') {
      await client.query(`
        INSERT INTO workers_extension (user_id)
        VALUES ($1)
        ON CONFLICT (user_id) DO NOTHING
      `, [user.uid]);
    }
    
    // 3. Set custom claims in Firebase Auth
    await admin.auth().setCustomUserClaims(user.uid, {
      role: defaultRole
    });
    
    await client.query('COMMIT');
    
    functions.logger.info('User created successfully', {
      uid: user.uid,
      email: user.email,
      role: defaultRole
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    functions.logger.error('Error creating user', {
      uid: user.uid,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  } finally {
    client.release();
  }
});
