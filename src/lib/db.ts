import { 
  collection, 
  doc, 
  setDoc, 
  updateDoc,
  deleteDoc, 
  onSnapshot, 
  query, 
  where,
  orderBy,
  limit,
  getDocs
} from 'firebase/firestore';
import { db } from './firebase';
import { JournalEntry, Turn, EntryInsights } from '../types';

/**
 * Recursively strips all undefined keys and values from objects and arrays
 * before any Firestore write, ensuring complete database persistence hygiene.
 */
export function sanitizePayload<T>(obj: T): T {
  const clean = (val: any): any => {
    if (val === undefined) return null;
    if (val === null || typeof val !== 'object') return val;
    if (Array.isArray(val)) {
      return val
        .map(clean)
        .filter((item) => item !== undefined);
    }
    const res: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined) {
        res[k] = clean(v);
      }
    }
    return res;
  };
  return clean(obj);
}

/**
 * Derives a clean, readable journal title from the initial prompt.
 */
export function deriveTitleFromPrompt(prompt: string): string {
  const cleaned = prompt.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= 40) return cleaned || 'Untitled Reflection';
  return cleaned.slice(0, 37) + '...';
}

/**
 * Saves or updates a journal interaction in the user's isolated collection:
 * /users/{userId}/interactions/{interactionId}
 */
export async function saveJournalEntry(entry: JournalEntry): Promise<void> {
  if (!entry.userId) {
    throw new Error('User ID is required to persist interaction');
  }
  if (!entry.id) {
    throw new Error('Interaction ID is required to persist interaction');
  }

  const userInteractionsRef = collection(db, 'users', entry.userId, 'interactions');
  const entryDocRef = doc(userInteractionsRef, entry.id);

  const cleanPayload = sanitizePayload({
    ...entry,
    updatedAt: Date.now(),
  });

  await setDoc(entryDocRef, cleanPayload, { merge: true });
}

/**
 * Updates structured metadata (mood, energy, themes) on the same interaction document.
 * Strips undefined before writing to Firestore.
 */
export async function updateEntryMetadata(
  userId: string,
  entryId: string,
  metadata: EntryInsights
): Promise<void> {
  if (!userId || !entryId) return;
  const entryDocRef = doc(db, 'users', userId, 'interactions', entryId);

  const cleanPayload = sanitizePayload({
    mood: metadata.mood,
    energy: metadata.energy,
    themes: metadata.themes,
    insights: {
      ...metadata,
      extractedAt: Date.now(),
    },
    updatedAt: Date.now(),
  });

  await updateDoc(entryDocRef, cleanPayload);
}

/**
 * Reads the signed-in user's last 7 days of entries from users/{uid}/interactions.
 * Scoped strictly to the authenticated caller only, capped at 50 documents.
 */
export async function getWeeklyEntries(userId: string): Promise<JournalEntry[]> {
  if (!userId) return [];
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const interactionsRef = collection(db, 'users', userId, 'interactions');

  // Query scoped to users/{uid}/interactions capped at 50 documents
  const q = query(
    interactionsRef,
    where('updatedAt', '>=', sevenDaysAgo),
    orderBy('updatedAt', 'desc'),
    limit(50)
  );

  try {
    const snapshot = await getDocs(q);
    const items: JournalEntry[] = [];
    snapshot.forEach((d) => {
      const data = d.data() as JournalEntry;
      items.push({
        ...data,
        id: d.id,
      });
    });
    return items;
  } catch (err) {
    // If compound index isn't created yet for where + orderBy, fallback to orderBy with in-memory filter
    console.warn('Fallback weekly query notice:', err);
    const fallbackQ = query(interactionsRef, orderBy('updatedAt', 'desc'), limit(50));
    const snapshot = await getDocs(fallbackQ);
    const items: JournalEntry[] = [];
    snapshot.forEach((d) => {
      const data = d.data() as JournalEntry;
      if ((data.updatedAt || data.createdAt || 0) >= sevenDaysAgo) {
        items.push({
          ...data,
          id: d.id,
        });
      }
    });
    return items.slice(0, 50);
  }
}

/**
 * Appends a new turn to an existing or new journal entry and persists it.
 */
export async function appendTurnAndSave(
  entry: JournalEntry,
  newTurn: Turn
): Promise<JournalEntry> {
  const updatedTurns = [...entry.turns, newTurn];
  const updatedEntry: JournalEntry = {
    ...entry,
    turns: updatedTurns,
    updatedAt: Date.now(),
  };

  await saveJournalEntry(updatedEntry);
  return updatedEntry;
}

/**
 * Deletes a journal interaction strictly from the user's isolated path.
 */
export async function deleteJournalEntry(userId: string, entryId: string): Promise<void> {
  if (!userId || !entryId) return;
  const docRef = doc(db, 'users', userId, 'interactions', entryId);
  await deleteDoc(docRef);
}

/**
 * Subscribes to real-time updates for all interactions belonging strictly to the current user.
 */
export function subscribeToUserInteractions(
  userId: string,
  onUpdate: (entries: JournalEntry[]) => void,
  onError: (error: Error) => void
): () => void {
  if (!userId) {
    onUpdate([]);
    return () => {};
  }

  const interactionsRef = collection(db, 'users', userId, 'interactions');
  const q = query(interactionsRef, orderBy('updatedAt', 'desc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const items: JournalEntry[] = [];
      snapshot.forEach((d) => {
        const data = d.data() as JournalEntry;
        items.push({
          ...data,
          id: d.id,
        });
      });
      onUpdate(items);
    },
    (err) => {
      console.warn('Firestore subscription notice:', err);
      onError(err);
    }
  );
}
