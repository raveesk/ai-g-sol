import React, { useState, useEffect, useCallback } from 'react';
import { User } from 'firebase/auth';
import { 
  ShieldAlert, 
  ShieldCheck, 
  RefreshCw, 
  Lock, 
  ScrollText, 
  Clock,
  LogOut
} from 'lucide-react';

interface AdminStats {
  totalUsers: number;
  totalInteractions: number;
  interactionsInLast7Days: number;
  averageInteractionsPerUser: number;
}

interface AuditLogEntry {
  id: string;
  actorUid: string;
  action: string;
  timestamp: number;
}

interface AdminViewProps {
  user: User;
  isAdmin: boolean;
  isAdminChecking: boolean;
  onReturnToJournal: () => void;
  onSignOut?: () => void;
}

export const AdminView: React.FC<AdminViewProps> = ({
  user,
  isAdmin,
  isAdminChecking,
  onReturnToJournal,
  onSignOut,
}) => {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loadingStats, setLoadingStats] = useState<boolean>(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loadingLogs, setLoadingLogs] = useState<boolean>(false);

  const fetchAuditLogs = useCallback(async () => {
    if (!isAdmin) return;
    setLoadingLogs(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/audit-logs', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.logs)) {
          setAuditLogs(data.logs);
        }
      }
    } catch (err) {
      console.warn('[AdminView] Notice loading audit logs:', err);
    } finally {
      setLoadingLogs(false);
    }
  }, [user, isAdmin]);

  const fetchAdminStats = useCallback(async () => {
    if (!isAdmin) return;
    setLoadingStats(true);
    setStatsError(null);

    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/stats', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        if (res.status === 403) {
          throw new Error('Access denied: Server-side validation rejected administrative permissions.');
        }
        throw new Error(`Failed to load stats (HTTP ${res.status})`);
      }

      const data: AdminStats = await res.json();
      setStats(data);
      setLastUpdated(Date.now());
      fetchAuditLogs();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatsError(msg);
    } finally {
      setLoadingStats(false);
    }
  }, [user, isAdmin, fetchAuditLogs]);

  useEffect(() => {
    if (isAdmin) {
      fetchAdminStats();
    }
  }, [isAdmin, fetchAdminStats]);

  // Loading authorization state
  if (isAdminChecking) {
    return (
      <div 
        id="admin-checking-loader"
        className="min-h-screen bg-black text-zinc-100 flex flex-col items-center justify-center p-8 text-center"
      >
        <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-800 text-amber-400 flex items-center justify-center animate-spin mb-4">
          <RefreshCw className="w-6 h-6" />
        </div>
        <h3 className="text-base font-semibold text-zinc-200 font-mono">
          Verifying administrative credentials...
        </h3>
        <p className="text-xs text-zinc-400 mt-1 max-w-sm">
          Validating token against server-side authorization policies and UID whitelists.
        </p>
      </div>
    );
  }

  // Common distinct admin top bar used across both verified and access-denied admin views
  const AdminTopBar = (
    <header className="h-16 bg-zinc-950 border-b border-zinc-800/90 px-4 sm:px-8 flex items-center justify-between gap-4 sticky top-0 z-30 shadow-md">
      {/* Left: Back to my journal link */}
      <div className="flex items-center gap-4">
        <button
          id="link-back-to-journal"
          onClick={onReturnToJournal}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-amber-400 transition-colors"
        >
          <span>← Back to my journal</span>
        </button>
      </div>

      {/* Center: Admin — Operations & Persistent Badge */}
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="text-sm sm:text-base font-bold text-zinc-100 tracking-tight font-mono">
            Admin — Operations
          </span>
        </div>

        <span 
          id="badge-admin-view-aggregate-metrics"
          className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-mono font-semibold bg-zinc-900 text-zinc-300 border border-zinc-700/80 shadow-xs"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
          <span>ADMIN VIEW · aggregate metrics only</span>
        </span>
      </div>

      {/* Right: User / Sign Out */}
      <div className="flex items-center gap-3">
        <span className="hidden md:inline text-xs font-mono text-zinc-400">
          {user.email || user.uid.slice(0, 10)}
        </span>
        {onSignOut && (
          <button
            id="btn-admin-signout"
            onClick={onSignOut}
            title="Sign Out"
            className="inline-flex items-center gap-1.5 text-xs font-mono text-zinc-400 hover:text-zinc-200 px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        )}
      </div>
    </header>
  );

  // Non-admin / Unauthorized state: Strict "You do not have access to this page" view (not a silent redirect)
  if (!isAdmin) {
    return (
      <div 
        id="admin-layout-denied"
        className="min-h-screen bg-black text-zinc-100 flex flex-col font-sans"
      >
        {AdminTopBar}

        <div 
          id="admin-access-denied-view"
          className="flex-1 flex items-center justify-center p-4 sm:p-8 bg-zinc-950"
        >
          <div className="max-w-md w-full p-6 sm:p-8 rounded-xl bg-zinc-900 border border-zinc-800 shadow-2xl text-center space-y-5">
            <div className="w-14 h-14 rounded-xl bg-rose-950/60 border border-rose-800/60 text-rose-400 flex items-center justify-center mx-auto shadow-inner">
              <ShieldAlert className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-mono font-medium bg-rose-950/40 text-rose-300 border border-rose-800/40">
                <Lock className="w-3 h-3" />
                <span>403 Forbidden</span>
              </div>
              <h2 className="text-xl font-bold text-zinc-100 tracking-tight">
                You do not have access to this page
              </h2>
              <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
                This administrative operations dashboard is restricted to verified administrators. 
                Your account does not have authorization to view this section.
              </p>
            </div>

            <div className="p-3.5 rounded-lg bg-black border border-zinc-800 text-left text-xs text-zinc-400 space-y-1.5 font-mono">
              <div className="flex items-center justify-between text-[11px] text-zinc-400 pb-1 border-b border-zinc-800">
                <span>Server Authorization</span>
                <span className="text-rose-400 font-semibold">Denied</span>
              </div>
              <p className="text-[11px] text-zinc-500">
                Actor UID: <code className="text-zinc-300">{user.uid.slice(0, 12)}...</code>
              </p>
              <p className="text-[11px] text-zinc-500">
                Enforcement: Server-side <code className="text-zinc-300">requireAdmin</code> middleware.
              </p>
            </div>

            <button
              id="btn-return-journal-denied"
              onClick={onReturnToJournal}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium text-sm transition-all shadow-sm"
            >
              <span>← Back to my journal</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Admin Verified state: Dedicated Operations Layout
  return (
    <div 
      id="admin-operations-layout"
      className="min-h-screen bg-black text-zinc-100 flex flex-col font-sans selection:bg-zinc-800 selection:text-white"
    >
      {/* Distinct Admin Top Bar */}
      {AdminTopBar}

      {/* Sub-header Banner */}
      <div className="border-b border-zinc-800/90 bg-zinc-950/80 px-4 sm:px-8 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-xs sm:text-sm text-zinc-400 font-mono">
          This view exposes counts only. Entry content is never accessible from this panel.
        </p>

        <div className="flex items-center gap-3 shrink-0">
          <button
            id="btn-refresh-admin-stats"
            onClick={fetchAdminStats}
            disabled={loadingStats}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium text-zinc-200 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 hover:text-white disabled:opacity-50 transition-colors shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingStats ? 'animate-spin' : ''}`} />
            <span>{loadingStats ? 'Refreshing...' : 'Refresh Metrics'}</span>
          </button>
        </div>
      </div>

      {/* Main Admin Content Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-6 space-y-8 overflow-y-auto">
        {/* Error display */}
        {statsError && (
          <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/50 text-xs text-rose-300 flex items-center justify-between gap-3 font-mono">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{statsError}</span>
            </div>
            <button
              onClick={fetchAdminStats}
              className="underline font-semibold hover:text-rose-200"
            >
              Retry
            </button>
          </div>
        )}

        {/* Large Metric Cards Grid (Number dominant, small label beneath) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {/* Card 1: Total Users */}
          <div 
            id="stat-card-total-users"
            className="p-6 rounded-xl bg-zinc-950 border border-zinc-800/90 shadow-sm flex flex-col justify-between"
          >
            <div className="text-4xl sm:text-5xl font-mono font-bold tracking-tight text-white">
              {stats !== null ? stats.totalUsers : (loadingStats ? '—' : '0')}
            </div>
            <div className="text-xs font-medium uppercase tracking-wider text-zinc-400 mt-2 font-mono">
              Total Users
            </div>
          </div>

          {/* Card 2: Total Reflections */}
          <div 
            id="stat-card-total-interactions"
            className="p-6 rounded-xl bg-zinc-950 border border-zinc-800/90 shadow-sm flex flex-col justify-between"
          >
            <div className="text-4xl sm:text-5xl font-mono font-bold tracking-tight text-white">
              {stats !== null ? stats.totalInteractions : (loadingStats ? '—' : '0')}
            </div>
            <div className="text-xs font-medium uppercase tracking-wider text-zinc-400 mt-2 font-mono">
              Total Reflections
            </div>
          </div>

          {/* Card 3: Past 7 Days */}
          <div 
            id="stat-card-recent-interactions"
            className="p-6 rounded-xl bg-zinc-950 border border-zinc-800/90 shadow-sm flex flex-col justify-between"
          >
            <div className="text-4xl sm:text-5xl font-mono font-bold tracking-tight text-emerald-400">
              {stats !== null ? stats.interactionsInLast7Days : (loadingStats ? '—' : '0')}
            </div>
            <div className="text-xs font-medium uppercase tracking-wider text-zinc-400 mt-2 font-mono">
              Past 7 Days
            </div>
          </div>

          {/* Card 4: Average Reflections / User */}
          <div 
            id="stat-card-average-interactions"
            className="p-6 rounded-xl bg-zinc-950 border border-zinc-800/90 shadow-sm flex flex-col justify-between"
          >
            <div className="text-4xl sm:text-5xl font-mono font-bold tracking-tight text-white">
              {stats !== null ? stats.averageInteractionsPerUser : (loadingStats ? '—' : '0')}
            </div>
            <div className="text-xs font-medium uppercase tracking-wider text-zinc-400 mt-2 font-mono">
              Avg Reflections / User
            </div>
          </div>
        </div>

        {/* Audit Log Trail (Server-Only, Append-Only) */}
        <div 
          id="admin-audit-logs-section"
          className="rounded-xl bg-zinc-950 border border-zinc-800/90 overflow-hidden shadow-sm"
        >
          <div className="p-4 sm:p-5 border-b border-zinc-800/90 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-zinc-900/30">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300">
                <ScrollText className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-zinc-100 font-mono">
                  Audit Trail (<code className="text-amber-400 text-xs font-mono">auditLogs</code>)
                </h2>
                <p className="text-[11px] text-zinc-400 font-mono">
                  Append-only records written server-side via Admin SDK. All direct client reads and writes denied in Firestore rules.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 text-[10px] font-mono font-medium px-2.5 py-1 rounded bg-zinc-900 text-zinc-400 border border-zinc-800">
                <Lock className="w-2.5 h-2.5" />
                allow read, write: if false;
              </span>
              <button
                id="btn-refresh-audit-logs"
                onClick={fetchAuditLogs}
                disabled={loadingLogs}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 transition-colors"
                title="Refresh Audit Logs"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingLogs ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          <div className="divide-y divide-zinc-800/70 max-h-72 overflow-y-auto">
            {loadingLogs && auditLogs.length === 0 ? (
              <div className="p-6 text-center text-xs text-zinc-400 flex items-center justify-center gap-2 font-mono">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Loading audit trail...</span>
              </div>
            ) : auditLogs.length === 0 ? (
              <div className="p-6 text-center text-xs text-zinc-500 font-mono">
                No audit logs recorded yet. Audit records are created on every successful /api/admin/stats call.
              </div>
            ) : (
              auditLogs.map((log) => (
                <div 
                  key={log.id} 
                  className="p-3.5 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-zinc-900/40 transition-colors text-xs font-mono"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] px-2 py-0.5 rounded bg-zinc-900 text-amber-300 border border-zinc-800 font-medium">
                      {log.action}
                    </span>
                    <span className="text-zinc-300 text-[11px]">
                      Actor: <span className="text-zinc-400">{log.actorUid}</span>
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-zinc-500 text-[11px]">
                    <span className="text-zinc-600 hidden md:inline">ID: {log.id.slice(0, 12)}...</span>
                    <span className="inline-flex items-center gap-1 text-zinc-400">
                      <Clock className="w-3 h-3 text-zinc-500" />
                      {new Date(log.timestamp).toLocaleString()}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Timestamp info */}
        {lastUpdated && (
          <div className="text-right text-[11px] text-zinc-400 pt-1 font-mono">
            Last updated: {new Date(lastUpdated).toLocaleTimeString()}
          </div>
        )}
      </main>
    </div>
  );
};
