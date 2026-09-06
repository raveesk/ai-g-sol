import { Request, Response, NextFunction } from 'express';
import { initializeApp, getApps, App } from 'firebase-admin/app';
import { getAuth, DecodedIdToken } from 'firebase-admin/auth';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';

// Extend Express Request interface to optionally include authenticated admin user
declare global {
  namespace Express {
    interface Request {
      adminUser?: DecodedIdToken;
    }
  }
}

let firebaseAdminApp: App | null = null;
let adminFirestoreInstance: Firestore | null = null;

/**
 * Lazily initializes and returns the Firebase Admin App.
 * Resolves project ID dynamically from environment variables or firebase-applet-config.json.
 */
export function getFirebaseAdminApp(): App {
  if (firebaseAdminApp) {
    return firebaseAdminApp;
  }

  const existingApps = getApps();
  if (existingApps.length > 0 && existingApps[0]) {
    firebaseAdminApp = existingApps[0];
    return firebaseAdminApp;
  }

  let projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT;

  if (!projectId) {
    try {
      const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
      if (fs.existsSync(configPath)) {
        const rawConfig = fs.readFileSync(configPath, 'utf8');
        const parsed = JSON.parse(rawConfig);
        if (parsed.projectId) {
          projectId = parsed.projectId;
        }
      }
    } catch {
      // Fallback silently if config cannot be read
    }
  }

  firebaseAdminApp = initializeApp({
    projectId: projectId || undefined,
  });

  return firebaseAdminApp;
}

/**
 * Returns the Firebase Admin Firestore instance, respecting configured database ID.
 */
export function getAdminFirestore(): Firestore {
  if (adminFirestoreInstance) {
    return adminFirestoreInstance;
  }

  const app = getFirebaseAdminApp();
  let databaseId: string | undefined;

  try {
    const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const rawConfig = fs.readFileSync(configPath, 'utf8');
      const parsed = JSON.parse(rawConfig);
      if (parsed.firestoreDatabaseId) {
        databaseId = parsed.firestoreDatabaseId;
      }
    }
  } catch {
    // Fallback if config cannot be read
  }

  adminFirestoreInstance = databaseId ? getFirestore(app, databaseId) : getFirestore(app);
  return adminFirestoreInstance;
}

/**
 * Server-side Express middleware: requireAdmin
 * 
 * - Extracts Bearer token from the Authorization header
 * - Verifies token with Firebase Admin SDK (verifyIdToken)
 * - Checks verified UID against comma-separated process.env.ADMIN_UIDS
 * - Fails closed (rejects with 403) if ADMIN_UIDS is unset, empty, or token is invalid/unauthorized
 * - Returns a generic error response to the client; logs detailed reasons server-side only
 * - Guarantees process.env.ADMIN_UIDS is never exposed or returned
 */
export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // 1. Validate Authorization header presence
    const authHeader = req.headers.authorization || req.headers['authorization'];
    if (!authHeader || typeof authHeader !== 'string') {
      console.warn('[requireAdmin] Access denied: Missing or non-string Authorization header');
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // 2. Validate Bearer scheme and token format
    const parts = authHeader.trim().split(/\s+/);
    if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer' || !parts[1]) {
      console.warn('[requireAdmin] Access denied: Authorization header is malformed (expected "Bearer <token>")');
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const token = parts[1];

    // 3. Fail-closed check: Ensure ADMIN_UIDS is set and non-empty
    const rawAdminUids = process.env.ADMIN_UIDS;
    if (!rawAdminUids || typeof rawAdminUids !== 'string' || !rawAdminUids.trim()) {
      console.warn('[requireAdmin] Access denied: ADMIN_UIDS environment variable is unset or empty. Failing closed.');
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Parse comma-separated UIDs
    const allowedAdminUids = rawAdminUids
      .split(',')
      .map((uid) => uid.trim())
      .filter((uid) => uid.length > 0);

    if (allowedAdminUids.length === 0) {
      console.warn('[requireAdmin] Access denied: Parsed ADMIN_UIDS list contains no valid entries. Failing closed.');
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // 4. Verify token with Firebase Admin SDK
    const adminApp = getFirebaseAdminApp();
    const auth = getAuth(adminApp);

    let decodedToken: DecodedIdToken;
    try {
      decodedToken = await auth.verifyIdToken(token);
    } catch (verifyError: unknown) {
      const errMsg = verifyError instanceof Error ? verifyError.message : String(verifyError);
      console.warn('[requireAdmin] Access denied: Token verification failed:', errMsg);
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // 5. Verify that decoded token contains a valid UID
    const verifiedUid = decodedToken?.uid;
    if (!verifiedUid || typeof verifiedUid !== 'string') {
      console.warn('[requireAdmin] Access denied: Decoded token does not contain a valid string UID');
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // 6. Check verified UID against allowed admin list
    if (!allowedAdminUids.includes(verifiedUid)) {
      console.warn(
        `[requireAdmin] Access denied: UID "${verifiedUid}" is not in the configured ADMIN_UIDS whitelist`
      );
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // 7. Authorization successful: attach decoded token and proceed
    req.adminUser = decodedToken;
    next();
  } catch (unexpectedError: unknown) {
    // Catch-all fail-safe to prevent unhandled exceptions from leaking server details
    const errMsg = unexpectedError instanceof Error ? unexpectedError.message : String(unexpectedError);
    console.error('[requireAdmin] Unexpected error during admin authorization:', errMsg);
    res.status(403).json({ error: 'Access denied' });
  }
}
