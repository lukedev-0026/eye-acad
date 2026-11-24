// Every sentence the examiner can say that is not a finding read from the case
// file. They are fixed so that no model writes them.
export const LINES = {
  notRecorded: "That isn't recorded for this case.",
  alsoNotRecorded: "Something else you asked for isn't recorded for this case.",
  tooMany: 'Please ask for specific findings.',
  pressTheButton: "When you're ready, press Give my answer.",
  askForAFinding: 'Please ask for an examination finding or part of the history.',
  didNotCatch: "Sorry, I didn't catch that.",
  somethingWentWrong: 'Sorry, something went wrong. Please ask again.',
  restOnScreen: 'The rest is on screen.',
  noFollowUpIdeas: 'Can you take me through your reasoning for that plan?',
  noSupport: "I couldn't find support for this in the reference note.",
} as const;
