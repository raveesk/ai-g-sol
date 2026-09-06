import React, { useState, useEffect, useCallback } from 'react';
import { 
  auth,
  User, 
  onAuthStateChanged, 
  signInWithGoogle, 
  signOut 
} from './lib/firebase';
import { 
  subscribeToUserInteractions, 
  saveJournalEntry, 
  deleteJournalEntry, 
  deriveTitleFromPrompt 
} from './lib/db';
import { JournalEntry, ReflectionMode, Turn } from './types';
import { Navbar } from './components/Navbar';
import { LandingView } from './components/LandingView';
import { HistorySidebar } from './components/HistorySidebar';
import { ConversationThread } from './components/ConversationThread';
import { ReflectionComposer } from './components/ReflectionComposer';
import { SecurityBadgeModal } from './components/SecurityBadgeModal';
import { 
  ShieldCheck, 
  Sparkles, 
  Compass, 
  FileText, 
  Lightbulb, 
  Plus, 
  BookOpen, 
  AlertTriangle 
} from 'lucide-react';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // Journal entries state
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [activeEntry, setActiveEntry] = useState<JournalEntry | null>(null);
  const [activeMode, setActiveMode] = useState<ReflectionMode>('reflect');

  // AI & Persistence status
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isSummarizing, setIsSummarizing] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isQuotaError, setIsQuotaError] = useState<boolean>(false);
  const [lastPendingEntry, setLastPendingEntry] = useState<JournalEntry | null>(null);
  const [lastFailedPrompt, setLastFailedPrompt] = useState<string | null>(null);

  // UI state
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const [securityModalOpen, setSecurityModalOpen] = useState<boolean>(false);

  // 1. Firebase Auth state listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
      setAuthError(null);
    });
    return () => unsubscribe();
  }, []);

  // 2. Real-time Firestore sync strictly isolated to user.uid
  useEffect(() => {
    if (!user) {
      setEntries([]);
      setActiveEntry(null);
      return;
    }

    const unsubscribe = subscribeToUserInteractions(
      user.uid,
      (syncedEntries) => {
        setEntries(syncedEntries);
        // If active entry is being edited, update its latest state from database
        setActiveEntry((prev) => {
          if (!prev) return null;
          const found = syncedEntries.find((e) => e.id === prev.id);
          return found || prev;
        });
      },
      (err) => {
        console.warn('Firestore listener notice:', err);
        setSaveError('Unable to connect to your isolated Firestore collection. Please check permissions.');
      }
    );

    return () => unsubscribe();
  }, [user]);

  // Handle Google Sign In
  const handleSignIn = async () => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      await signInWithGoogle();
    } catch (err: unknown) {
      const errorMsg = (err as Error)?.message || 'Failed to authenticate with Google.';
      setAuthError(errorMsg);
    } finally {
      setAuthLoading(false);
    }
  };

  // Handle Sign Out
  const handleSignOut = async () => {
    try {
      await signOut();
      setActiveEntry(null);
      setEntries([]);
    } catch (err) {
      console.warn('Sign out notice:', err);
    }
  };

  // Start a fresh reflection
  const handleNewEntry = useCallback(() => {
    setActiveEntry(null);
    setSaveError(null);
    setLastPendingEntry(null);
    setSidebarOpen(false);
  }, []);

  // Select an entry from history
  const handleSelectEntry = useCallback((entry: JournalEntry) => {
    setActiveEntry(entry);
    setActiveMode(entry.mode || 'reflect');
    setSaveError(null);
    setLastPendingEntry(null);
    setSidebarOpen(false);
  }, []);

  // Delete an entry
  const handleDeleteEntry = async (entryId: string) => {
    if (!user) return;
    try {
      await deleteJournalEntry(user.uid, entryId);
      if (activeEntry?.id === entryId) {
        handleNewEntry();
      }
    } catch (err) {
      console.warn('Failed to delete entry notice:', err);
      setSaveError('Failed to remove journal entry from Firestore.');
    }
  };

  // Handle submitting a reflection turn to Gemini and persisting to Firestore
  const handleSubmitReflection = async (promptText: string, mode: ReflectionMode): Promise<boolean> => {
    if (!user) return false;
    setSaveError(null);
    setIsQuotaError(false);
    setIsGenerating(true);
    setLastFailedPrompt(promptText);

    const timestamp = Date.now();
    const userTurn: Turn = {
      id: `turn-user-${timestamp}`,
      role: 'user',
      content: promptText,
      timestamp,
    };

    // Construct current or new entry
    const entryId = activeEntry?.id || `entry-${timestamp}-${Math.random().toString(36).substring(2, 7)}`;
    const currentTurns = activeEntry ? [...activeEntry.turns, userTurn] : [userTurn];

    const tentativeEntry: JournalEntry = {
      id: entryId,
      userId: user.uid,
      title: activeEntry?.title || deriveTitleFromPrompt(promptText),
      mode,
      turns: currentTurns,
      summary: activeEntry?.summary,
      createdAt: activeEntry?.createdAt || timestamp,
      updatedAt: timestamp,
    };

    try {
      // 1. Call secure server-side Gemini API proxy
      const historyPayload = currentTurns.slice(0, -1).map((t) => ({
        role: t.role,
        content: t.content,
      }));

      const res = await fetch('/api/gemini/reflect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: promptText,
          history: historyPayload,
          mode,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        if (res.status === 429 || errorData.code === 'RESOURCE_EXHAUSTED' || errorData.isQuotaOrBilling) {
          setIsQuotaError(true);
        }
        throw new Error(errorData.error || `Server returned error (${res.status})`);
      }

      const data = await res.json();
      const modelText = data.text || 'No reflection generated.';
      const modelUsed = data.modelUsed || 'gemini-3.6-flash';

      const modelTurn: Turn = {
        id: `turn-gemini-${Date.now()}`,
        role: 'model',
        content: modelText,
        timestamp: Date.now(),
        modelUsed,
      };

      const finalEntry: JournalEntry = {
        ...tentativeEntry,
        turns: [...tentativeEntry.turns, modelTurn],
        updatedAt: Date.now(),
      };

      // 2. Guaranteed Transaction Verification: Save full interaction (prompt + Gemini response) to Firestore
      try {
        await saveJournalEntry(finalEntry);
        setActiveEntry(finalEntry);
        setLastPendingEntry(null);
        setLastFailedPrompt(null);
        return true;
      } catch (dbErr) {
        console.warn('Firestore save failure notice:', dbErr);
        setLastPendingEntry(finalEntry);
        setSaveError('AI generated response, but saving to Firestore failed. Your entry is cached—click "Retry Save".');
        return false;
      }
    } catch (err: unknown) {
      console.warn('Reflection flow notice:', err);
      const errMsg = (err as Error)?.message || 'Failed to generate reflection with Gemini.';
      if (
        errMsg.includes('depleted') ||
        errMsg.includes('429') ||
        errMsg.includes('quota') ||
        errMsg.includes('RESOURCE_EXHAUSTED')
      ) {
        setIsQuotaError(true);
      }
      setSaveError(errMsg);
      setLastPendingEntry(tentativeEntry);
      return false; // Do not clear user input buffer!
    } finally {
      setIsGenerating(false);
    }
  };

  // Allows saving the reflection directly to Firestore if AI quota is exhausted or offline
  const handleSaveDirectlyWithoutAi = async (promptText: string): Promise<boolean> => {
    if (!user || !promptText.trim()) return false;
    setIsGenerating(true);
    setSaveError(null);

    const timestamp = Date.now();
    const userTurn: Turn = {
      id: `turn-user-${timestamp}`,
      role: 'user',
      content: promptText.trim(),
      timestamp,
    };

    const entryId = activeEntry?.id || `entry-${timestamp}-${Math.random().toString(36).substring(2, 7)}`;
    const currentTurns = activeEntry ? [...activeEntry.turns, userTurn] : [userTurn];

    const finalEntry: JournalEntry = {
      id: entryId,
      userId: user.uid,
      title: activeEntry?.title || deriveTitleFromPrompt(promptText),
      mode: activeMode,
      turns: currentTurns,
      summary: activeEntry?.summary,
      createdAt: activeEntry?.createdAt || timestamp,
      updatedAt: timestamp,
    };

    try {
      await saveJournalEntry(finalEntry);
      setActiveEntry(finalEntry);
      setLastPendingEntry(null);
      setLastFailedPrompt(null);
      setIsQuotaError(false);
      return true;
    } catch (dbErr) {
      console.warn('Direct Firestore save failure notice:', dbErr);
      setSaveError('Failed to save reflection directly to Firestore. Please check your network connection.');
      return false;
    } finally {
      setIsGenerating(false);
    }
  };

  // Retry generating the reflection with Gemini for the last failed prompt
  const handleRetryWithGemini = async () => {
    if (!lastFailedPrompt) return;
    await handleSubmitReflection(lastFailedPrompt, activeMode);
  };

  // Retry saving to Firestore if previously failed
  const handleRetrySave = async () => {
    if (!lastPendingEntry) return;
    try {
      await saveJournalEntry(lastPendingEntry);
      setActiveEntry(lastPendingEntry);
      setSaveError(null);
      setLastPendingEntry(null);
    } catch (err) {
      console.warn('Retry save notice:', err);
      setSaveError('Retry failed. Please ensure your network is connected and Firestore is accessible.');
    }
  };

  // Generate quick AI summary of current entry
  const handleGenerateSummary = async () => {
    if (!activeEntry || !user || isSummarizing) return;
    setIsSummarizing(true);
    try {
      const fullText = activeEntry.turns.map((t) => `${t.role}: ${t.content}`).join('\n\n');
      const res = await fetch('/api/gemini/summarize-entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: fullText }),
      });

      if (!res.ok) throw new Error('Failed to generate summary');
      const data = await res.json();
      if (data.summary) {
        const updated: JournalEntry = {
          ...activeEntry,
          summary: data.summary,
          updatedAt: Date.now(),
        };
        await saveJournalEntry(updated);
        setActiveEntry(updated);
      }
    } catch (err) {
      console.warn('Summary notice:', err);
    } finally {
      setIsSummarizing(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col font-sans selection:bg-amber-500/20 selection:text-amber-200">
      {/* Top Navigation */}
      <Navbar
        user={user}
        onSignOut={handleSignOut}
        onNewEntry={handleNewEntry}
        onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
        onOpenSecurityModal={() => setSecurityModalOpen(true)}
        sidebarOpen={sidebarOpen}
        activeEntryId={activeEntry?.id || null}
      />

      {/* Main Content Area */}
      {!user ? (
        <LandingView
          onSignIn={handleSignIn}
          isLoading={authLoading}
          authError={authError}
          onOpenSecurityModal={() => setSecurityModalOpen(true)}
        />
      ) : (
        <div className="flex-1 flex max-w-7xl w-full mx-auto overflow-hidden">
          {/* History Sidebar */}
          <HistorySidebar
            entries={entries}
            activeEntryId={activeEntry?.id || null}
            onSelectEntry={handleSelectEntry}
            onDeleteEntry={handleDeleteEntry}
            isOpen={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
          />

          {/* Active Canvas / Workspace */}
          <main className="flex-1 flex flex-col min-w-0 h-[calc(100vh-4rem)] overflow-hidden bg-stone-950">
            {/* Canvas Header */}
            <div className="px-4 sm:px-8 py-3.5 border-b border-stone-800/80 bg-stone-900/40 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm sm:text-base font-semibold text-stone-100 truncate">
                    {activeEntry ? activeEntry.title : 'New Reflection'}
                  </h2>
                  {activeEntry?.summary && (
                    <span className="hidden lg:inline text-[10px] px-2 py-0.5 rounded bg-sky-950/80 text-sky-300 border border-sky-800/50">
                      Summarized
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-[11px] text-stone-400 mt-0.5">
                  <span className="flex items-center gap-1 text-emerald-400">
                    <ShieldCheck className="w-3 h-3" />
                    Isolated path: <code className="text-stone-300 font-mono">/users/{user.uid.slice(0, 6)}.../interactions</code>
                  </span>
                </div>
              </div>

              {activeEntry && (
                <button
                  id="btn-fresh-canvas"
                  onClick={handleNewEntry}
                  className="hidden sm:flex items-center gap-1.5 text-xs text-stone-400 hover:text-stone-200 px-2.5 py-1 rounded-lg hover:bg-stone-800 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Start Fresh</span>
                </button>
              )}
            </div>

            {/* Scrollable Conversation Stream */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6">
              {activeEntry && activeEntry.turns.length > 0 ? (
                <div className="max-w-3xl mx-auto">
                  {/* Summary Callout Banner if present */}
                  {activeEntry.summary && (
                    <div 
                      id="entry-summary-banner"
                      className="mb-6 p-4 rounded-xl bg-stone-900 border border-stone-800 border-l-2 border-l-amber-500 shadow-xs"
                    >
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-400 mb-1">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Key Insight &amp; Summary</span>
                      </div>
                      <p className="text-xs text-stone-300 leading-relaxed">
                        {activeEntry.summary}
                      </p>
                    </div>
                  )}

                  <ConversationThread
                    turns={activeEntry.turns}
                    isGenerating={isGenerating}
                    onGenerateSummary={handleGenerateSummary}
                    isSummarizing={isSummarizing}
                    hasSummary={Boolean(activeEntry.summary)}
                  />
                </div>
              ) : (
                /* Empty state / Welcome prompt */
                <div className="max-w-2xl mx-auto text-center py-10 sm:py-16 space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-amber-600/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto shadow-inner">
                    <Compass className="w-6 h-6" />
                  </div>
                  <div className="space-y-1.5">
                    <h3 className="text-base sm:text-lg font-semibold text-stone-100">
                      Welcome to your Mindful Journal
                    </h3>
                    <p className="text-xs sm:text-sm text-stone-400 max-w-md mx-auto leading-relaxed">
                      Begin by journaling a thought, reflecting on an event, or unpacking a challenge. 
                      Gemini 3.6 Flash will converse with you and save your reflections securely in Firestore.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Sticky Composer */}
            <div className="p-4 sm:px-8 sm:pb-6 bg-stone-950/95 border-t border-stone-800/80">
              <div className="max-w-3xl mx-auto">
                <ReflectionComposer
                  onSubmit={handleSubmitReflection}
                  isGenerating={isGenerating}
                  activeMode={activeMode}
                  onModeChange={setActiveMode}
                  hasTurns={Boolean(activeEntry && activeEntry.turns.length > 0)}
                  saveError={saveError}
                  isQuotaError={isQuotaError}
                  onRetrySave={handleRetrySave}
                  onSaveDirectlyWithoutAi={handleSaveDirectlyWithoutAi}
                  onRetryWithGemini={lastFailedPrompt ? handleRetryWithGemini : undefined}
                />
              </div>
            </div>
          </main>
        </div>
      )}

      {/* Security Architecture Modal */}
      <SecurityBadgeModal
        isOpen={securityModalOpen}
        onClose={() => setSecurityModalOpen(false)}
        userId={user?.uid}
      />
    </div>
  );
}
