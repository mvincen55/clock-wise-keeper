// The "help the office get to know you" questions.
//
// Deliberately friendly and low-stakes. Never mention goals, training, or AI
// anywhere in this copy — the answers quietly shape how things are written for
// each person, and that stays behind the curtain.
//
// These are RANKED, not picked: the member orders every option from what fits
// them most to least. A ranking says far more than a single choice.

export type WorkStyleQuestion = {
  id: string;
  prompt: string;
  options: { value: string; label: string }[];
};

export const WORK_STYLE_QUESTIONS: WorkStyleQuestion[] = [
  {
    id: 'learning',
    prompt: 'When you pick up something new, what makes it click?',
    options: [
      { value: 'watch', label: 'Watching someone do it first' },
      { value: 'read', label: 'Reading it through at my own pace' },
      { value: 'do', label: 'Getting my hands on it and trying' },
      { value: 'talk', label: 'Talking it out with someone' },
    ],
  },
  {
    id: 'recognition',
    prompt: 'When you nail something, how do you like to hear about it?',
    options: [
      { value: 'quiet', label: 'A quiet thank-you' },
      { value: 'public', label: 'Out loud, in front of the team' },
      { value: 'written', label: 'A note I can keep' },
      { value: 'none', label: 'Honestly, I just like knowing it went well' },
    ],
  },
  {
    id: 'busy_day',
    prompt: 'On a hectic day, what helps you most?',
    options: [
      { value: 'list', label: 'A clear list of what matters' },
      { value: 'heads_up', label: 'A heads-up early so I can plan' },
      { value: 'check_in', label: 'Someone checking in with me' },
      { value: 'space', label: 'Space to put my head down' },
    ],
  },
  {
    id: 'energy',
    prompt: 'When are you sharpest?',
    options: [
      { value: 'early', label: 'First thing in the morning' },
      { value: 'mid', label: 'Mid-morning, once I am rolling' },
      { value: 'afternoon', label: 'Afternoons' },
      { value: 'varies', label: 'Depends on the day' },
    ],
  },
  {
    id: 'feedback',
    prompt: "When something isn't going well, how would you rather hear it?",
    options: [
      { value: 'direct', label: 'Direct and quick' },
      { value: 'private', label: 'Privately, with the context' },
      { value: 'with_plan', label: 'With a plan for fixing it' },
      { value: 'ask_first', label: 'Ask me what I think first' },
    ],
  },
];

/** Ranked answers are stored as "top,second,third,last" per question. */
export const rankingToAnswer = (order: string[]) => order.join(',');
export const answerToRanking = (answer?: string | null) =>
  (answer ?? '').split(',').filter(Boolean);

// ---------------------------------------------------------------------------
// The fun ones. Unlike the work-style answers, these are meant to be SEEN:
// they live on the employee record so a manager (and the office AI) can say
// thank you in a way that actually lands. Copy says so plainly.

export type FavoriteQuestion = {
  id: string;
  label: string;
  placeholder: string;
};

export const FAVORITE_QUESTIONS: FavoriteQuestion[] = [
  { id: 'food', label: 'Favorite food', placeholder: 'Thai, tacos, mom’s lasagna…' },
  { id: 'pizza', label: 'Go-to pizza', placeholder: 'Pepperoni, thin crust' },
  { id: 'dessert', label: 'Dessert or cake', placeholder: 'Carrot cake, anything lemon' },
  { id: 'drink', label: 'Coffee or drink order', placeholder: 'Iced oat latte, Diet Coke' },
  { id: 'snack', label: 'Snack that saves the day', placeholder: 'Salt & vinegar chips' },
  { id: 'treat', label: 'A small treat you’d actually love', placeholder: 'Target gift card, fresh flowers' },
];
