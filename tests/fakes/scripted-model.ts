import { readFileSync } from 'node:fs';

import { PinnedVectorsSchema, installRecorder } from '@/eval/golden/golden';
import type { ChatBody } from '@/eval/golden/golden';

export interface ScriptedModel {
  // The replies the model will give, in order. The last one repeats.
  willReply(...replies: Array<string | object>): void;
  // The model will answer each request with whatever this returns for it.
  willAnswer(responder: (request: ChatBody) => string | object): void;
  // Every request the app sent to the model since it was last told what to say.
  requests(): Array<ChatBody>;
  restore(): void;
}

// Stands in for the language model at the network: no model runs, and a call
// to anything other than the model or the embeddings service fails the test.
// Query embeddings come from the pinned vectors, so the search is the real one.
export function scriptModel(): ScriptedModel {
  const pinned = PinnedVectorsSchema.parse(JSON.parse(readFileSync('tests/golden/query-vectors.json', 'utf8')));
  const recorder = installRecorder(new Map(Object.entries(pinned)));
  return {
    willReply(...replies) {
      recorder.chat = [];
      recorder.doneReason = 'stop';
      recorder.replies = replies.map((reply) => (typeof reply === 'string' ? reply : JSON.stringify(reply)));
      recorder.responder = null;
    },
    willAnswer(responder) {
      recorder.chat = [];
      recorder.doneReason = 'stop';
      recorder.responder = (body) => {
        const reply = responder(body);
        return typeof reply === 'string' ? reply : JSON.stringify(reply);
      };
    },
    requests: () => recorder.chat,
    restore: () => {
      recorder.restore();
    },
  };
}

export const NOT_JSON = 'I am sorry, I cannot help with that.';
