// onDeviceSlm.ts
// On-device intent inference adapter.
// This file is designed so you can swap the heuristic fallback with a real Phi-3/Gemma runtime.

import Constants from 'expo-constants';
import type { ClientIntent } from './api';

export interface LocalSignals {
  weather: string;
  tod: string;
  movement_speed: 'slow' | 'medium' | 'fast';
  dwell_time_seconds: number;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Heuristic fallback for when no local SLM is available or inference fails.
 * Ensures the app remains functional in offline/low-resource modes.
 */
function heuristicIntent(signals: LocalSignals): ClientIntent {
  const weather = (signals.weather || '').toLowerCase();
  const tod = (signals.tod || '').toLowerCase();
  const speed = signals.movement_speed;
  const dwell = signals.dwell_time_seconds;

  let intent: ClientIntent['intent'] = 'browse';
  let urgency: ClientIntent['urgency'] = 'low';
  let confidence = 0.58;

  if ((weather.includes('rain') || weather.includes('drizzle') || weather.includes('snow')) && speed === 'slow') {
    intent = 'warm_drink';
    urgency = dwell > 80 ? 'high' : 'medium';
    confidence = 0.82;
  } else if (tod === 'morning' && dwell > 45) {
    intent = 'hot_food';
    urgency = 'medium';
    confidence = 0.75;
  } else if (tod === 'evening' && dwell > 60) {
    intent = 'dining';
    urgency = 'medium';
    confidence = 0.72;
  } else if (speed === 'fast') {
    intent = 'commute';
    urgency = 'low';
    confidence = 0.78;
  }

  return { intent, urgency, confidence: clamp01(confidence) };
}

/**
 * Creates a dense instruction prompt for on-device SLMs (Phi-3, Gemma, etc.)
 * designed to minimize tokens and maximize JSON reliability.
 */
function makeSystemPrompt(): string {
  return [
    'You are a local intent classifier for City Wallet.',
    'Task: Based on user signals, determine intent, urgency, and confidence.',
    'Intents: warm_drink, hot_food, browse, commute, dining.',
    'Urgency: low, medium, high.',
    'Output: STRICT JSON only. Example: {"intent": "warm_drink", "urgency": "high", "confidence": 0.9}',
    'NO explanation, NO markdown fences.'
  ].join('\n');
}

function makeUserPrompt(signals: LocalSignals): string {
  return JSON.stringify({
    weather: signals.weather,
    time: signals.tod,
    speed: signals.movement_speed,
    dwell_sec: signals.dwell_time_seconds
  });
}

/**
 * Calls a local model runtime (Ollama or OpenAI-compatible like MLC LLM).
 */
async function tryRuntimeIntent(signals: LocalSignals): Promise<ClientIntent | null> {
  const config = Constants.expoConfig?.extra || {};
  const endpoint = config.ON_DEVICE_SLM_ENDPOINT as string | undefined;
  const provider = (config.SLM_PROVIDER || 'ollama').toLowerCase();
  
  if (!endpoint) return null;

  try {
    const isOllama = provider === 'ollama';
    const body = isOllama 
      ? {
          model: config.SLM_MODEL || 'phi3',
          prompt: `${makeSystemPrompt()}\n\nUser Signals: ${makeUserPrompt(signals)}\nJSON:`,
          stream: false,
          options: { temperature: 0.1 }
        }
      : {
          model: config.SLM_MODEL || 'local-model',
          messages: [
            { role: 'system', content: makeSystemPrompt() },
            { role: 'user', content: makeUserPrompt(signals) }
          ],
          temperature: 0.1
        };

    console.info(`[SLM] Using ${provider} at ${endpoint}`);
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      console.warn(`[SLM] Runtime error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    let rawText = '';

    if (isOllama) {
      rawText = data.response || '';
    } else {
      // OpenAI format
      rawText = data.choices?.[0]?.message?.content || '';
    }

    console.debug(`[SLM] Raw output: ${rawText}`);

    // Robust JSON extraction (handles cases where models add markdown fences)
    const jsonMatch = rawText.match(/\{.*\}/s);
    if (!jsonMatch) return null;
    
    const parsed = JSON.parse(jsonMatch[0]);

    if (!parsed?.intent || !parsed?.urgency) return null;

    return {
      intent: parsed.intent,
      urgency: parsed.urgency,
      confidence: clamp01(Number(parsed.confidence ?? 0.7)),
    };
  } catch (err) {
    console.warn(`[SLM] Inference failed: ${err}`);
    return null;
  }
}

/**
 * Primary entry point for on-device personalization.
 * Orchestrates local SLM inference with a heuristic fallback.
 */
export async function inferIntentOnDevice(signals: LocalSignals): Promise<ClientIntent> {
  const runtimeIntent = await tryRuntimeIntent(signals);
  if (runtimeIntent) {
    console.info(`[SLM] Successfully inferred intent: ${runtimeIntent.intent}`);
    return runtimeIntent;
  }

  console.info(`[SLM] Falling back to heuristic engine`);
  return heuristicIntent(signals);
}
