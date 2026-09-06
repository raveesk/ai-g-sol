import { 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  orderBy 
} from 'firebase/firestore';
import { db } from './firebase';
import { JournalEntry, Turn } from '../types';

/**
 * Strips all undefined keys recursively to prevent Firestore serialization crashes.
 * Complying with strict database persistence hygiene.
 */
export function sanitizePayload<T>(obj: T): T {
  return JSON.parse(
    JSON.stringify(obj, (_, value) => (value === undefined ? null : value))
  );
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
