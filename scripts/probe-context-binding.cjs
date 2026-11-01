'use strict';
// Read-only diagnostic spike. Never imports client modules or invokes React callbacks.
// React private fields are version-sensitive; this is not a production adapter.
const assert = require('node:assert/strict');

function inspectBindings() {
  function fibers(element) {
    for (let i = 0; element && i < 16; i++, element = element.parentElement) {
      const key = Object.keys(element).find(k => k.startsWith('__reactFiber$'));
      if (key) {
        const result = [], seen = new Set();
        for (let f = element[key]; f && result.length < 120 && !seen.has(f); f = f.return) {
          seen.add(f); result.push(f.memoizedProps);
        }
        return result.filter(p => p && typeof p === 'object');
      }
    }
    return [];
  }
  return [...document.querySelectorAll('[data-codex-composer]')]
    .filter(e => e.getClientRects().length && e.getBoundingClientRect().width > 0)
    .map(input => {
      const root = input.closest('[data-codex-composer-root]');
      if (!root) return { ok: false, reason: 'missing-root' };
      const ids = [...new Set([...root.querySelectorAll('[data-above-composer-conversation-id]')]
        .map(e => e.getAttribute('data-above-composer-conversation-id')).filter(Boolean))];
      const id = ids.length === 1 ? ids[0] : null;
      const hosts = new Set(fibers(input)
        .filter(p => p.conversationId === id && typeof p.hostId === 'string')
        .map(p => p.hostId));
      const buttons = [...root.querySelectorAll('[data-composer-navigation-target="reasoning"]')];
      let model = null;
      if (buttons.length === 1) {
        // Stop at the nearest component carrying an explicit model prop.
        model = fibers(buttons[0]).find(p => typeof p.model === 'string')?.model ?? null;
      }
      const host = hosts.size === 1 ? [...hosts][0] : null;
      return {
        ok: !!id && host === 'local' && !!model,
        hasSingleThreadId: !!id, hostMatchesThread: hosts.size === 1,
        host: host === 'local' ? 'local' : host ? '[remote]' : null,
        model, modelButtonCount: buttons.length,
        // Do not output conversation IDs, titles, paths, or user content.
        source: 'React memoizedProps; private, diagnostic only'
      };
    });
}

// Proposed contract: the binding adapter increments generation on every identity
// change, including A -> B -> A. This gate needs explicit request-generation
// provenance; the current token_count format alone cannot supply it.
function acceptSnapshot(binding, snapshot) {
  return binding.host === 'local' && snapshot.host === binding.host &&
    snapshot.threadId === binding.threadId && snapshot.model === binding.model &&
    Number.isSafeInteger(binding.generation) && snapshot.generation === binding.generation &&
    Number.isSafeInteger(snapshot.used) && snapshot.used >= 0 &&
    Number.isSafeInteger(snapshot.capacity) && snapshot.capacity > 0;
}
function selfTest() {
  const binding = { host: 'local', threadId: 'thread-1', model: 'A', generation: 3 };
  const snapshot = { ...binding, used: 20, capacity: 100 };
  assert.equal(acceptSnapshot(binding, snapshot), true);
  for (const patch of [
    { generation: 1 }, // A -> B -> A: a same-model old request still fails.
    { model: 'B', generation: 2 }, { threadId: 'thread-2' },
    { host: 'remote' }, { generation: undefined }, { capacity: 0 }, { used: -1 }
  ]) assert.equal(acceptSnapshot(binding, { ...snapshot, ...patch }), false);
  assert.equal(acceptSnapshot(binding, { ...snapshot, used: 0 }), true);
  assert.equal(acceptSnapshot(binding, { ...snapshot, used: 5 }), true); // Compaction may decrease usage.
  console.log('PASS proposed provenance gate: current request, delayed A/B/A, thread/host isolation, missing provenance, invalid data, zero and decrease');
}
async function probe() {
  const targets = await (await fetch('http://127.0.0.1:39222/json/list', { signal: AbortSignal.timeout(3000) })).json();
  for (const target of targets.filter(t => t.type === 'page' && t.url.startsWith('app://-/index.html'))) {
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('CDP connect timed out')), 4000);
        ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
        ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('CDP connect failed')); }, { once: true });
      });
      const result = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('CDP read timed out')), 5000);
        ws.addEventListener('message', event => {
          const message = JSON.parse(event.data);
          if (message.id !== 1) return;
          clearTimeout(timer);
          if (message.error || message.result?.exceptionDetails) reject(new Error('DOM inspection failed'));
          else resolve(message.result?.result?.value);
        });
        ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: {
          expression: `(${inspectBindings.toString()})()`, returnByValue: true
        } }));
      });
      console.log(JSON.stringify({ bindings: result }));
    } finally { ws.close(); }
  }
}
if (require.main === module) {
  (process.argv.includes('--self-test') ? Promise.resolve().then(selfTest) : probe())
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { acceptSnapshot };
