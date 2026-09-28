import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { EditorState } from "@codemirror/state";
import { EditorMutationQueue } from "../src/adapters/editor/editorMutationQueue.ts";

const desktopMarkdownInputSource = readFileSync(
  new URL("../src/ui/components/DesktopMarkdownInput.tsx", import.meta.url),
  "utf8",
);

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function insert(beforeLengthUtf16, offset, text) {
  return {
    beforeLengthUtf16,
    changes: [{ fromUtf16: offset, toUtf16: offset, insert: text }],
  };
}

test("keeps one request in flight and coalesces pending transactions", async () => {
  const first = deferred();
  const calls = [];
  const gateway = {
    async applyMutation(_sessionId, batch) {
      calls.push(structuredClone(batch));
      if (calls.length === 1) {
        return first.promise;
      }
      return {
        clientId: batch.clientId,
        batchId: batch.batchId,
        revision: batch.expectedRevision + 1,
        documentLengthUtf16: 4,
        replayed: false,
      };
    },
  };
  const queue = new EditorMutationQueue(gateway, "session", 5, 1, { clientId: "client" });

  queue.enqueue(insert(1, 1, "a"));
  queue.enqueue(insert(2, 2, "b"));
  queue.enqueue(insert(3, 3, "c"));
  assert.equal(calls.length, 1);

  first.resolve({
    clientId: "client",
    batchId: 1,
    revision: 6,
    documentLengthUtf16: 2,
    replayed: false,
  });
  await queue.flush();

  assert.equal(calls.length, 2);
  assert.equal(calls[1].batchId, 2);
  assert.equal(calls[1].expectedRevision, 6);
  assert.equal(calls[1].transactions.length, 2);
  assert.equal(queue.revision, 7);
});

test("retries the exact failed batch without advancing revision or batch id", async () => {
  const calls = [];
  let shouldFail = true;
  const gateway = {
    async applyMutation(_sessionId, batch) {
      calls.push(structuredClone(batch));
      if (shouldFail) {
        shouldFail = false;
        throw new Error("transport failure");
      }
      return {
        clientId: batch.clientId,
        batchId: batch.batchId,
        revision: batch.expectedRevision + 1,
        documentLengthUtf16: 2,
        replayed: true,
      };
    },
  };
  const queue = new EditorMutationQueue(gateway, "session", 8, 1, { clientId: "client" });
  queue.enqueue(insert(1, 1, "x"));

  await assert.rejects(queue.flush(), /transport failure/u);
  assert.equal(queue.revision, 8);
  await queue.retryFailed();

  assert.deepEqual(calls[1], calls[0]);
  assert.equal(queue.revision, 9);
});

test("rejects frontend ordering drift before IPC", () => {
  const queue = new EditorMutationQueue(
    { applyMutation: async () => { throw new Error("must not run"); } },
    "session",
    1,
    3,
    { clientId: "client" },
  );

  assert.throws(() => queue.enqueue(insert(4, 0, "x")), /Mutation順序違反/u);
});

test("normalizes pasted CRLF and CR before mutation generation", () => {
  assert.doesNotMatch(desktopMarkdownInputSource, /EditorState\.lineSeparator\.of/u);

  const initial = EditorState.create({ doc: "start" });
  const transaction = initial.update({
    changes: {
      from: initial.doc.length,
      insert: "\r\nfirst\rsecond\nthird",
    },
  });
  const inserted = [];
  transaction.changes.iterChanges((_fromA, _toA, _fromB, _toB, text) => {
    inserted.push(text.toString());
  });

  assert.deepEqual(inserted, ["\nfirst\nsecond\nthird"]);
  assert.equal(transaction.newDoc.toString(), "start\nfirst\nsecond\nthird");
});
