import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { 
  Sparkles, 
  User as UserIcon, 
  Copy, 
  Check, 
  Cpu, 
  Clock, 
  FileText,
  Loader2
} from 'lucide-react';
import { Turn } from '../types';

interface ConversationThreadProps {
  turns: Turn[];
  isGenerating: boolean;
  onGenerateSummary?: () => void;
  isSummarizing?: boolean;
  hasSummary?: boolean;
}

export const ConversationThread: React.FC<ConversationThreadProps> = ({
  turns,
  isGenerating,
  onGenerateSummary,
  isSummarizing,
  hasSummary,
}) => {
  const [copiedTurnId, setCopiedTurnId] = useState<string | null>(null);

  const handleCopy = (turnId: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedTurnId(turnId);
    setTimeout(() => setCopiedTurnId(null), 2000);
  };

  const formatTime = (timestamp: number) => {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6 pb-6">
      {turns.map((turn, index) => {
        const isUser = turn.role === 'user';
        const isCopied = copiedTurnId === turn.id;

        return (
          <div
            key={turn.id || index}
            id={`turn-item-${turn.id || index}`}
            className={`flex flex-col gap-2 ${
              isUser ? 'items-end' : 'items-start'
            }`}
          >
            {/* Meta indicator */}
            <div className="flex items-center gap-2 px-1 text-[11px] text-stone-400">
              {isUser ? (
                <>
                  <Clock className="w-3 h-3 text-stone-500" />
                  <span>{formatTime(turn.timestamp)}</span>
                  <span className="font-medium text-stone-300">You (Journal Entry)</span>
                </>
              ) : (
                <>
                  <span className="flex items-center gap-1 font-semibold text-amber-400">
                    <Sparkles className="w-3 h-3" />
                    Gemini
                  </span>
                  {turn.modelUsed && (
                    <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-stone-800 text-stone-300 font-mono">
                      <Cpu className="w-2.5 h-2.5 text-amber-400" />
                      {turn.modelUsed}
                    </span>
                  )}
                  <span>•</span>
                  <span>{formatTime(turn.timestamp)}</span>
                </>
              )}
            </div>

            {/* Bubble / Card */}
            <div
              className={`relative max-w-[92%] sm:max-w-[85%] rounded-2xl p-4 sm:p-5 text-sm transition-all shadow-xs ${
                isUser
                  ? 'bg-amber-600/15 border border-amber-500/30 text-stone-100 rounded-tr-xs'
                  : 'bg-stone-900 border border-stone-800 text-stone-200 rounded-tl-xs'
              }`}
            >
              {isUser ? (
                <div className="whitespace-pre-wrap leading-relaxed text-stone-100">
                  {turn.content}
                </div>
              ) : (
                <div className="prose prose-invert prose-stone max-w-none text-stone-200 text-sm leading-relaxed [&>p]:mb-3 [&>ul]:list-disc [&>ul]:pl-5 [&>ol]:list-decimal [&>ol]:pl-5 [&>li]:mb-1 [&>h3]:text-stone-100 [&>h3]:font-semibold [&>h3]:mt-3 [&>h3]:mb-1">
                  <ReactMarkdown>{turn.content}</ReactMarkdown>
                </div>
              )}

              {/* Action row */}
              <div className="mt-3 pt-2.5 border-t border-stone-800/60 flex items-center justify-between text-[11px] text-stone-400">
                <span className="text-[10px] text-stone-500 font-mono">
                  {turn.content.split(/\s+/).filter(Boolean).length} words
                </span>

                <button
                  id={`btn-copy-turn-${turn.id || index}`}
                  onClick={() => handleCopy(turn.id || String(index), turn.content)}
                  className="flex items-center gap-1 hover:text-stone-200 transition-colors p-1 rounded hover:bg-stone-800/80"
                  title="Copy text"
                >
                  {isCopied ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span className="text-emerald-400 text-[10px]">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span className="text-[10px]">Copy</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        );
      })}

      {/* Thinking state indicator */}
      {isGenerating && (
        <div 
          id="gemini-generating-indicator"
          className="flex items-start gap-3 p-4 rounded-2xl bg-stone-900/80 border border-stone-800 text-stone-300 max-w-[85%]"
        >
          <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
            <Sparkles className="w-4 h-4 animate-pulse" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-amber-400">Gemini 3.6 Flash</span>
              <span className="text-[10px] text-stone-500">Reflecting on your entry...</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-stone-400">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
              <span>Analyzing themes, context, and mindful insights</span>
            </div>
          </div>
        </div>
      )}

      {/* Quick summary button if thread has >= 2 turns and no summary yet */}
      {turns.length >= 2 && !hasSummary && onGenerateSummary && (
        <div className="pt-2 flex justify-center">
          <button
            id="btn-generate-ai-summary"
            onClick={onGenerateSummary}
            disabled={isSummarizing || isGenerating}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-stone-900 border border-stone-700 hover:border-amber-500/50 text-xs font-medium text-stone-300 hover:text-amber-300 transition-all shadow-xs disabled:opacity-50"
          >
            {isSummarizing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                <span>Distilling reflection summary...</span>
              </>
            ) : (
              <>
                <FileText className="w-3.5 h-3.5 text-amber-400" />
                <span>Distill into Key Summary</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};
