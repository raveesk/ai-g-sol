export type ReflectionMode = 'reflect' | 'summarize' | 'brainstorm';

export type MoodType = 'positive' | 'neutral' | 'negative' | 'mixed';

export interface EntryInsights {
  mood: MoodType;
  energy: number | null; // 1 to 5 integer or null
  themes: string[]; // 1 to 3 short lowercase theme strings
  extractedAt?: number;
}

export interface Turn {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: number;
  modelUsed?: string;
}

export interface JournalEntry {
  id: string;
  userId: string;
  title: string;
  mode: ReflectionMode;
  turns: Turn[];
  summary?: string;
  tags?: string[];
  createdAt: number;
  updatedAt: number;
  // Extracted structured metadata
  mood?: MoodType;
  energy?: number | null;
  themes?: string[];
  insights?: EntryInsights;
}

export interface WeeklySynthesisResult {
  synthesis: string;
  entryCount: number;
  periodStart: number;
  periodEnd: number;
  generatedAt: number;
  modelUsed?: string;
}

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}
