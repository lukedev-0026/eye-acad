import { readFileSync } from 'node:fs';

import { PinnedVectorsSchema, installRecorder } from '@/eval/golden/golden';
import type { ChatBody } from '@/eval/golden/golden';

export interface ScriptedModel {
  willReply(...replies: Array<string | object>): void;
  willAnswer(responder: (request: ChatBody) => string | object): void;
  requests(): Array<ChatBody>;
  restore(): void;
}

/**
 * Fakes the model at the network; any other call fails the test.
 * Query embeddings come from pinned vectors.
 */
export function scriptModel(): ScriptedModel {
  const pinned = PinnedVectorsSchema.parse(
    JSON.parse(readFileSync('tests/golden/query-vectors.json', 'utf8')),
  );
  const recorder = installRecorder(new Map(Object.entries(pinned)));
  return {
    willReply(...replies) {
      recorder.chat = [];
      recorder.doneReason = 'stop';
      recorder.replies = replies.map((reply) =>
        typeof reply === 'string' ? reply : JSON.stringify(reply),
      );
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
