// Lê o comprovante (imagem) com o Gemini e devolve os campos extraídos. A decisão fica em proof.js.
import { callGemini } from './ai.js';
import { PROMPT_EXTRACT } from './proof.js';

export async function extractProof({ data, mimeType }) {
  const res = await callGemini({
    contents: [{ role: 'user', parts: [{ text: PROMPT_EXTRACT }, { inlineData: { mimeType, data } }] }],
    generationConfig: { temperature: 0, maxOutputTokens: 1024, responseMimeType: 'application/json' },
  });
  const txt = (res.candidates?.[0]?.content?.parts || []).filter((p) => p.text && !p.thought).map((p) => p.text).join('').trim();
  try { return JSON.parse(txt.replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch { return null; }
}
