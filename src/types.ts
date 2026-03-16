export interface User {
  id: string | number;
  username: string;
  email: string;
}

export interface Resource {
  id: string | number;
  title: string;
  type: 'book' | 'note';
  subject: string;
  topic: string;
  content: string;
  author: string;
  url?: string;
}

export interface Flashcard {
  id: string | number;
  user_id: string | number;
  subject: string;
  question: string;
  answer: string;
}

export interface PlannerTask {
  id: string | number;
  user_id: string | number;
  title: string;
  date: string;
  completed: number;
}
