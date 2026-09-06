import React from 'react';
import { ShieldCheck, X, Check, Lock, Key, Database, Server } from 'lucide-react';

interface SecurityBadgeModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId?: string;
}

export const SecurityBadgeModal: React.FC<SecurityBadgeModalProps> = ({
  isOpen,
  onClose,
  userId,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div 
        id="security-modal-container"
        className="relative w-full max-w-2xl bg-stone-900 border border-stone-800 rounded-2xl p-6 shadow-2xl text-stone-100 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between pb-4 border-b border-stone-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-stone-100">
                Security Architecture &amp; Data Isolation
              </h3>
              <p className="text-xs text-stone-400">
                How your reflections are secured from untrusted access
              </p>
            </div>
          </div>
          <button
            id="btn-close-security-modal"
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-200 hover:bg-stone-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="py-5 space-y-5">
          {/* Active user isolation badge */}
          {userId && (
            <div className="p-3.5 rounded-xl bg-stone-950 border border-stone-800 flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-[11px] uppercase tracking-wider text-stone-500 font-semibold">
                  Your Authenticated UID
                </span>
                <p className="text-xs font-mono text-amber-300 break-all">{userId}</p>
              </div>
              <span className="text-xs px-2 py-1 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800/40">
                Isolated Root
              </span>
            </div>
          )}

          {/* 4 Pillars */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-lg bg-stone-950/60 border border-stone-800/80 space-y-1">
              <div className="flex items-center gap-1.5 font-medium text-emerald-400">
                <Database className="w-3.5 h-3.5" />
                <span>Owner-Bound Firestore</span>
              </div>
              <p className="text-stone-400 text-[11px] leading-relaxed">
                Rules require <code className="text-stone-300">request.auth.uid == userId</code>. Cross-user queries are denied by default at the database engine.
              </p>
            </div>

            <div className="p-3 rounded-lg bg-stone-950/60 border border-stone-800/80 space-y-1">
              <div className="flex items-center gap-1.5 font-medium text-amber-400">
                <Server className="w-3.5 h-3.5" />
                <span>Server-Side Gemini Proxy</span>
              </div>
              <p className="text-stone-400 text-[11px] leading-relaxed">
                The Gemini API key is never bundled into client JavaScript. Express acts as a secured backend proxy.
              </p>
            </div>

            <div className="p-3 rounded-lg bg-stone-950/60 border border-stone-800/80 space-y-1">
              <div className="flex items-center gap-1.5 font-medium text-sky-400">
                <Lock className="w-3.5 h-3.5" />
                <span>No Password Storage</span>
              </div>
              <p className="text-stone-400 text-[11px] leading-relaxed">
                Uses Google Sign-In via Firebase Auth. No custom password tables, preventing credential stuffing and leaks.
              </p>
            </div>

            <div className="p-3 rounded-lg bg-stone-950/60 border border-stone-800/80 space-y-1">
              <div className="flex items-center gap-1.5 font-medium text-indigo-400">
                <Key className="w-3.5 h-3.5" />
                <span>Zero-Crash Payload Hygiene</span>
              </div>
              <p className="text-stone-400 text-[11px] leading-relaxed">
                Strict sanitization strips <code className="text-stone-300">undefined</code> properties, ensuring transaction integrity.
              </p>
            </div>
          </div>

          {/* Deployed Firestore Rules */}
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-stone-300">
              Active Security Rules (<code className="text-stone-400 font-mono">firestore.rules</code>)
            </span>
            <div className="p-3 rounded-xl bg-stone-950 border border-stone-800 text-[11px] font-mono text-emerald-300/90 overflow-x-auto leading-relaxed">
              <pre>{`rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      
      match /{allSubcollections=**} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
    match /users/{userId}/interactions/{interactionId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}`}</pre>
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-stone-800 flex justify-end">
          <button
            id="btn-confirm-security-modal"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
