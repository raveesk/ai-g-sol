import express, { Request, Response } from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';

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

/**
 * Executes content generation using an automated fallback ladder.
 * Catches recoverable errors (503, 429, 404, 500) and steps down to the next model.
 */
async function generateContentWithFallback(
  ai: GoogleGenAI,
  contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>,
  systemInstruction: string
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
