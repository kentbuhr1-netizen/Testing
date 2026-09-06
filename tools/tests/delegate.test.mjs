import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, attach, buildRequest, delegate, TASKS, MAX_FILE_CHARS, DEFAULT_MODEL } from '../delegate.mjs';

test('every task has a system prompt, and the technical ones insist on files', () => {
  for (const [name, spec] of Object.entries(TASKS)) {
    assert.ok(spec.system.length > 50, `${name} has a real prompt`);
  }
  assert.equal(TASKS.review.needsFiles, true);
  assert.equal(TASKS.ask.needsFiles, false);
});

test('a review of two files parses, and an unknown task is refused by name', () => {
  const args = parseArgs(['review', 'a.js', 'b.js', '--prompt', 'focus on the save path', '--dry-run']);
  assert.deepEqual(args, { task: 'review', files: ['a.js', 'b.js'], prompt: 'focus on the save path', dryRun: true });
  assert.throws(() => parseArgs(['polish', 'a.js']), /task must be one of/);
  assert.throws(() => parseArgs(['review']), /needs at least one file/);
  assert.throws(() => parseArgs(['ask']), /needs --prompt/);
  assert.throws(() => parseArgs(['review', 'a.js', '--loud']), /unknown flag/);
});

test('attachments are fenced per file and capped so a stray bundle cannot blow the request', () => {
  const read = (f) => (f === 'big.js' ? 'x'.repeat(MAX_FILE_CHARS + 500) : 'small');
  const out = attach(['small.js', 'big.js', 'never.js'], read);
  assert.match(out, /### small\.js\n```\nsmall\n```/);
  assert.match(out, /\[truncated\]/);
  assert.ok(!out.includes('never.js'), 'nothing after the cap is attached');
  assert.ok(out.length < MAX_FILE_CHARS + 200);
});

test('the request carries the task prompt, the extra instructions and the files, in that order', () => {
  const body = buildRequest(
    { task: 'tests', files: ['sim.js'], prompt: 'only the weather' },
    { read: () => 'export const x = 1;' },
  );
  assert.equal(body.model, DEFAULT_MODEL);
  assert.equal(body.messages[0].role, 'system');
  assert.equal(body.messages[0].content, TASKS.tests.system);
  const user = body.messages[1].content;
  assert.ok(user.indexOf('only the weather') < user.indexOf('### sim.js'));
  assert.match(user, /export const x = 1;/);
});

test('without a key it refuses before touching the network', async () => {
  let called = false;
  await assert.rejects(
    delegate({ task: 'ask', files: [], prompt: 'hi' }, { fetchImpl: async () => { called = true; }, env: {} }),
    /OPENAI_API_KEY is not set/,
  );
  assert.equal(called, false);
});

test('a non-2xx answer surfaces the status and the body, and a good one yields the text and usage', async () => {
  const env = { OPENAI_API_KEY: 'k', OPENAI_MODEL: 'gpt-test' };
  await assert.rejects(
    delegate({ task: 'ask', files: [], prompt: 'hi' }, {
      env,
      fetchImpl: async () => ({ ok: false, status: 403, text: async () => 'blocked by policy' }),
    }),
    /OpenAI returned 403: blocked by policy/,
  );
  let sent;
  const ok = await delegate({ task: 'ask', files: [], prompt: 'hi' }, {
    env,
    fetchImpl: async (url, init) => {
      sent = { url, init };
      return {
        ok: true,
        status: 200,
        json: async () => ({ model: 'gpt-test', choices: [{ message: { content: 'fine' } }], usage: { prompt_tokens: 3, completion_tokens: 1 } }),
      };
    },
  });
  assert.equal(ok.content, 'fine');
  assert.equal(ok.usage.completion_tokens, 1);
  assert.equal(sent.init.headers.authorization, 'Bearer k');
  assert.equal(JSON.parse(sent.init.body).model, 'gpt-test');
});
