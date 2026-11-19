import 'dotenv/config';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express, { type Request, type Response } from 'express';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

interface IncomingChatMessage {
  role: 'user' | 'model';
  text: string;
}

interface CatalogSummaryItem {
  id: string;
  name: string;
  category: string;
  price: number;
  unit: string;
  inStock: boolean;
  stock: number;
  specs: string;
}

interface MaterialItem {
  name: string;
  qty: number;
  purpose: string;
  catalogProductId: string;
}

interface AdvisorJsonResponse {
  reply: string;
  materials: MaterialItem[];
}

const PORT = Number(process.env.PORT) || 3000;
const PRIMARY_MODEL = 'gemini-4-hydrogen';
const FALLBACK_MODEL = 'gemini-3.1-flash-lite';

function createAiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      timeout: 10000,
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function buildSystemInstruction(catalog: CatalogSummaryItem[]): string {
  const inventoryLines =
    catalog.length > 0
      ? catalog
          .slice(0, 80)
          .map(
            (p) =>
              `- id="${p.id}" | ${p.name} | ${p.category} | ₹${p.price}/${p.unit} | ${
                p.inStock && p.stock > 0 ? `In Stock (${p.stock})` : 'Out of Stock'
              } | ${p.specs}`
          )
          .join('\n')
      : 'Catalog not provided.';

  return `You are Gemini Bot, an expert electronics and components assistant for Tronic World (Pune - Nagar Rd, Wagholi, Pune, Maharashtra 412207 · Open Daily 11:00 AM - 6:00 PM, Wed until 6:30 PM · Phone: 093562 93772).

Your role:
1. Answer any question about electronics, semiconductors, active/passive components, sensors, microcontrollers (Arduino, ESP32, Raspberry Pi, STM32, PIC), power electronics, transformers, relays, motor drivers, communication protocols (I2C, SPI, UART, CAN, PWM), pinouts, datasheet specs, Ohm's law / resistor / capacitor calculations, circuit troubleshooting, and component comparisons.
2. When a user asks what components are needed for a project or asks for part recommendations / alternatives, give clear technical guidance AND include matching parts in the "materials" array so they can inspect prices or add stocked items straight to their cart.
3. Match components to Tronic World's Live Inventory below whenever a stocked part fits by setting "catalogProductId" to its exact id string. If a recommended part is not in the live catalog, set "catalogProductId" to "" and mention they can enquire at the Wagholi store or call 093562 93772.
4. If the user is asking a purely conceptual, theory, pinout, coding, or troubleshooting question and is not looking for parts to buy, return "materials": [].
5. Keep answers accurate, practical, concise, and beginner-to-engineer friendly. Never invent store prices outside the live inventory list below.

Live Tronic World Inventory:
${inventoryLines}`;
}

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    reply: {
      type: Type.STRING,
      description:
        'Clear, accurate conversational response answering any electronics, component, circuit, pinout, or project question.',
    },
    materials: {
      type: Type.ARRAY,
      description:
        'Relevant purchasable components or project Bill of Materials when the user asks about parts to use/buy or a project build. Leave as an empty array [] for pure theory, troubleshooting, or general electronics questions.',
      items: {
        type: Type.OBJECT,
        properties: {
          name: {
            type: Type.STRING,
            description: 'Component or material name (e.g., HC-SR04 Ultrasonic Sensor).',
          },
          qty: {
            type: Type.INTEGER,
            description: 'Recommended quantity needed (minimum 1).',
          },
          purpose: {
            type: Type.STRING,
            description: 'Short explanation of what this component does or why it fits.',
          },
          catalogProductId: {
            type: Type.STRING,
            description:
              'Exact product id from the Live Tronic World Inventory if stocked/listed there, otherwise empty string "".',
          },
        },
        required: ['name', 'qty', 'purpose', 'catalogProductId'],
      },
    },
  },
  required: ['reply', 'materials'],
};

function parseGeminiAdvisorResponse(rawText: string | undefined): AdvisorJsonResponse {
  const trimmed = (rawText ?? '').trim();
  if (!trimmed) {
    return {
      reply: 'I could not generate a response for that query. Please try rephrasing your project question.',
      materials: [],
    };
  }

  const cleaned = trimmed
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    const parsed = JSON.parse(cleaned) as Partial<AdvisorJsonResponse>;
    const reply =
      typeof parsed.reply === 'string' && parsed.reply.trim().length > 0
        ? parsed.reply.trim()
        : trimmed;
    const materials = Array.isArray(parsed.materials)
      ? parsed.materials
          .filter((item) => item && typeof item.name === 'string' && item.name.trim().length > 0)
          .slice(0, 20)
          .map((item) => ({
            name: String(item.name).trim(),
            qty: Math.max(1, Math.min(100, Math.round(Number(item.qty) || 1))),
            purpose: typeof item.purpose === 'string' ? item.purpose.trim() : '',
            catalogProductId:
              typeof item.catalogProductId === 'string' ? item.catalogProductId.trim() : '',
          }))
      : [];
    return { reply, materials };
  } catch {
    return { reply: trimmed, materials: [] };
  }
}

function normalizeHistory(messages: IncomingChatMessage[]) {
  const normalized: IncomingChatMessage[] = [];
  for (const m of messages) {
    if (normalized.length === 0) {
      if (m.role === 'user') normalized.push({ ...m });
      continue;
    }
    const prev = normalized[normalized.length - 1];
    if (prev.role === m.role) {
      prev.text = `${prev.text}\n\n${m.text}`;
    } else {
      normalized.push({ ...m });
    }
  }
  return normalized.map((m) => ({
    role: m.role,
    parts: [{ text: m.text }],
  }));
}

function extractReadableError(err: unknown): { status: number; message: string } {
  const errObj = err as { status?: number; message?: string };
  let status = typeof errObj?.status === 'number' ? errObj.status : 500;
  let message = errObj?.message || 'Failed to reach Gemini advisor.';

  if (message.startsWith('{')) {
    try {
      const parsed = JSON.parse(message) as {
        error?: { code?: number; message?: string; status?: string };
      };
      if (parsed?.error?.message) {
        message = parsed.error.message;
      }
      if (typeof parsed?.error?.code === 'number') {
        status = parsed.error.code;
      }
    } catch {
      // keep original message
    }
  }

  return { status, message };
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callGeminiChatWithRetry(
  ai: GoogleGenAI,
  history: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>,
  latestText: string,
  systemInstruction: string
) {
  const attempts: Array<{ model: string; waitMs: number; useLowThinking: boolean }> = [
    { model: PRIMARY_MODEL, waitMs: 0, useLowThinking: true },
    { model: FALLBACK_MODEL, waitMs: 250, useLowThinking: false },
    { model: FALLBACK_MODEL, waitMs: 700, useLowThinking: false },
  ];

  let lastError: unknown;

  for (const attempt of attempts) {
    if (attempt.waitMs > 0) {
      await delay(attempt.waitMs);
    }

    try {
      const chat = ai.chats.create({
        model: attempt.model,
        history,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
          ...(attempt.useLowThinking
            ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
            : {}),
        },
      });

      const response = await chat.sendMessage({ message: latestText });
      return response;
    } catch (err) {
      lastError = err;
      const { status, message } = extractReadableError(err);
      const lowerMsg = message.toLowerCase();
      const isTransient =
        status === 504 ||
        status === 503 ||
        status === 500 ||
        status === 429 ||
        message.includes('UNAVAILABLE') ||
        message.includes('DEADLINE_EXCEEDED') ||
        lowerMsg.includes('high demand') ||
        lowerMsg.includes('timeout') ||
        lowerMsg.includes('aborted');
      if (!isTransient) {
        throw err;
      }
      console.warn(
        `Gemini transient error on ${attempt.model} (status ${status}): ${message}`
      );
    }
  }

  throw lastError;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '256kb' }));

  app.post('/api/chat', async (req: Request, res: Response) => {
    const ai = createAiClient();
    if (!ai) {
      res.status(503).json({
        error:
          'Gemini API key is not configured. Add GEMINI_API_KEY in Settings > Secrets to enable the Project Components Advisor.',
      });
      return;
    }

    const body = req.body as {
      messages?: unknown;
      catalog?: unknown;
    };

    if (!Array.isArray(body?.messages) || body.messages.length === 0) {
      res.status(400).json({ error: 'Please send at least one message.' });
      return;
    }

    const sanitizedMessages: IncomingChatMessage[] = body.messages
      .filter(
        (m): m is { role: unknown; text: unknown } =>
          typeof m === 'object' && m !== null && 'role' in m && 'text' in m
      )
      .map((m) => ({
        role: (m.role === 'model' ? 'model' : 'user') as 'user' | 'model',
        text: typeof m.text === 'string' ? m.text.trim().slice(0, 4000) : '',
      }))
      .filter((m) => m.text.length > 0)
      .slice(-20);

    if (sanitizedMessages.length === 0) {
      res.status(400).json({ error: 'Message text cannot be empty.' });
      return;
    }

    const latestMessage = sanitizedMessages[sanitizedMessages.length - 1];
    if (latestMessage.role !== 'user') {
      res.status(400).json({ error: 'The latest message must come from the user.' });
      return;
    }

    const catalog: CatalogSummaryItem[] = Array.isArray(body?.catalog)
      ? body.catalog
          .filter(
            (p): p is Record<string, unknown> => typeof p === 'object' && p !== null
          )
          .slice(0, 80)
          .map((p) => ({
            id: String(p.id ?? '').slice(0, 80),
            name: String(p.name ?? '').slice(0, 140),
            category: String(p.category ?? '').slice(0, 60),
            price: Number(p.price) || 0,
            unit: String(p.unit ?? 'pc').slice(0, 32),
            inStock: Boolean(p.inStock),
            stock: Number(p.stock) || 0,
            specs: String(p.specs ?? '').slice(0, 200),
          }))
      : [];

    const validHistory = normalizeHistory(sanitizedMessages.slice(0, -1));

    try {
      const response = await callGeminiChatWithRetry(
        ai,
        validHistory,
        latestMessage.text,
        buildSystemInstruction(catalog)
      );

      const parsed = parseGeminiAdvisorResponse(response.text);
      res.json(parsed);
    } catch (err: unknown) {
      console.error('Gemini chat error:', err);
      const { status, message } = extractReadableError(err);

      if (status === 400 || status === 403 || message.includes('API_KEY_INVALID')) {
        res.status(status).json({
          error:
            'Unable to authenticate with Gemini API. Please check your GEMINI_API_KEY in Settings > Secrets.',
        });
        return;
      }

      if (status === 429 || message.includes('RESOURCE_EXHAUSTED')) {
        res.status(429).json({
          error:
            'Gemini request limit reached right now. Please wait a few seconds and try again.',
        });
        return;
      }

      res.status(status >= 400 && status < 600 ? status : 500).json({
        error: message,
      });
    }
  });

  const httpServer = http.createServer(app);
  const isProduction = process.env.NODE_ENV === 'production';
  const distDir = path.resolve(process.cwd(), 'dist');

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const isHmrDisabled = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      plugins: isHmrDisabled
        ? [
            {
              name: 'disable-hmr-client-ws',
              enforce: 'post',
              transform(code: string, id: string) {
                if (id.replace(/\\/g, '/').endsWith('/vite/dist/client/client.mjs')) {
                  return code.replace(
                    /const transport = normalizeModuleRunnerTransport\(\(\(\) => \{[\s\S]*?\r?\n\}\)\(\)\);/,
                    'const transport = normalizeModuleRunnerTransport({ connect() {}, disconnect() {}, send() {} });'
                  );
                }
              },
            },
          ]
        : [],
      server: {
        middlewareMode: true,
        allowedHosts: true,
        ws: isHmrDisabled ? false : { server: httpServer },
        hmr: isHmrDisabled ? false : { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Tronic World server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Tronic World server:', err);
  process.exit(1);
});
