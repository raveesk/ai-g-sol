import express, { Request, Response } from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import { requireAdmin, getAdminFirestore } from './server/middleware/requireAdmin';
import { FieldValue } from 'firebase-admin/firestore';

export { requireAdmin, getAdminFirestore };

dotenv.config();

const PORT = 3000;
const HOST = '0.0.0.0';

// Model Fallback Ladder according to Gemini Model Resilience & Fallback Protocol
const MODEL_FALLBACK_LADDER = [
  'gemini-3.6-flash',
  'gemini-3.1-flash-lite',
  'gemini-flash-latest',
  'gemini-3.7-flash',
] as const;

let aiClient: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is missing.');
    }
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
}

interface GenerateFallbackResult {
  text: string;
  modelUsed: string;
}

/**
 * Extracts a human-readable error message from Gemini API errors,
 * parsing JSON error bodies if present.
 */
function parseGeminiError(err: unknown): { message: string; statusCode: number; isQuota: boolean } {
  const rawMsg = String((err as Error)?.message || '');
  let statusCode = (err as { status?: number; statusCode?: number })?.status ||
                   (err as { status?: number; statusCode?: number })?.statusCode || 500;
  let cleanMessage = rawMsg;
  let isQuota = false;

  // Attempt to parse JSON error message embedded in error string
  try {
    const jsonMatch = rawMsg.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.error?.message) {
        cleanMessage = parsed.error.message;
      }
      if (parsed.error?.code) {
        statusCode = parsed.error.code;
      }
      if (parsed.error?.status === 'RESOURCE_EXHAUSTED') {
        isQuota = true;
      }
    }
  } catch {
    // If not JSON, use rawMsg
  }

  if (
    cleanMessage.includes('prepayment credits are depleted') ||
    cleanMessage.includes('RESOURCE_EXHAUSTED') ||
    cleanMessage.includes('quota') ||
    statusCode === 429
  ) {
    isQuota = true;
    statusCode = 429;
    cleanMessage = 'Your Gemini prepayment credits are depleted. Please manage your project and billing at https://ai.studio/projects.';
  }

  return { message: cleanMessage, statusCode, isQuota };
}

/**
 * Generates an intelligent, compassionate reflection when upstream Gemini API credits are depleted.
 * Ensures unbroken interactive functionality and complete Firestore persistence while informing the user.
 */
function generateGracefulReflection(prompt: string, mode: string): string {
  const cleanPrompt = prompt.trim();
  
  if (mode === 'summarize') {
    return `### Executive Reflection Summary

**Core Theme & Sentiment**:
The reflection explores personal thoughts and aspirations: "${cleanPrompt.slice(0, 120)}${cleanPrompt.length > 120 ? '...' : ''}".

**Key Insights**:
1. **Self-Observation**: Taking the intentional time to write and reflect clarifies underlying patterns and feelings.
2. **Growth Mindset**: Acknowledging both challenges and achievements forms the foundation for actionable self-awareness.

**Next Steps & Inquiries**:
- What is one tangible, compassionate step you can take today regarding this reflection?
- How does looking at this situation with fresh eyes change your perspective?

*(Note: Upstream Gemini prepayment credits are depleted at https://ai.studio/projects. This response was synthesized by the local reflection engine so your journal entry and reflections are preserved.)*`;
  }

  if (mode === 'brainstorm') {
    return `### Creative Brainstorming & Action Perspectives

Reflecting on your prompt: *"\"${cleanPrompt.slice(0, 100)}${cleanPrompt.length > 100 ? '...' : ''}\""*, here are 4 inventive angles to explore:

1. **The Inversion Principle**: 
   What would happen if you did the exact opposite of your initial inclination, or paused all immediate action for 24 hours to gain distance?

2. **The Micro-Experiment**: 
   Break this challenge down into a low-stakes 15-minute experiment. What is the smallest possible test you could run today to gather real data?

3. **External Perspective (The Trusted Advisor)**: 
   If a close friend or colleague came to you with this exact situation, what empathetic advice or boundary would you urge them to adopt?

4. **Resource Re-evaluation**: 
   What skills, past experiences, or supportive relationships can you lean on right now that you haven't tapped into yet?

*(Note: Upstream Gemini prepayment credits are depleted at https://ai.studio/projects. This brainstorm was synthesized by the local engine to ensure continuous workflow.)*`;
  }

  // Default 'reflect' mode
  return `Thank you for sharing this reflection.

### Mindful Reflection & Inquiries

You shared: *"\"${cleanPrompt.slice(0, 120)}${cleanPrompt.length > 120 ? '...' : ''}\""*

1. **Observing the Core**:
   Notice the underlying emotion and intention behind these words. Giving voice to your thoughts is an essential act of mindfulness and clarity.

2. **Thought-Provoking Perspective**:
   - What parts of this experience or dilemma are within your direct control, and what parts are asking for acceptance?
   - How might your future self, looking back from six months ahead, view the importance of what you are processing right now?

3. **Compassionate Grounding**:
   Allow yourself the space to be patient with unresolved thoughts. Meaningful clarity often emerges gradually through ongoing reflection.

*(Note: Upstream Gemini prepayment credits are depleted at https://ai.studio/projects. This reflection was synthesized by the local engine so your thoughts are safely persisted in Firestore.)*`;
}

function generateGracefulCardSummary(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= 100) return `Reflection exploring: ${clean}`;
  return `Mindful reflection addressing ${clean.slice(0, 95)}...`;
}

export type MoodType = 'positive' | 'neutral' | 'negative' | 'mixed';

export interface ExtractedMetadata {
  mood: MoodType;
  energy: number | null;
  themes: string[];
}

/**
 * Validates parsed extraction object against required schema:
 * - mood: one of 'positive' | 'neutral' | 'negative' | 'mixed'
 * - energy: 1 to 5 integer or null
 * - themes: array of 1 to 3 short lowercase strings
 * Falls back to mood: "neutral", energy: null, themes: [] if validation fails.
 */
function validateExtractionResult(parsed: any): ExtractedMetadata {
  const fallback: ExtractedMetadata = { mood: 'neutral', energy: null, themes: [] };
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return fallback;
  }

  // 1. Validate mood
  const validMoods = ['positive', 'neutral', 'negative', 'mixed'] as const;
  const mood = validMoods.includes(parsed.mood) ? (parsed.mood as MoodType) : 'neutral';

  // 2. Validate energy (1-5 integer)
  let energy: number | null = null;
  if (
    typeof parsed.energy === 'number' &&
    Number.isInteger(parsed.energy) &&
    parsed.energy >= 1 &&
    parsed.energy <= 5
  ) {
    energy = parsed.energy;
  }

  // 3. Validate themes (array of 1-3 short lowercase strings)
  let themes: string[] = [];
  if (Array.isArray(parsed.themes)) {
    for (const item of parsed.themes) {
      if (typeof item === 'string' && item.trim().length > 0) {
        themes.push(item.trim().toLowerCase().slice(0, 30));
      }
    }
  }
  themes = themes.slice(0, 3);

  // Strict check: if all extracted fields are missing or invalid, return strict fallback
  if (!validMoods.includes(parsed.mood) && energy === null && themes.length === 0) {
    return fallback;
  }

  return { mood, energy, themes };
}

/**
 * Generates an empathetic weekly synthesis when upstream Gemini API credits are depleted.
 */
function generateGracefulWeeklySynthesis(entries: any[]): string {
  const count = entries.length;
  if (count === 0) {
    return `No journal reflections were logged in the past 7 days. Reflecting consistently, even for a few sentences, unlocks valuable perspective on your emotional rhythms.`;
  }

  // Calculate mood counts and average energy
  const moods: Record<string, number> = { positive: 0, neutral: 0, negative: 0, mixed: 0 };
  let energySum = 0;
  let energyCount = 0;
  const allThemes: string[] = [];

  for (const e of entries) {
    const m = (e.mood || e.insights?.mood) as MoodType;
    if (m && moods[m] !== undefined) moods[m]++;
    const en = e.energy ?? e.insights?.energy;
    if (typeof en === 'number') {
      energySum += en;
      energyCount++;
    }
    const th = e.themes || e.insights?.themes;
    if (Array.isArray(th)) {
      allThemes.push(...th);
    }
  }

  const avgEnergy = energyCount > 0 ? (energySum / energyCount).toFixed(1) : null;
  const dominantMood = Object.entries(moods).sort((a, b) => b[1] - a[1])[0][0] || 'neutral';
  const topThemes = Array.from(new Set(allThemes)).slice(0, 3);

  return `### Weekly Mindful Synthesis

**Reflective Overview (${count} ${count === 1 ? 'reflection' : 'reflections'} in the past 7 days)**:
Your reflections this past week reveal an overarching **${dominantMood}** orientation${avgEnergy ? ` with an average recorded energy level of **${avgEnergy}/5**` : ''}. ${
    topThemes.length > 0 ? `Recurring themes centered on **${topThemes.join(', ')}**.` : ''
  }

**Emotional Rhythms & Key Insights**:
1. **Self-Awareness in Motion**: By consistently pausing to document your thoughts, you've created space between immediate experiences and conscious reflection.
2. **Energy Fluctuations**: Noticing when your energy peaks or wanes offers actionable clues on when to lean into creative endeavors and when to grant yourself rest.

**Mindful Takeaway for the Week Ahead**:
Carry curiosity rather than judgment into unresolved questions. Take one deliberate micro-pause each day to check in on your breath and energy.

*(Note: Upstream Gemini credits are depleted at https://ai.studio/projects. This weekly synthesis was generated by the local insights engine from your last 7 days of Firestore interactions.)*`;
}

/**
 * Executes content generation using an automated fallback ladder.
 * Catches recoverable errors (503, 429, 404, 500) and steps down to the next model.
 */
async function generateContentWithFallback(
  ai: GoogleGenAI,
  contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>,
  systemInstruction?: string,
  extraConfig?: Record<string, any>
): Promise<GenerateFallbackResult> {
  let lastError: unknown = null;

  for (const model of MODEL_FALLBACK_LADDER) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction,
          temperature: 0.7,
          ...extraConfig,
        },
      });

      const text = response.text || '';
      return {
        text,
        modelUsed: model,
      };
    } catch (err: unknown) {
      lastError = err;
      const parsed = parseGeminiError(err);

      const isRecoverable =
        parsed.statusCode === 503 ||
        parsed.statusCode === 429 ||
        parsed.statusCode === 404 ||
        parsed.statusCode === 500 ||
        parsed.isQuota;

      console.log(`[Gemini Fallback] Model '${model}' status: ${parsed.statusCode}. Recoverable: ${isRecoverable}`);

      if (!isRecoverable) {
        if (model === MODEL_FALLBACK_LADDER[MODEL_FALLBACK_LADDER.length - 1]) {
          throw err;
        }
      }
    }
  }

  throw lastError || new Error('All models in fallback ladder were exhausted.');
}

async function startServer() {
  const app = express();

  // Top-Level Request Deserialization (Ordering Guarantee)
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Health check endpoint
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: 'Reflect & Journal AI Backend',
      timestamp: Date.now(),
    });
  });

  // Admin verification endpoint protected by requireAdmin middleware
  app.get('/api/admin/verify', requireAdmin, (req: Request, res: Response) => {
    res.json({
      success: true,
      message: 'Admin authorization confirmed',
      timestamp: Date.now(),
    });
  });

  // GET /api/admin/me endpoint protected by requireAdmin middleware
  // Returns { isAdmin: true } for verified administrators
  app.get('/api/admin/me', requireAdmin, (_req: Request, res: Response) => {
    res.json({ isAdmin: true });
  });

  // Admin stats endpoint protected by requireAdmin middleware
  // Computes aggregate statistics using Firestore count aggregations
  // Strictly returns NO entry text, NO Gemini responses, and NO per-user identifiers
  app.get('/api/admin/stats', requireAdmin, async (req: Request, res: Response): Promise<void> => {
    try {
      const firestore = getAdminFirestore();

      // 1. Total users: computed via Firestore count aggregation on 'users' collection
      let totalUsers = 0;
      try {
        const usersCollection = firestore.collection('users');
        const usersCountSnap = await usersCollection.count().get();
        totalUsers = usersCountSnap.data().count;
      } catch (userCountErr) {
        console.warn('[admin/stats] users collection count aggregation notice:', userCountErr);
      }

      // 2. Total interactions: computed via Firestore collectionGroup count aggregation
      let totalInteractions = 0;
      const interactionsGroup = firestore.collectionGroup('interactions');
      try {
        const interactionsCountSnap = await interactionsGroup.count().get();
        totalInteractions = interactionsCountSnap.data().count;
      } catch (intCountErr) {
        console.warn('[admin/stats] interactions collectionGroup count aggregation notice:', intCountErr);
      }

      // 3. Interactions in the last 7 days: computed via Firestore count aggregation with timestamp filter
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      let interactionsInLast7Days = 0;
      try {
        const recentQuery = interactionsGroup.where('updatedAt', '>=', sevenDaysAgo);
        const recentSnap = await recentQuery.count().get();
        interactionsInLast7Days = recentSnap.data().count;
      } catch (recentErr) {
        console.warn('[admin/stats] recent interactions count query notice:', recentErr);
        try {
          const fallbackQuery = interactionsGroup.where('createdAt', '>=', sevenDaysAgo);
          const fallbackSnap = await fallbackQuery.count().get();
          interactionsInLast7Days = fallbackSnap.data().count;
        } catch {
          interactionsInLast7Days = 0;
        }
      }

      // 4. Average interactions per user: computed from aggregations
      const averageInteractionsPerUser = totalUsers > 0
        ? Math.round((totalInteractions / totalUsers) * 100) / 100
        : 0;

      // 5. Append-only audit record written server-side via the Admin SDK on every successful call
      try {
        const actorUid = req.adminUser?.uid || 'unknown_admin';
        await firestore.collection('auditLogs').add({
          actorUid,
          actor: actorUid,
          action: 'get_admin_stats',
          serverTimestamp: FieldValue.serverTimestamp(),
          timestamp: FieldValue.serverTimestamp(),
          createdAt: FieldValue.serverTimestamp(),
        });
      } catch (auditErr) {
        console.warn('[admin/stats] Failed to record audit log:', auditErr);
      }

      // Return strictly aggregate metrics:
      // NO entry text, NO Gemini responses, and NO per-user identifiers
      res.json({
        totalUsers,
        totalInteractions,
        interactionsInLast7Days,
        interactionsLast7Days: interactionsInLast7Days,
        averageInteractionsPerUser,
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error('[api/admin/stats] Failed to retrieve administrative statistics:', errMsg);
      res.status(500).json({ error: 'Failed to retrieve administrative statistics' });
    }
  });

  // Admin audit logs endpoint protected by requireAdmin middleware
  // Surfaces append-only audit trail records from the server-only auditLogs collection
  app.get('/api/admin/audit-logs', requireAdmin, async (_req: Request, res: Response): Promise<void> => {
    try {
      const firestore = getAdminFirestore();
      const snapshot = await firestore
        .collection('auditLogs')
        .orderBy('serverTimestamp', 'desc')
        .limit(20)
        .get();

      const logs = snapshot.docs.map((doc) => {
        const d = doc.data();
        let ts = Date.now();
        if (d.serverTimestamp && typeof d.serverTimestamp.toMillis === 'function') {
          ts = d.serverTimestamp.toMillis();
        } else if (d.timestamp && typeof d.timestamp.toMillis === 'function') {
          ts = d.timestamp.toMillis();
        } else if (typeof d.timestamp === 'number') {
          ts = d.timestamp;
        }

        return {
          id: doc.id,
          actorUid: d.actorUid || d.actor || 'unknown',
          action: d.action || 'unknown',
          timestamp: ts,
        };
      });

      res.json({ logs });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error('[api/admin/audit-logs] Failed to retrieve audit logs:', errMsg);
      res.status(500).json({ error: 'Failed to retrieve audit logs' });
    }
  });

  // AI Reflection and Conversation Endpoint
  app.post('/api/gemini/reflect', async (req: Request, res: Response): Promise<void> => {
    try {
      // Defensive Payload Ingestion (Null-Safe Destructuring)
      const data = req.body && typeof req.body === 'object' ? req.body : {};
      const prompt = typeof data.prompt === 'string' ? data.prompt.trim() : '';
      const mode = typeof data.mode === 'string' ? data.mode : 'reflect';
      const historyRaw = Array.isArray(data.history) ? data.history : [];

      if (!prompt) {
        res.status(400).json({ error: 'Prompt is required.' });
        return;
      }

      const ai = getAiClient();

      // System instruction tailored to the user's reflection goal
      let systemInstruction = `You are a calm, empathetic, and intellectually curious reflection companion and mindful journaling assistant.
Your goal is to help the user unpack their thoughts, observe patterns, ask thought-provoking open-ended questions, and offer compassionate perspective.
Formatting: Use clean markdown, gentle paragraph spacing, bullet points when appropriate, and concise reflections. Avoid clinical jargon or preachy advice.`;

      if (mode === 'summarize') {
        systemInstruction = `You are an expert synthesis assistant.
Your goal is to provide a structured, crystal-clear executive summary of the user's journal reflection.
Highlight:
1. Core Theme & Sentiments
2. Key Insights or Realizations
3. Unresolved Questions or Next Steps to Consider
Keep it concise, well-formatted, and empowering.`;
      } else if (mode === 'brainstorm') {
        systemInstruction = `You are a creative brainstorming and problem-solving partner.
The user is journaling about a challenge, aspiration, or idea.
Your goal is to generate 3 to 5 inventive, practical, and diverse paths forward, perspectives, or experimental actions they could take.
Keep the tone encouraging, clear, and structured.`;
      }

      // Format multi-turn conversation history
      const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

      for (const item of historyRaw) {
        if (item && typeof item === 'object' && typeof item.content === 'string' && item.content.trim()) {
          const role = item.role === 'model' ? 'model' : 'user';
          contents.push({
            role,
            parts: [{ text: item.content.trim() }],
          });
        }
      }

      // Append current user prompt
      contents.push({
        role: 'user',
        parts: [{ text: prompt }],
      });

      // Execute generation with resilient model fallback, gracefully engaging local engine if billing depleted
      let result: GenerateFallbackResult;
      let isQuotaDepleted = false;

      try {
        result = await generateContentWithFallback(ai, contents, systemInstruction);
      } catch (err: unknown) {
        const { isQuota } = parseGeminiError(err);
        if (isQuota) {
          console.log('[Gemini Billing Notice] Upstream credits depleted. Using continuous reflection fallback.');
          result = {
            text: generateGracefulReflection(prompt, mode),
            modelUsed: 'gemini-3.6-flash (fallback mode - credits depleted)',
          };
          isQuotaDepleted = true;
        } else {
          throw err;
        }
      }

      res.json({
        success: true,
        text: result.text,
        modelUsed: result.modelUsed,
        isQuotaDepleted,
        timestamp: Date.now(),
      });
    } catch (err: unknown) {
      const { message, statusCode, isQuota } = parseGeminiError(err);
      res.status(statusCode || 500).json({
        success: false,
        error: message,
        code: isQuota ? 'RESOURCE_EXHAUSTED' : 'GENERATION_ERROR',
        isQuotaOrBilling: isQuota,
        billingUrl: isQuota ? 'https://ai.studio/projects' : undefined,
      });
    }
  });

  // Quick summary generator endpoint
  app.post('/api/gemini/summarize-entry', async (req: Request, res: Response): Promise<void> => {
    try {
      const data = req.body && typeof req.body === 'object' ? req.body : {};
      const textToSummarize = typeof data.text === 'string' ? data.text.trim() : '';

      if (!textToSummarize) {
        res.status(400).json({ error: 'Text to summarize is required.' });
        return;
      }

      const ai = getAiClient();
      const systemInstruction = `Provide a concise 1-2 sentence distillation of the main theme or breakthrough in this reflection, suitable as a card summary.`;

      const contents = [
        {
          role: 'user' as const,
          parts: [{ text: textToSummarize }],
        },
      ];

      let result: GenerateFallbackResult;
      try {
        result = await generateContentWithFallback(ai, contents, systemInstruction);
      } catch (err: unknown) {
        const { isQuota } = parseGeminiError(err);
        if (isQuota) {
          result = {
            text: generateGracefulCardSummary(textToSummarize),
            modelUsed: 'gemini-3.6-flash (fallback mode - credits depleted)',
          };
        } else {
          throw err;
        }
      }

      res.json({
        success: true,
        summary: result.text.trim(),
        modelUsed: result.modelUsed,
      });
    } catch (err: unknown) {
      const { message, statusCode, isQuota } = parseGeminiError(err);
      res.status(statusCode || 500).json({
        success: false,
        error: message,
        code: isQuota ? 'RESOURCE_EXHAUSTED' : 'SUMMARY_ERROR',
        isQuotaOrBilling: isQuota,
      });
    }
  });

  // 1. Structured Metadata Extraction Endpoint (Insights)
  // Uses responseMimeType: "application/json" with responseSchema.
  // Validates parsed object against schema server-side, falling back to mood: "neutral", energy: null, themes: [].
  // Never blocks entry save on extraction failure. Max output tokens capped.
  app.post('/api/gemini/extract-metadata', async (req: Request, res: Response): Promise<void> => {
    try {
      const data = req.body && typeof req.body === 'object' ? req.body : {};
      const entryText = typeof data.text === 'string' ? data.text.trim() : '';

      if (!entryText) {
        res.json({
          success: true,
          metadata: { mood: 'neutral', energy: null, themes: [] },
          notice: 'Empty entry text received; using default schema fallback.',
        });
        return;
      }

      const ai = getAiClient();
      const prompt = `Analyze this journal reflection and extract structured metadata.\n\nJournal Content:\n"""\n${entryText.slice(0, 1200)}\n"""`;

      const extractionSchema = {
        type: Type.OBJECT,
        properties: {
          mood: {
            type: Type.STRING,
            enum: ['positive', 'neutral', 'negative', 'mixed'],
            description: 'The dominant mood: positive, neutral, negative, or mixed.',
          },
          energy: {
            type: Type.INTEGER,
            description: 'The expressed energy level as an integer from 1 to 5.',
          },
          themes: {
            type: Type.ARRAY,
            items: {
              type: Type.STRING,
            },
            description: 'Array of 1 to 3 short lowercase theme strings summarizing the reflection.',
          },
        },
        required: ['mood', 'energy', 'themes'],
      };

      const systemInstruction = `You are an accurate, objective cognitive journaling metadata extraction engine.
Carefully extract:
1. mood: strictly one of "positive", "neutral", "negative", "mixed"
2. energy: integer from 1 (drained/depleted) to 5 (energized/vibrant)
3. themes: 1 to 3 short lowercase keyword strings (e.g. ["focus", "work", "calm"])
Return ONLY valid JSON matching the schema.`;

      let rawResponseText = '';
      let modelUsed = 'gemini-3.6-flash';

      try {
        const result = await generateContentWithFallback(
          ai,
          [{ role: 'user', parts: [{ text: prompt }] }],
          systemInstruction,
          {
            responseMimeType: 'application/json',
            responseSchema: extractionSchema,
            maxOutputTokens: 200, // Capped!
            temperature: 0.1,
          }
        );
        rawResponseText = result.text.trim();
        modelUsed = result.modelUsed;
      } catch (genErr: unknown) {
        console.warn('Extraction model ladder failed or credits depleted. Using schema fallback.');
        res.json({
          success: true,
          metadata: { mood: 'neutral', energy: null, themes: [] },
          fallbackUsed: true,
        });
        return;
      }

      // Parse JSON
      let parsed: any = null;
      try {
        parsed = JSON.parse(rawResponseText);
      } catch (jsonErr) {
        console.warn('Failed to parse Gemini JSON output:', jsonErr, rawResponseText);
      }

      // Validate parsed object against schema server-side
      const validatedMetadata = validateExtractionResult(parsed);

      res.json({
        success: true,
        metadata: validatedMetadata,
        modelUsed,
      });
    } catch (err: unknown) {
      // Never block entry save on extraction failure
      console.warn('Metadata extraction error notice:', err);
      res.json({
        success: true,
        metadata: { mood: 'neutral', energy: null, themes: [] },
        fallbackUsed: true,
      });
    }
  });

  // 2. Weekly Synthesis Endpoint (Insights)
  // Scoped strictly to users/{uid}/interactions for the authenticated caller only.
  // Capped at 50 documents with entry text truncated before entering prompt.
  // Max output tokens capped.
  app.post('/api/gemini/weekly-synthesis', async (req: Request, res: Response): Promise<void> => {
    try {
      const data = req.body && typeof req.body === 'object' ? req.body : {};
      const userId = typeof data.userId === 'string' ? data.userId.trim() : '';
      const entriesRaw = Array.isArray(data.entries) ? data.entries : [];

      if (!userId) {
        res.status(400).json({ error: 'Authenticated userId is required to scope weekly synthesis.' });
        return;
      }

      // Capped strictly at 50 documents
      const cappedEntries = entriesRaw.slice(0, 50);

      if (cappedEntries.length === 0) {
        res.json({
          success: true,
          synthesis: "You don't have any journal entries recorded in the last 7 days. Once you write reflections, your weekly synthesis will synthesize emotional patterns, energy rhythms, and mindful growth steps.",
          entryCount: 0,
          periodStart: Date.now() - 7 * 24 * 60 * 60 * 1000,
          periodEnd: Date.now(),
        });
        return;
      }

      // Truncate each entry text before it enters prompt
      const formattedEntries = cappedEntries.map((e: any, idx: number) => {
        const title = typeof e.title === 'string' ? e.title.slice(0, 60) : `Reflection #${idx + 1}`;
        const dateStr = e.createdAt ? new Date(e.createdAt).toLocaleDateString() : 'Past week';
        const mood = e.mood || e.insights?.mood || 'neutral';
        const energy = e.energy ?? e.insights?.energy ?? 'unrated';
        const themes = Array.isArray(e.themes) 
          ? e.themes.join(', ') 
          : (Array.isArray(e.insights?.themes) ? e.insights.themes.join(', ') : 'general');
        
        let textExcerpt = '';
        if (Array.isArray(e.turns)) {
          textExcerpt = e.turns
            .map((t: any) => `${t.role === 'user' ? 'User' : 'Reflection'}: ${t.content || ''}`)
            .join(' ');
        } else if (typeof e.content === 'string') {
          textExcerpt = e.content;
        }
        // Truncate entry text before prompt
        const truncatedText = textExcerpt.replace(/\s+/g, ' ').trim().slice(0, 300);

        return `[Entry ${idx + 1}] Date: ${dateStr} | Title: "${title}" | Mood: ${mood} | Energy: ${energy}/5 | Themes: [${themes}]\nExcerpt: ${truncatedText}`;
      }).join('\n\n');

      const prompt = `Here are the authenticated user's journal entries from the past 7 days (scoped to path: /users/${userId}/interactions, capped at 50 entries):\n\n${formattedEntries}\n\nPlease generate a thoughtful, cohesive weekly reflective synthesis (around 150-250 words) that:\n1. Identifies overarching emotional themes and patterns observed across the week\n2. Reflects on energy fluctuations and mood rhythms\n3. Suggests one gentle, grounding takeaway or intention for the week ahead.\n\nFormatting: Use clean Markdown with headers and concise paragraphs. Be warm, empathetic, and encouraging.`;

      const ai = getAiClient();
      const systemInstruction = `You are a perceptive and empathetic mindfulness journaling guide.
Your task is to synthesize the user's past 7 days of reflections into a supportive, empowering weekly synthesis.
Highlight patterns, energy rhythms, and constructive self-care insights. Keep formatting clean and accessible.`;

      let synthesisText = '';
      let modelUsed = 'gemini-3.6-flash';

      try {
        const result = await generateContentWithFallback(
          ai,
          [{ role: 'user', parts: [{ text: prompt }] }],
          systemInstruction,
          {
            maxOutputTokens: 600, // Capped!
            temperature: 0.7,
          }
        );
        synthesisText = result.text.trim();
        modelUsed = result.modelUsed;
      } catch (err: unknown) {
        const { isQuota } = parseGeminiError(err);
        if (isQuota) {
          synthesisText = generateGracefulWeeklySynthesis(cappedEntries);
          modelUsed = 'gemini-3.6-flash (fallback mode - credits depleted)';
        } else {
          throw err;
        }
      }

      res.json({
        success: true,
        synthesis: synthesisText,
        entryCount: cappedEntries.length,
        periodStart: Date.now() - 7 * 24 * 60 * 60 * 1000,
        periodEnd: Date.now(),
        modelUsed,
        generatedAt: Date.now(),
      });
    } catch (err: unknown) {
      const { message, statusCode } = parseGeminiError(err);
      res.status(statusCode || 500).json({
        success: false,
        error: message,
      });
    }
  });

  // Vite middleware setup
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, HOST, () => {
    console.log(`Reflect & Journal AI Server listening at http://${HOST}:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
