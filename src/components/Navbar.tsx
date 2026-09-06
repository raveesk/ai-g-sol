import React from 'react';
import { User } from 'firebase/auth';
import { 
  BookOpen, 
  ShieldCheck, 
  LogOut, 
  Plus, 
  Menu, 
  Sparkles,
  Info,
  Activity
} from 'lucide-react';

interface NavbarProps {
  user: User | null;
  activeTab?: 'journal' | 'insights';
  onSelectTab?: (tab: 'journal' | 'insights') => void;
  onSignOut: () => void;
  onNewEntry: () => void;
  onToggleSidebar: () => void;
  onOpenSecurityModal: () => void;
  sidebarOpen: boolean;
  activeEntryId: string | null;
}

export const Navbar: React.FC<NavbarProps> = ({
  user,
  activeTab = 'journal',
  onSelectTab,
  onSignOut,
  onNewEntry,
  onToggleSidebar,
  onOpenSecurityModal,
  sidebarOpen,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-stone-900/95 backdrop-blur border-b border-stone-800 text-stone-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        {/* Left: Brand & Sidebar toggle */}
        <div className="flex items-center gap-3">
          {user && (
            <button
              id="btn-toggle-sidebar"
              onClick={onToggleSidebar}
              className="p-2 rounded-lg text-stone-400 hover:text-stone-100 hover:bg-stone-800 transition-colors md:hidden"
              aria-label={sidebarOpen ? 'Close History' : 'Open History'}
            >
              <Menu className="w-5 h-5" />
            </button>
          )}

          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-amber-600/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-stone-100 tracking-tight text-base sm:text-lg">
                  Reflect &amp; Journal AI
                </span>
                <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20">
                  <Sparkles className="w-3 h-3" />
                  Gemini 3.6 Flash
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Center: Tabs for authenticated user */}
        {user && onSelectTab && (
          <nav className="flex items-center gap-1 p-1 bg-stone-950/80 rounded-xl border border-stone-800">
            <button
              id="tab-journal"
              onClick={() => onSelectTab('journal')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'journal'
                  ? 'bg-amber-600/20 text-amber-300 border border-amber-500/30 shadow-xs'
                  : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800/60'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Journal</span>
            </button>

            <button
              id="tab-insights"
              onClick={() => onSelectTab('insights')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'insights'
                  ? 'bg-amber-600/20 text-amber-300 border border-amber-500/30 shadow-xs'
                  : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800/60'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Insights</span>
            </button>
          </nav>
        )}

        {/* Right: Actions & User */}
        {user ? (
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              id="btn-security-rules-badge"
              onClick={onOpenSecurityModal}
              title="Inspect Firestore Security Rules & Isolation"
              className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-emerald-400 bg-emerald-950/40 border border-emerald-800/50 hover:bg-emerald-900/40 transition-colors"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>User-Isolated Firestore</span>
              <Info className="w-3 h-3 text-emerald-500" />
            </button>

            <button
              id="btn-new-reflection"
              onClick={onNewEntry}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-stone-950 font-medium text-sm transition-all shadow-sm active:scale-98"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">New Reflection</span>
              <span className="sm:hidden">New</span>
            </button>

            <div className="h-6 w-px bg-stone-800 hidden sm:block" />

            <div className="flex items-center gap-2">
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || 'User'}
                  className="w-8 h-8 rounded-full border border-stone-700 object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-stone-800 border border-stone-700 flex items-center justify-center text-xs font-semibold text-stone-300">
                  {(user.displayName || user.email || 'U')[0].toUpperCase()}
                </div>
              )}

              <div className="hidden md:flex flex-col text-left">
                <span className="text-xs font-medium text-stone-200 truncate max-w-[130px]">
                  {user.displayName || user.email?.split('@')[0]}
                </span>
                <span className="text-[10px] text-stone-400 truncate max-w-[130px]">
                  {user.email}
                </span>
              </div>

              <button
                id="btn-sign-out"
                onClick={onSignOut}
                title="Sign out securely"
                className="p-1.5 rounded-lg text-stone-400 hover:text-stone-200 hover:bg-stone-800 transition-colors"
                aria-label="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              id="btn-security-info-unauthed"
              onClick={onOpenSecurityModal}
              className="hidden sm:flex items-center gap-1 text-xs text-stone-400 hover:text-stone-200"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Security Architecture</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
