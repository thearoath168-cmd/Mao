// The research agent: Claude + server-side web search restricted to trusted medical domains.
// Streams progress (search queries, sources found) back to the caller through onEvent().

import { MEDICINE_DOMAINS, PATHOLOGY_DOMAINS, medicinePrompt, pathologyPrompt } from './prompts.js';
import { fetchOpenFdaLabel } from './openfda.js';

const API_URL = `${process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com'}/v1/messages`;

export function agentConfig(env = process.env) {
  return {
    apiKey: env.ANTHROPIC_API_KEY || '',
    model: env.CLAUDE_MODEL || 'claude-sonnet-5-5',
    searchTool: env.WEB_SEARCH_TOOL || 'web_search_20250305',
    maxSearches: Number(env.MAX_SEARCHES || 12),
    maxTokens: Number(env.MAX_TOKENS || 32000),
    openFdaKey: env.OPENFDA_API_KEY || '',
  };
}

export async function runResearch({ mode, query, lang = 'en', signal, onEvent = () => {} }, cfg = agentConfig()) {
  let labelExcerpt = '';
  let labelSource = null;
  if (mode === 'medicine') {
    onEvent('status', { step: 'label', text: 'Fetching official label from openFDA / DailyMed…' });
    const label = await fetchOpenFdaLabel(query, { apiKey: cfg.openFdaKey });
    if (label) {
      labelExcerpt = label.excerpt;
      labelSource = label.source;
      onEvent('source', { title: label.source.title, url: label.source.url });
    }
  }

  const prompt = mode === 'medicine'
    ? medicinePrompt(query, lang, labelExcerpt)
    : pathologyPrompt(query, lang);

  const tool = {
    type: cfg.searchTool,
    name: 'web_search',
    max_uses: cfg.maxSearches,
    allowed_domains: mode === 'medicine' ? MEDICINE_DOMAINS : PATHOLOGY_DOMAINS,
  };
  // Newer tool versions default to dynamic filtering through code execution; call search directly.
  if (cfg.searchTool !== 'web_search_20250305') tool.allowed_callers = ['direct'];

  const messages = [{ role: 'user', content: prompt }];
  const queries = [];
  const consulted = new Map();
  let finalText = '';
  let lastStop = null;

  // The API may return stop_reason "pause_turn" on long research turns: send the partial turn back to continue.
  for (let round = 0; round < 5; round++) {
    const msg = await streamMessage({
      model: cfg.model,
      max_tokens: cfg.maxTokens,
      tools: [tool],
      messages,
    }, cfg.apiKey, signal, (block) => {
      if (block.type === 'server_tool_use' && block.input?.query) {
        queries.push(block.input.query);
        onEvent('status', { step: 'search', text: block.input.query });
      }
      if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
        for (const r of block.content) {
          if (r.url && !consulted.has(r.url)) {
            consulted.set(r.url, { title: r.title, url: r.url, page_age: r.page_age || '' });
            onEvent('source', { title: r.title, url: r.url });
          }
        }
      }
      if (block.type === 'text' && block.text.includes('```json')) {
        onEvent('status', { step: 'writing', text: 'Writing monograph…' });
      }
    });

    finalText += msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    lastStop = msg.stop_reason;
    if (msg.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content: msg.content });
      continue;
    }
    break;
  }

  let data = extractJson(finalText);
  if (!data) {
    // Repair pass: the answer was cut off or malformed. Ask Claude (no tools) to rewrite it as valid JSON.
    console.warn(`[agent] unreadable answer (stop_reason=${lastStop}, ${finalText.length} chars). Start: ${finalText.slice(0, 300).replace(/\s+/g, ' ')}`);
    onEvent('status', { step: 'repair', text: 'Formatting the result…' });
    const repair = await streamMessage({
      model: cfg.model,
      max_tokens: cfg.maxTokens,
      messages: [{
        role: 'user',
        content: `${prompt}\n\n---\nThe research has ALREADY been done. Below are the research notes / draft answer` +
          `${lastStop === 'max_tokens' ? ' (it was CUT OFF by the length limit)' : ' (it was not valid JSON)'}.` +
          ` Do NOT search again. Using only this material, reply with ONLY the complete, valid JSON object in the shape above.` +
          ` Keep every string short (max ~25 words), at most 18 algorithm nodes and 12 interactions, so it fits.` +
          ` Keep source URLs exactly as given.\n\n<draft>\n${finalText.slice(0, 120000)}\n</draft>`,
      }],
    }, cfg.apiKey, signal, () => {});
    const repairText = repair.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    data = extractJson(repairText);
    if (!data) {
      console.warn(`[agent] repair failed (stop_reason=${repair.stop_reason}). Start: ${repairText.slice(0, 300).replace(/\s+/g, ' ')}`);
      throw new Error('The agent did not return a readable result. Try again, or use a more specific search (e.g. "acute diarrhea in adults").');
    }
  }

  // Make sure the official label appears in the sources even if the model forgot it.
  if (labelSource && Array.isArray(data.sources) && !data.sources.some((s) => s.url === labelSource.url)) {
    data.sources.push(labelSource);
  }
  return {
    data,
    meta: {
      mode, query, lang,
      model: cfg.model,
      generated_at: new Date().toISOString(),
      searches: queries,
      consulted: [...consulted.values()],
    },
  };
}

// ---- Anthropic streaming (SSE) -------------------------------------------------------------

async function streamMessage(body, apiKey, signal, onBlock) {
  const res = await fetch(API_URL, {
    method: 'POST',
    signal,
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ ...body, stream: true }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    let msg = errText;
    try { msg = JSON.parse(errText).error?.message || errText; } catch {}
    throw new Error(`Claude API ${res.status}: ${msg.slice(0, 300)}`);
  }

  const message = { content: [], stop_reason: null };
  const partialJson = {};
  const decoder = new TextDecoder();
  let buffer = '';

  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let idx;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const raw = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const dataLine = raw.split('\n').find((l) => l.startsWith('data:'));
      if (!dataLine) continue;
      let ev;
      try { ev = JSON.parse(dataLine.slice(5).trim()); } catch { continue; }

      switch (ev.type) {
        case 'content_block_start': {
          const block = structuredClone(ev.content_block);
          message.content[ev.index] = block;
          if (block.type === 'web_search_tool_result') onBlock(block);
          break;
        }
        case 'content_block_delta': {
          const block = message.content[ev.index];
          const d = ev.delta;
          if (d.type === 'text_delta') block.text = (block.text || '') + d.text;
          else if (d.type === 'input_json_delta') partialJson[ev.index] = (partialJson[ev.index] || '') + d.partial_json;
          else if (d.type === 'citations_delta') (block.citations ||= []).push(d.citation);
          break;
        }
        case 'content_block_stop': {
          const block = message.content[ev.index];
          if (partialJson[ev.index] !== undefined) {
            try { block.input = JSON.parse(partialJson[ev.index] || '{}'); } catch { block.input = {}; }
          }
          if (block.type === 'server_tool_use' || block.type === 'text') onBlock(block);
          break;
        }
        case 'message_delta':
          if (ev.delta?.stop_reason) message.stop_reason = ev.delta.stop_reason;
          break;
        case 'error':
          throw new Error(`Claude API stream error: ${ev.error?.message || 'unknown'}`);
      }
    }
  }
  message.content = message.content.filter(Boolean);
  return message;
}

// Tolerant JSON extraction: fenced block (closed or not), else first "{" .. last "}".
// Also tolerates trailing commas and smart quotes around keys.
export function extractJson(text) {
  if (!text) return null;
  const candidates = [];
  const fences = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].reverse().map((m) => m[1]);
  candidates.push(...fences);
  const open = text.lastIndexOf('```json');
  if (open !== -1) candidates.push(text.slice(open + 7));
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a !== -1 && b > a) candidates.push(text.slice(a, b + 1));
  for (const raw of candidates) {
    const c = raw.trim();
    for (const variant of [c, c.replace(/,\s*([}\]])/g, '$1').replace(/[\u201C\u201D]/g, '"')]) {
      try {
        const v = JSON.parse(variant);
        if (v && typeof v === 'object') return v;
      } catch {}
    }
  }
  return null;
}
