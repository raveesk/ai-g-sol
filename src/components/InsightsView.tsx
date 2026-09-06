import React, { useState, useMemo } from 'react';
import { 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid 
} from 'recharts';
import Markdown from 'react-markdown';
import { 
  Sparkles, 
  Activity, 
  Tag, 
  Calendar, 
  RefreshCw, 
  Copy, 
  Check, 
  ShieldCheck, 
  TrendingUp, 
  Smile, 
  Meh, 
  Frown, 
  HelpCircle,
  Clock,
  BookOpen
} from 'lucide-react';
import { JournalEntry, MoodType, WeeklySynthesisResult } from '../types';
import { getWeeklyEntries } from '../lib/db';

interface InsightsViewProps {
  userId: string;
  entries: JournalEntry[];
  onNavigateToEntry?: (entryId: string) => void;
  onNewReflection?: () => void;
}

export const InsightsView: React.FC<InsightsViewProps> = ({
  userId,
  entries,
  onNavigateToEntry,
  onNewReflection,
}) => {
  // Synthesis state
  const [synthesisResult, setSynthesisResult] = useState<WeeklySynthesisResult | null>(null);
  const [isSynthesizing, setIsSynthesizing] = useState<boolean>(false);
  const [synthesisError, setSynthesisError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  // 1. Process data for (a) Energy over time chart
  const chartData = useMemo(() => {
    // Filter entries with valid energy (1-5) and sort chronologically
    const valid = entries
      .filter((e) => {
        const en = e.energy ?? e.insights?.energy;
        return typeof en === 'number' && en >= 1 && en <= 5;
      })
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

    return valid.map((e) => {
      const en = e.energy ?? e.insights?.energy ?? 3;
      const date = new Date(e.createdAt || e.updatedAt || Date.now());
      const dateStr = `${date.getMonth() + 1}/${date.getDate()}`;
      const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const mood = e.mood || e.insights?.mood || 'neutral';

      return {
        id: e.id,
        timestamp: e.createdAt || e.updatedAt,
        dateStr,
        fullDate: `${date.toLocaleDateString()} ${timeStr}`,
        energy: en,
        title: e.title || 'Reflection',
        mood,
      };
    });
  }, [entries]);

  // 2. Process (b) Most frequent themes and Mood distribution
  const { themeList, moodDistribution, avgEnergy } = useMemo(() => {
    const themeCounts: Record<string, number> = {};
    const moods: Record<MoodType, number> = {
      positive: 0,
      neutral: 0,
      negative: 0,
      mixed: 0,
    };
    let energyTotal = 0;
    let energyEntriesCount = 0;

    for (const entry of entries) {
      // Aggregate themes
      const themes = entry.themes || entry.insights?.themes;
      if (Array.isArray(themes)) {
        for (const t of themes) {
          if (typeof t === 'string' && t.trim()) {
            const cleanTheme = t.trim().toLowerCase();
            themeCounts[cleanTheme] = (themeCounts[cleanTheme] || 0) + 1;
          }
        }
      }

      // Aggregate moods
      const m = (entry.mood || entry.insights?.mood) as MoodType;
      if (m && moods[m] !== undefined) {
        moods[m]++;
      }

      // Energy
      const en = entry.energy ?? entry.insights?.energy;
      if (typeof en === 'number' && en >= 1 && en <= 5) {
        energyTotal += en;
        energyEntriesCount++;
      }
    }

    const sortedThemes = Object.entries(themeCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    const average = energyEntriesCount > 0 ? (energyTotal / energyEntriesCount).toFixed(1) : null;

    return {
      themeList: sortedThemes,
      moodDistribution: moods,
      avgEnergy: average,
    };
  }, [entries]);

  // 3. (c) Generate Weekly Synthesis action
  const handleGenerateWeeklySynthesis = async () => {
    if (!userId) return;
    setIsSynthesizing(true);
    setSynthesisError(null);

    try {
      // Step 1: Read the signed-in user's last 7 days of entries,
      // scoped strictly to users/{uid}/interactions for the authenticated caller only, capped at 50 documents.
      const weeklyEntries = await getWeeklyEntries(userId);

      if (weeklyEntries.length === 0) {
        setSynthesisResult({
          synthesis: "No reflections were found in the last 7 days. Start by creating a reflection to begin tracking your weekly emotional rhythms and AI synthesis!",
          entryCount: 0,
          periodStart: Date.now() - 7 * 24 * 60 * 60 * 1000,
          periodEnd: Date.now(),
          generatedAt: Date.now(),
        });
        setIsSynthesizing(false);
        return;
      }

      // Step 2: Send to server synthesis endpoint (entry texts will be truncated before entering prompt)
      const res = await fetch('/api/gemini/weekly-synthesis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          entries: weeklyEntries,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to generate weekly synthesis.');
      }

      const data = await res.json();
      setSynthesisResult({
        synthesis: data.synthesis,
        entryCount: data.entryCount || weeklyEntries.length,
        periodStart: data.periodStart || (Date.now() - 7 * 24 * 60 * 60 * 1000),
        periodEnd: data.periodEnd || Date.now(),
        generatedAt: data.generatedAt || Date.now(),
        modelUsed: data.modelUsed,
      });
    } catch (err: unknown) {
      const msg = (err as Error)?.message || 'Unable to generate synthesis at this time.';
      setSynthesisError(msg);
    } finally {
      setIsSynthesizing(false);
    }
  };

  const handleCopySynthesis = () => {
    if (!synthesisResult?.synthesis) return;
    navigator.clipboard.writeText(synthesisResult.synthesis);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 max-w-5xl mx-auto w-full space-y-8">
      {/* Top Banner / Introduction */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-800">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-semibold text-stone-100 tracking-tight">
              Mindful Insights
            </h1>
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20 flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              Structured AI Analysis
            </span>
          </div>
          <p className="text-xs sm:text-sm text-stone-400 mt-1 max-w-2xl">
            Pattern detection, energy trends over time, recurring themes, and weekly reflective synthesis automatically parsed from your private Firestore reflections.
          </p>
        </div>

        {/* Quick summary stats */}
        <div className="flex items-center gap-2">
          <div className="px-3 py-1.5 rounded-lg bg-stone-900 border border-stone-800 text-center">
            <span className="text-[10px] text-stone-400 block uppercase tracking-wider">Reflections</span>
            <span className="text-sm font-semibold text-stone-100">{entries.length}</span>
          </div>
          <div className="px-3 py-1.5 rounded-lg bg-stone-900 border border-stone-800 text-center">
            <span className="text-[10px] text-stone-400 block uppercase tracking-wider">Avg Energy</span>
            <span className="text-sm font-semibold text-amber-400">{avgEnergy ? `${avgEnergy}/5` : '—'}</span>
          </div>
          <div className="px-3 py-1.5 rounded-lg bg-stone-900 border border-stone-800 text-center">
            <span className="text-[10px] text-stone-400 block uppercase tracking-wider">Themes</span>
            <span className="text-sm font-semibold text-sky-400">{themeList.length}</span>
          </div>
        </div>
      </div>

      {/* Grid Layout: (a) Energy Line Chart & (b) Frequent Themes */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* (a) Energy Over Time Line Chart (2 Cols) */}
        <div 
          id="chart-energy-over-time-container" 
          className="lg:col-span-2 p-5 rounded-2xl bg-stone-900/60 border border-stone-800/80 shadow-xs flex flex-col justify-between"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                <TrendingUp className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-semibold text-stone-100">
                  Energy Rhythm Over Time
                </h2>
                <p className="text-xs text-stone-400">
                  Visualizing your 1–5 energy fluctuations across journal sessions
                </p>
              </div>
            </div>

            <span className="text-[11px] text-stone-400 bg-stone-800/60 px-2 py-0.5 rounded border border-stone-700/60">
              1 (Drained) → 5 (Vibrant)
            </span>
          </div>

          {chartData.length > 0 ? (
            <div className="w-full h-64 pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 15, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#292524" vertical={false} />
                  <XAxis 
                    dataKey="dateStr" 
                    stroke="#78716c" 
                    fontSize={11} 
                    tickLine={false}
                    axisLine={{ stroke: '#44403c' }}
                  />
                  <YAxis 
                    domain={[1, 5]} 
                    ticks={[1, 2, 3, 4, 5]} 
                    stroke="#78716c" 
                    fontSize={11} 
                    tickLine={false}
                    axisLine={{ stroke: '#44403c' }}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="p-2.5 rounded-lg bg-stone-900 border border-stone-700 shadow-lg text-xs space-y-1 z-50">
                            <p className="font-semibold text-stone-200">{data.title}</p>
                            <p className="text-stone-400 text-[10px]">{data.fullDate}</p>
                            <div className="flex items-center gap-2 pt-1 border-t border-stone-800 mt-1">
                              <span className="text-amber-400 font-medium">Energy: {data.energy}/5</span>
                              <span className="text-stone-500">•</span>
                              <span className="text-stone-300 capitalize">Mood: {data.mood}</span>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="energy" 
                    stroke="#f59e0b" 
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: '#f59e0b', stroke: '#1c1917', strokeWidth: 1.5 }}
                    activeDot={{ r: 6, fill: '#fbbf24', stroke: '#78350f', strokeWidth: 2 }}
                    isAnimationActive={true}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex flex-col items-center justify-center text-center p-6 border border-dashed border-stone-800 rounded-xl bg-stone-900/30">
              <Activity className="w-8 h-8 text-stone-600 mb-2" />
              <p className="text-xs font-medium text-stone-300">No energy data points yet</p>
              <p className="text-[11px] text-stone-500 max-w-xs mt-1">
                When you write journal entries, Gemini extracts your energy score (1-5) and plots your trends here automatically.
              </p>
              {onNewReflection && (
                <button
                  onClick={onNewReflection}
                  className="mt-3 text-xs text-amber-400 hover:text-amber-300 underline font-medium"
                >
                  Write your first reflection
                </button>
              )}
            </div>
          )}

          {/* Quick legend footer */}
          <div className="mt-3 pt-3 border-t border-stone-800/80 flex items-center justify-between text-[11px] text-stone-400">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
              Session Energy Score
            </span>
            <span>{chartData.length} data point{chartData.length === 1 ? '' : 's'} recorded</span>
          </div>
        </div>

        {/* (b) Most Frequent Themes (1 Col) */}
        <div 
          id="frequent-themes-container" 
          className="p-5 rounded-2xl bg-stone-900/60 border border-stone-800/80 shadow-xs flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
                <Tag className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-semibold text-stone-100">
                  Frequent Themes
                </h2>
                <p className="text-xs text-stone-400">
                  Core topics extracted across your journal entries
                </p>
              </div>
            </div>

            {themeList.length > 0 ? (
              <div className="flex flex-wrap gap-2 pt-1 max-h-56 overflow-y-auto">
                {themeList.map((item, idx) => (
                  <div
                    key={item.name}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-800/80 border border-stone-700/60 text-xs text-stone-200 transition-colors hover:border-amber-500/40"
                  >
                    <span className="w-4 h-4 rounded-full bg-stone-700 text-[10px] flex items-center justify-center text-stone-300 font-mono">
                      {idx + 1}
                    </span>
                    <span className="font-medium lowercase">#{item.name}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-900 text-stone-400 font-mono">
                      {item.count}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-10 text-center border border-dashed border-stone-800 rounded-xl bg-stone-900/30">
                <Tag className="w-6 h-6 text-stone-600 mx-auto mb-2" />
                <p className="text-xs text-stone-400">No themes detected yet.</p>
                <p className="text-[11px] text-stone-500 mt-0.5">Themes appear automatically as you journal.</p>
              </div>
            )}
          </div>

          {/* Mood breakdown pill summary */}
          <div className="mt-4 pt-3 border-t border-stone-800/80">
            <span className="text-[11px] text-stone-400 block mb-2 font-medium">Mood Distribution</span>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center justify-between px-2.5 py-1 rounded bg-stone-950/60 border border-stone-800">
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <Smile className="w-3 h-3" /> Positive
                </span>
                <span className="font-mono text-stone-300">{moodDistribution.positive}</span>
              </div>
              <div className="flex items-center justify-between px-2.5 py-1 rounded bg-stone-950/60 border border-stone-800">
                <span className="flex items-center gap-1.5 text-sky-400">
                  <Meh className="w-3 h-3" /> Neutral
                </span>
                <span className="font-mono text-stone-300">{moodDistribution.neutral}</span>
              </div>
              <div className="flex items-center justify-between px-2.5 py-1 rounded bg-stone-950/60 border border-stone-800">
                <span className="flex items-center gap-1.5 text-rose-400">
                  <Frown className="w-3 h-3" /> Negative
                </span>
                <span className="font-mono text-stone-300">{moodDistribution.negative}</span>
              </div>
              <div className="flex items-center justify-between px-2.5 py-1 rounded bg-stone-950/60 border border-stone-800">
                <span className="flex items-center gap-1.5 text-purple-400">
                  <HelpCircle className="w-3 h-3" /> Mixed
                </span>
                <span className="font-mono text-stone-300">{moodDistribution.mixed}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* (c) Weekly Synthesis Section */}
      <div 
        id="weekly-synthesis-card" 
        className="p-6 rounded-2xl bg-stone-900/60 border border-stone-800/80 shadow-xs space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-stone-100 flex items-center gap-2">
                Weekly Reflective Synthesis
                <span className="text-[10px] px-2 py-0.5 rounded bg-amber-950/60 border border-amber-800/50 text-amber-300">
                  Past 7 Days
                </span>
              </h2>
              <p className="text-xs text-stone-400">
                Scoped to your isolated Firestore interactions (capped at 50 entries)
              </p>
            </div>
          </div>

          <button
            id="btn-generate-weekly-synthesis"
            onClick={handleGenerateWeeklySynthesis}
            disabled={isSynthesizing}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:bg-stone-800 text-stone-950 disabled:text-stone-500 font-medium text-xs sm:text-sm transition-all shadow-sm active:scale-98 cursor-pointer"
          >
            {isSynthesizing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Synthesizing Past 7 Days...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Generate Weekly Synthesis</span>
              </>
            )}
          </button>
        </div>

        {/* Error notification if synthesis fails */}
        {synthesisError && (
          <div className="p-3.5 rounded-xl bg-rose-950/50 border border-rose-800/60 text-xs text-rose-300 flex items-start gap-2">
            <span className="font-semibold">Synthesis Error:</span>
            <span>{synthesisError}</span>
          </div>
        )}

        {/* Synthesis Result Display */}
        {synthesisResult && (
          <div 
            id="weekly-synthesis-result" 
            className="mt-4 p-5 rounded-xl bg-stone-950/80 border border-stone-800/90 space-y-4 animate-fade-in"
          >
            <div className="flex items-center justify-between text-xs text-stone-400 pb-3 border-b border-stone-800/80">
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1 text-emerald-400">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Synthesized {synthesisResult.entryCount} reflection{synthesisResult.entryCount === 1 ? '' : 's'}
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-stone-500" />
                  {new Date(synthesisResult.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              <button
                id="btn-copy-synthesis"
                onClick={handleCopySynthesis}
                className="flex items-center gap-1 text-stone-400 hover:text-stone-200 text-xs transition-colors px-2 py-1 rounded bg-stone-900 border border-stone-800"
                title="Copy synthesis text"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>

            {/* Markdown rendered body */}
            <div className="text-xs sm:text-sm text-stone-300 leading-relaxed space-y-3 prose prose-invert prose-stone max-w-none">
              <Markdown>{synthesisResult.synthesis}</Markdown>
            </div>
          </div>
        )}

        {/* Prompt guidance if no synthesis has been generated yet */}
        {!synthesisResult && !isSynthesizing && (
          <div className="p-4 rounded-xl bg-stone-950/40 border border-stone-800/60 text-xs text-stone-400 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-amber-500/80" />
              <span>Click above to let Gemini review your last 7 days of reflections and distill high-level growth themes.</span>
            </div>
            <span className="text-[11px] font-mono text-stone-500 hidden sm:inline">
              Max 50 documents • Truncated text
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
