import React from 'react';
import { 
  ShieldCheck, 
  Sparkles, 
  Database, 
  Lock, 
  ArrowRight,
  MessageSquareText,
  Compass,
  Zap,
  CheckCircle2
} from 'lucide-react';

interface LandingViewProps {
  onSignIn: () => void;
  isLoading: boolean;
  authError: string | null;
  onOpenSecurityModal: () => void;
}

export const LandingView: React.FC<LandingViewProps> = ({
  onSignIn,
  isLoading,
  authError,
  onOpenSecurityModal,
}) => {
  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col justify-center items-center px-4 py-12 bg-stone-950 text-stone-100">
      <div className="max-w-3xl w-full mx-auto text-center space-y-8">
        {/* Security & Tech Pillar Badges */}
        <div className="inline-flex flex-wrap items-center justify-center gap-2 px-3 py-1.5 rounded-full bg-stone-900 border border-stone-800 text-xs text-stone-300">
          <span className="flex items-center gap-1 text-emerald-400 font-medium">
            <ShieldCheck className="w-3.5 h-3.5" />
            User-Isolated Firestore
          </span>
          <span className="text-stone-600">•</span>
          <span className="flex items-center gap-1 text-amber-400 font-medium">
            <Sparkles className="w-3.5 h-3.5" />
            Gemini 3.6 Flash
          </span>
          <span className="text-stone-600">•</span>
          <span className="flex items-center gap-1 text-sky-400 font-medium">
            <Lock className="w-3.5 h-3.5" />
            Firebase Auth
          </span>
        </div>

        {/* Primary Headline */}
        <div className="space-y-4">
          <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-stone-100 leading-tight">
            A Mindful Space for Your Thoughts,{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-amber-200">
              Reflected with Gemini
            </span>
          </h1>
          <p className="text-base sm:text-lg text-stone-400 max-w-2xl mx-auto leading-relaxed">
            Write personal journal entries, reflect on daily decisions, and brainstorm creative paths forward. 
            All reflections are processed securely and strictly partitioned in Cloud Firestore.
          </p>
        </div>

        {/* Sign In Card */}
        <div className="max-w-md mx-auto p-6 sm:p-8 bg-stone-900/90 border border-stone-800 rounded-2xl shadow-xl space-y-6">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-stone-200">
              Sign In to Your Private Dashboard
            </h2>
            <p className="text-xs text-stone-400">
              Authenticate securely via Google. We never handle or store custom passwords.
            </p>
          </div>

          {authError && (
            <div 
              id="auth-error-alert" 
              className="p-3 bg-rose-950/50 border border-rose-800/60 rounded-lg text-xs text-rose-300 text-left"
            >
              {authError}
            </div>
          )}

          <button
            id="btn-google-sign-in"
            onClick={onSignIn}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-3 px-5 py-3 rounded-xl bg-stone-100 hover:bg-white text-stone-950 font-medium text-sm transition-all shadow-md active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-stone-900 border-t-transparent rounded-full animate-spin" />
                <span>Authenticating...</span>
              </div>
            ) : (
              <>
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>Continue with Google</span>
                <ArrowRight className="w-4 h-4 text-stone-500" />
              </>
            )}
          </button>

          <div className="pt-2 border-t border-stone-800/80 flex items-center justify-between text-[11px] text-stone-400">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              No credit card required
            </span>
            <button
              id="btn-view-rules-landing"
              onClick={onOpenSecurityModal}
              className="text-amber-400 hover:text-amber-300 underline underline-offset-2"
            >
              How data is isolated
            </button>
          </div>
        </div>

        {/* Feature Cards Matrix */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-6 text-left">
          <div className="p-5 rounded-xl bg-stone-900/60 border border-stone-800/80 space-y-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
              <MessageSquareText className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-stone-200">Multi-Turn Reflections</h3>
            <p className="text-xs text-stone-400 leading-relaxed">
              Explore your thoughts through organic, multi-turn dialogues with Gemini acting as an empathetic, thoughtful companion.
            </p>
          </div>

          <div className="p-5 rounded-xl bg-stone-900/60 border border-stone-800/80 space-y-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <Database className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-stone-200">Strict Firestore Isolation</h3>
            <p className="text-xs text-stone-400 leading-relaxed">
              Entries are stored under <code className="text-[11px] bg-stone-800 px-1 py-0.5 rounded text-emerald-300">/users/$&#123;uid&#125;/interactions</code>. Nobody else can read or write your journals.
            </p>
          </div>

          <div className="p-5 rounded-xl bg-stone-900/60 border border-stone-800/80 space-y-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-500/10 text-sky-400 flex items-center justify-center">
              <Zap className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-stone-200">Adaptive Fallback Ladder</h3>
            <p className="text-xs text-stone-400 leading-relaxed">
              Powered by Gemini 3.6 Flash with automated, fault-tolerant fallbacks to guarantee uninterrupted journaling.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
