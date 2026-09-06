import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, 
  Sparkles, 
  Compass, 
  FileText, 
  Lightbulb, 
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { ReflectionMode } from '../types';

interface ReflectionComposerProps {
  onSubmit: (prompt: string, mode: ReflectionMode) => Promise<boolean>;
  isGenerating: boolean;
  activeMode: ReflectionMode;
  onModeChange: (mode: ReflectionMode) => void;
  hasTurns: boolean;
  saveError: string | null;
  isQuotaError?: boolean;
  onRetrySave?: () => void;
  onSaveDirectlyWithoutAi?: (prompt: string) => Promise<boolean>;
  onRetryWithGemini?: () => void;
}

const INSPIRATION_PROMPTS = [
  'What decision am I weighing right now, and what is making it difficult?',
  'Reflecting on a recent conversation that challenged my perspective...',
  'What is one small win from this week that I have not paused to celebrate?',
  'Brainstorming 3 unconventional ways to approach my current project block.',
];

export const ReflectionComposer: React.FC<ReflectionComposerProps> = ({
  onSubmit,
  isGenerating,
  activeMode,
  onModeChange,
  hasTurns,
  saveError,
  isQuotaError,
  onRetrySave,
  onSaveDirectlyWithoutAi,
  onRetryWithGemini,
}) => {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  }, [input]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isGenerating) return;

    // Strict Input Buffer Preservation: Only clear when persistence settles with confirmation
    const success = await onSubmit(trimmed, activeMode);
    if (success) {
      setInput('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleSaveDirectly = async () => {
    const trimmed = input.trim();
    if (!trimmed || isGenerating || !onSaveDirectlyWithoutAi) return;
    const success = await onSaveDirectlyWithoutAi(trimmed);
    if (success) {
      setInput('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="space-y-3">
      {/* Error / Retry Banner */}
      {saveError && (
        <div
          id="persistence-error-banner"
          className="p-3.5 bg-rose-950/80 border border-rose-800/90 rounded-xl space-y-2 text-xs text-rose-200 shadow-sm"
        >
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-1 flex-1">
              <p className="font-medium text-rose-200 leading-relaxed">
                {saveError}
              </p>
              {isQuotaError && (
                <p className="text-[11px] text-rose-300/80">
                  Your typed reflection is safely preserved below. You can save it directly to Firestore without AI, or top up your credits in Google AI Studio.
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-rose-900/60 justify-end">
            {isQuotaError && onSaveDirectlyWithoutAi && input.trim() && (
              <button
                id="btn-save-without-ai"
                type="button"
                onClick={handleSaveDirectly}
                disabled={isGenerating}
                className="px-2.5 py-1 rounded bg-stone-800 hover:bg-stone-700 text-stone-200 font-medium text-xs flex items-center gap-1.5 transition-colors"
              >
                <span>Save Entry (Directly)</span>
              </button>
            )}

            {isQuotaError && (
              <a
                id="link-manage-billing"
                href="https://ai.studio/projects"
                target="_blank"
                rel="noopener noreferrer"
                className="px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-500 text-stone-950 font-semibold text-xs flex items-center gap-1 transition-colors"
              >
                <span>Manage Billing in AI Studio</span>
              </a>
            )}

            {onRetryWithGemini && (
              <button
                id="btn-retry-gemini"
                type="button"
                onClick={onRetryWithGemini}
                disabled={isGenerating}
                className="px-2.5 py-1 rounded bg-rose-900 hover:bg-rose-800 text-rose-100 font-medium text-xs flex items-center gap-1 transition-colors"
              >
                <RefreshCw className={`w-3 h-3 ${isGenerating ? 'animate-spin' : ''}`} />
                <span>Retry Gemini</span>
              </button>
            )}

            {onRetrySave && (
              <button
                id="btn-retry-firestore-save"
                type="button"
                onClick={onRetrySave}
                disabled={isGenerating}
                className="px-2.5 py-1 rounded bg-rose-900 hover:bg-rose-800 text-rose-100 font-medium text-xs flex items-center gap-1 transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Retry Firestore Save</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Mode Switcher Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1.5 p-1 bg-stone-900 border border-stone-800 rounded-xl">
          <button
            id="mode-tab-reflect"
            type="button"
            onClick={() => onModeChange('reflect')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
              activeMode === 'reflect'
                ? 'bg-amber-600 text-stone-950 shadow-xs'
                : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800/50'
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            <span>Deep Reflection</span>
          </button>

          <button
            id="mode-tab-summarize"
            type="button"
            onClick={() => onModeChange('summarize')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
              activeMode === 'summarize'
                ? 'bg-sky-600 text-stone-950 shadow-xs'
                : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800/50'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Summarize</span>
          </button>

          <button
            id="mode-tab-brainstorm"
            type="button"
            onClick={() => onModeChange('brainstorm')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all ${
              activeMode === 'brainstorm'
                ? 'bg-emerald-600 text-stone-950 shadow-xs'
                : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800/50'
            }`}
          >
            <Lightbulb className="w-3.5 h-3.5" />
            <span>Brainstorm</span>
          </button>
        </div>

        <span className="text-[11px] text-stone-500 hidden sm:inline">
          Press <kbd className="px-1.5 py-0.5 rounded bg-stone-800 border border-stone-700 font-mono text-[10px] text-stone-300">⌘/Ctrl + Enter</kbd> to reflect
        </span>
      </div>

      {/* Starter inspiration prompts if canvas is fresh */}
      {!hasTurns && (
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center gap-1.5 text-[11px] text-stone-400 font-medium">
            <Sparkles className="w-3 h-3 text-amber-400" />
            <span>Starter Journal Prompts</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {INSPIRATION_PROMPTS.map((prompt, i) => (
              <button
                key={i}
                id={`btn-starter-prompt-${i}`}
                type="button"
                onClick={() => setInput(prompt)}
                className="text-left p-2.5 rounded-lg bg-stone-900/60 border border-stone-800 hover:border-amber-500/40 hover:bg-stone-800/50 text-[11px] text-stone-300 leading-snug transition-colors"
              >
                "{prompt}"
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Composer Input Box */}
      <form onSubmit={handleSubmit} className="relative">
        <div className="p-3 bg-stone-900 border border-stone-800 rounded-2xl focus-within:border-amber-500/60 focus-within:ring-1 focus-within:ring-amber-500/30 transition-all shadow-inner">
          <textarea
            id="textarea-reflection-input"
            ref={textareaRef}
            rows={hasTurns ? 2 : 4}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              hasTurns
                ? 'Continue reflecting with Gemini, add more context, or ask a question...'
                : 'Write your thoughts, daily reflection, or a dilemma you wish to explore...'
            }
            className="w-full bg-transparent text-sm text-stone-100 placeholder-stone-500 resize-none focus:outline-none leading-relaxed min-h-[44px]"
          />

          <div className="pt-2 border-t border-stone-800/60 flex items-center justify-between text-xs">
            <span className="text-[11px] text-stone-500 font-mono">
              {input.length} characters
            </span>

            <button
              id="btn-submit-reflection"
              type="submit"
              disabled={!input.trim() || isGenerating}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-stone-950 font-medium text-xs transition-all active:scale-98 disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
            >
              {isGenerating ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-stone-950 border-t-transparent rounded-full animate-spin" />
                  <span>Reflecting...</span>
                </>
              ) : (
                <>
                  <span>Send Reflection</span>
                  <Send className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
