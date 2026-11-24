import { readFileSync } from 'node:fs';

import { installRecorder } from '@/eval/golden/golden';

type ChatBody = { model: string; messages: Array<{ role: string; content: string }>; format?: unknown };

export interface ScriptedModel {
  // The replies the model will give, in order. The last one repeats.
  willReply(...replies: Array<string | object>): void;
  // Every request the app sent to the model since the last `willReply`.
  requests(): Array<ChatBody>;
  restore(): void;
}

// Stands in for the language model at the network: no model runs, and a call
// to anything other than the model or the embeddings service fails the test.
// Query embeddings come from the pinned vectors, so the search is the real one.
export function scriptModel(): ScriptedModel {
  const pinned = JSON.parse(readFileSync('tests/golden/query-vectors.json', 'utf8')) as Record<string, Array<number>>;
  const recorder = installRecorder(new Map(Object.entries(pinned)));
  return {
    willReply(...replies) {
      recorder.chat = [];
      recorder.doneReason = 'stop';
      recorder.replies = replies.map((reply) => (typeof reply === 'string' ? reply : JSON.stringify(reply)));
    },
    requests: () => recorder.chat as Array<ChatBody>,
    restore: () => recorder.restore(),
  };
}

export const NOT_JSON = 'I am sorry, I cannot help with that.';
