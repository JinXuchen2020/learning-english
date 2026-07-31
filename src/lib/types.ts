export type MascotExpression = "happy" | "thinking" | "celebrating" | "encouraging";
export type MascotSize = "small" | "medium" | "large";

export interface Course {
  id: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  totalLessons: number;
  completedLessons: number;
  wordCount: number;
}

export type LessonState = "locked" | "available" | "completed";

export interface Lesson {
  id: string;
  courseId: string;
  title: string;
  state: LessonState;
  wordCount: number;
  estimatedMinutes: number;
}

export interface Word {
  id: string;
  text: string;
  phonics: string;
  meaning: string;
  illustration: string;
  options: string[];
  correctIndex: number;
}

export interface DailyTask {
  id: string;
  title: string;
  description: string;
  icon: "headphones" | "mic" | "pencil";
  completed: boolean;
}

export type QuizPhase = "answering" | "correct" | "incorrect" | "complete";

export interface QuizState {
  phase: QuizPhase;
  currentWordIndex: number;
  selectedAnswer: number | null;
  correctCount: number;
  totalWords: number;
}
