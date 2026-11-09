import {
  AlignLeft,
  BarChart3,
  Cloud,
  Grid2x2,
  Hash,
  ListOrdered,
  MessageSquareText,
  MessagesSquare,
  PieChart,
  SlidersHorizontal,
  Timer,
  Trophy,
  Type,
  type LucideIcon,
} from "lucide-react";
import type { SlideType } from "@polldeck/shared";

export const SLIDE_META: Record<SlideType, { icon: LucideIcon; group: "poll" | "quiz" | "content" }> = {
  multiple_choice: { icon: BarChart3, group: "poll" },
  word_cloud: { icon: Cloud, group: "poll" },
  open_ended: { icon: MessageSquareText, group: "poll" },
  scale: { icon: SlidersHorizontal, group: "poll" },
  ranking: { icon: ListOrdered, group: "poll" },
  points_100: { icon: PieChart, group: "poll" },
  grid_2x2: { icon: Grid2x2, group: "poll" },
  number_guess: { icon: Hash, group: "poll" },
  qa: { icon: MessagesSquare, group: "poll" },
  quiz_choice: { icon: Timer, group: "quiz" },
  quiz_text: { icon: Type, group: "quiz" },
  content: { icon: AlignLeft, group: "content" },
  leaderboard: { icon: Trophy, group: "quiz" },
};
