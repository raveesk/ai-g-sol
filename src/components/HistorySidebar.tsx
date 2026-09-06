import React, { useState, useMemo } from 'react';
import { 
  History, 
  Search, 
  Trash2, 
  Calendar, 
  MessageSquare, 
  X, 
  Sparkles,
  BookOpen,
  Filter
} from 'lucide-react';
import { JournalEntry, ReflectionMode } from '../types';

interface HistorySidebarProps {
  entries: JournalEntry[];
  activeEntryId: string | null;
  onSelectEntry: (entry: JournalEntry) => void;
  onDeleteEntry: (entryId: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

export const HistorySidebar: React.FC<HistorySidebarProps> = ({
  entries,
  activeEntryId,
  onSelectEntry,
  onDeleteEntry,
  isOpen,
  onClose,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<ReflectionMode | 'all'>('all');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      const matchesFilter = selectedFilter === 'all' || entry.mode === selectedFilter;
      if (!matchesFilter) return false;

      if (!searchTerm.trim()) return true;
      const lower = searchTerm.toLowerCase();
      const inTitle = entry.title?.toLowerCase().includes(lower);
      const inSummary = entry.summary?.toLowerCase().includes(lower);
      const inTurns = entry.turns?.some((t) => t.content.toLowerCase().includes(lower));

      return inTitle || inSummary || inTurns;
    });
  }, [entries, searchTerm, selectedFilter]);

  const formatDate = (timestamp: number) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getModeBadge = (mode: ReflectionMode) => {
    switch (mode) {
      case 'summarize':
        return (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-sky-950/60 text-sky-300 border border-sky-800/40">
            Summary
          </span>
        );
      case 'brainstorm':
        return (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800/40">
            Brainstorm
          </span>
        );
      case 'reflect':
      default:
        return (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-800/40">
            Reflection
          </span>
        );
    }
  };

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-30 md:hidden"
          onClick={onClose}
        />
      )}

      <aside
        id="history-sidebar-panel"
        className={`fixed md:static inset-y-0 left-0 z-40 w-80 bg-stone-900 border-r border-stone-800 flex flex-col transition-transform duration-200 ease-in-out md:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Sidebar Header */}
        <div className="p-4 border-b border-stone-800 flex items-center justify-between">
          <div className="flex items-center gap-2 text-stone-200 font-semibold text-sm">
            <History className="w-4 h-4 text-amber-400" />
            <span>Reflection History</span>
            <span className="text-xs font-normal text-stone-500 bg-stone-800 px-1.5 py-0.5 rounded-full">
              {entries.length}
            </span>
          </div>

          <button
            id="btn-close-sidebar-mobile"
            onClick={onClose}
            className="p-1 rounded-md text-stone-400 hover:text-stone-200 md:hidden"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search & Filter Controls */}
        <div className="p-3 border-b border-stone-800/80 space-y-2.5">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              id="input-search-history"
              type="text"
              placeholder="Search thoughts & insights..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-stone-950/80 border border-stone-800 rounded-lg text-xs text-stone-200 placeholder-stone-500 focus:outline-none focus:border-amber-500/50"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-300 text-xs"
              >
                ×
              </button>
            )}
          </div>

          {/* Mode filter pills */}
          <div className="flex items-center gap-1 overflow-x-auto text-[11px] pb-1">
            {(['all', 'reflect', 'summarize', 'brainstorm'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setSelectedFilter(mode)}
                className={`px-2 py-0.5 rounded-md whitespace-nowrap transition-colors capitalize ${
                  selectedFilter === mode
                    ? 'bg-stone-800 text-amber-300 font-medium border border-stone-700'
                    : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800/50'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        {/* Entries List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {filteredEntries.length === 0 ? (
            <div className="text-center py-12 px-4 space-y-2">
              <BookOpen className="w-8 h-8 mx-auto text-stone-600" />
              <p className="text-xs text-stone-400 font-medium">No reflections found</p>
              <p className="text-[11px] text-stone-500">
                {entries.length === 0
                  ? 'Start your first journal conversation with Gemini.'
                  : 'Try adjusting your search query or filter.'}
              </p>
            </div>
          ) : (
            filteredEntries.map((entry) => {
              const isActive = entry.id === activeEntryId;
              const isDeleting = deletingId === entry.id;

              return (
                <div
                  key={entry.id}
                  id={`history-item-${entry.id}`}
                  onClick={() => onSelectEntry(entry)}
                  className={`group relative p-3 rounded-xl border text-left cursor-pointer transition-all ${
                    isActive
                      ? 'bg-amber-950/20 border-amber-500/40 shadow-xs'
                      : 'bg-stone-950/40 border-stone-800/80 hover:bg-stone-800/50 hover:border-stone-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h4
                      className={`text-xs font-semibold line-clamp-1 ${
                        isActive ? 'text-amber-200' : 'text-stone-200 group-hover:text-stone-100'
                      }`}
                    >
                      {entry.title || 'Untitled Reflection'}
                    </h4>

                    {/* Delete action button */}
                    <button
                      id={`btn-delete-entry-${entry.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isDeleting) {
                          onDeleteEntry(entry.id);
                          setDeletingId(null);
                        } else {
                          setDeletingId(entry.id);
                          // Auto reset confirmation after 3s
                          setTimeout(() => setDeletingId((curr) => (curr === entry.id ? null : curr)), 3000);
                        }
                      }}
                      title={isDeleting ? 'Click again to confirm delete' : 'Delete reflection'}
                      className={`p-1 rounded text-xs transition-colors shrink-0 ${
                        isDeleting
                          ? 'bg-rose-900/60 text-rose-200 border border-rose-700'
                          : 'opacity-0 group-hover:opacity-100 text-stone-500 hover:text-rose-400 hover:bg-stone-800'
                      }`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Summary preview or first turn */}
                  <p className="text-[11px] text-stone-400 line-clamp-2 leading-relaxed mb-2">
                    {entry.summary ||
                      entry.turns?.[0]?.content ||
                      'No content recorded.'}
                  </p>

                  {/* Extracted metadata badges (Insights) */}
                  {((entry.energy ?? entry.insights?.energy) !== undefined || entry.mood || entry.insights?.mood) && (
                    <div className="flex items-center gap-1.5 mb-2">
                      {(entry.energy ?? entry.insights?.energy) && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-950/40 text-amber-300 border border-amber-800/40 font-mono">
                          ⚡ {entry.energy ?? entry.insights?.energy}/5
                        </span>
                      )}
                      {(entry.mood || entry.insights?.mood) && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-800 text-stone-300 border border-stone-700 capitalize">
                          {entry.mood || entry.insights?.mood}
                        </span>
                      )}
                      {(entry.themes || entry.insights?.themes)?.[0] && (
                        <span className="text-[10px] text-stone-400 truncate max-w-[90px]">
                          #{(entry.themes || entry.insights?.themes)?.[0]}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Metadata Row */}
                  <div className="flex items-center justify-between text-[10px] text-stone-500">
                    <div className="flex items-center gap-1.5">
                      <span className="flex items-center gap-0.5">
                        <Calendar className="w-3 h-3" />
                        {formatDate(entry.updatedAt || entry.createdAt)}
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-0.5">
                        <MessageSquare className="w-3 h-3" />
                        {entry.turns?.length || 0}
                      </span>
                    </div>

                    <div>{getModeBadge(entry.mode)}</div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>
    </>
  );
};
