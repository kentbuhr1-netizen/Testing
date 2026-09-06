#!/usr/bin/env node
/**
 * Hand a well-scoped task to ChatGPT and print what comes back.
 *
 *   node tools/delegate.mjs <task> [files...] [--prompt "extra instructions"] [--dry-run]
 *
 * Tasks:
 *   review    a second-opinion code review of a diff or file — bugs, missed
 *             cases, anything a tired reviewer would skip. Findings only,
 *             ranked by severity, each with the line it points at.
 *   tests     propose test cases for a module, named as sentences about
 *             behaviour the way this repo's tests are, without writing code.
 *   copy      draft or tighten store copy — a listing, a privacy policy, a
 *             changelog — from the files given.
 *   explain   explain what a file does and where it is likely to break.
 *   ask       a bare prompt with the files attached; --prompt is the question.
 *
 * Why this exists: the build fleet runs on Claude. Kent's routing policy
 * sends bounded technical work — reviews, test ideas, drafts — to a cheaper
 * second model and keeps judgement here. This is the smallest thing that
 * does that. It has no dependencies, reads the key from the environment,
 * never writes anything, and its output is advice: whoever ran it decides
 * what to do with it.
 *
 * Needs OPENAI_API_KEY in the environment. OPENAI_MODEL overrides the model.
 * In a Claude Code environment the network policy must also allow
 * api.openai.com, or the request is refused at the proxy with a 403.
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

export const DEFAULT_MODEL = 'gpt-5';
export const ENDPOINT = 'https://api.openai.com/v1/chat/completions';
export const MAX_FILE_CHARS = 120_000;

const HOUSE = `You are a second reviewer for a series of phone-first browser games:
plain ES modules, no build step, no framework, no network calls, a pure
DOM-free simulation that node can play headlessly, and seeded determinism
(the same seed always replays the same run). Tests are named as sentences
about behaviour. Targets are measured by reference players, never guessed.
Do not propose frameworks, dependencies, build steps or Math.random() in
the simulation. Be specific and short; say nothing you are not sure of.`;

export const TASKS = {
  review: {
    system: `${HOUSE}\nReview the material for correctness bugs, missed edge cases and behaviour that contradicts the comments. Report findings only, most severe first, each as: file:line — what is wrong — how to see it fail. If you find nothing, say so in one line.`,
    needsFiles: true,
  },
  tests: {
    system: `${HOUSE}\nPropose test cases for the material. Each is one sentence naming the behaviour ("a yard that runs dry still owes every wage") followed by one line on how to set it up. Do not write code. Skip anything the existing tests in the material already cover.`,
    needsFiles: true,
  },
  copy: {
    system: `You write store copy for small, honest, single-purpose mobile games: App Store and Google Play listings, privacy policies, changelogs. Plain words, no hype, no claims the game cannot keep. Keep the author's facts; fix only the prose.`,
    needsFiles: true,
  },
  explain: {
    system: `${HOUSE}\nExplain what the material does in plain prose — its inputs, its outputs, the invariants it relies on — and then list where it is most likely to break and why.`,
    needsFiles: true,
  },
  ask: {
    system: HOUSE,
    needsFiles: false,
  },
};

/** Parse argv into { task, files, prompt, dryRun }. Pure, so it can be tested. */
export function parseArgs(argv) {
  const out = { task: null, files: [], prompt: '', dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--prompt') out.prompt = argv[++i] ?? '';
    else if (a.startsWith('--')) throw new Error(`unknown flag ${a}`);
    else if (out.task == null) out.task = a;
    else out.files.push(a);
  }
  if (out.task == null || !(out.task in TASKS)) {
    throw new Error(`task must be one of: ${Object.keys(TASKS).join(', ')}`);
  }
  if (TASKS[out.task].needsFiles && out.files.length === 0) {
    throw new Error(`${out.task} needs at least one file`);
  }
  if (out.task === 'ask' && !out.prompt) throw new Error('ask needs --prompt');
  return out;
}

/** Turn the files into one fenced block per file, capped so a stray bundle cannot blow the request. */
export function attach(files, read = (f) => readFileSync(f, 'utf8')) {
  let total = 0;
  const parts = [];
  for (const f of files) {
    let text = read(f);
    if (total + text.length > MAX_FILE_CHARS) {
      text = text.slice(0, Math.max(0, MAX_FILE_CHARS - total)) + '\n…[truncated]';
    }
    total += text.length;
    parts.push(`### ${basename(f)}\n\`\`\`\n${text}\n\`\`\``);
    if (total >= MAX_FILE_CHARS) break;
  }
  return parts.join('\n\n');
}

/** Build the request body. Pure. */
export function buildRequest({ task, files, prompt }, { model = DEFAULT_MODEL, read } = {}) {
  const spec = TASKS[task];
  const user = [prompt, files.length ? attach(files, read) : ''].filter(Boolean).join('\n\n');
  return {
    model,
    messages: [
      { role: 'system', content: spec.system },
      { role: 'user', content: user },
    ],
  };
}

export async function delegate(args, { fetchImpl = fetch, env = process.env } = {}) {
  const key = env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY is not set — add it to the environment, never to the repo');
  const body = buildRequest(args, { model: env.OPENAI_MODEL || DEFAULT_MODEL });
  const res = await fetchImpl(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OpenAI returned ${res.status}${text ? `: ${text.slice(0, 300)}` : ''}`);
  }
  const json = await res.json();
  const content = json.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('OpenAI returned no message content');
  return { model: json.model ?? body.model, content, usage: json.usage ?? null };
}

// CLI entry. Guarded so the module can be imported by tests without running.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.dryRun) {
      const body = buildRequest(args, { model: process.env.OPENAI_MODEL || DEFAULT_MODEL });
      console.log(JSON.stringify(body, null, 2));
      process.exit(0);
    }
    const { model, content, usage } = await delegate(args);
    console.log(content.trim());
    if (usage) console.error(`\n[${model}: ${usage.prompt_tokens ?? '?'} in, ${usage.completion_tokens ?? '?'} out]`);
  } catch (err) {
    console.error(`delegate: ${err.message}`);
    process.exit(1);
  }
}
