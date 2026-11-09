import type { ComponentType } from "react";
import type { SlideType } from "@polldeck/shared";
import type { InputProps } from "./types";
import { ChoiceInput, OpenInput, WordCloudInput } from "./basic";
import { GridInput, NumberInput, PointsInput, QuizTextInput, RankingInput, ScaleInput } from "./advanced";

type AnyInput = ComponentType<InputProps<never>>;

/** Eingabekomponente je Folientyp. */
export const INPUTS: Partial<Record<SlideType, AnyInput>> = {
  multiple_choice: ChoiceInput as AnyInput,
  quiz_choice: ChoiceInput as AnyInput,
  word_cloud: WordCloudInput as AnyInput,
  open_ended: OpenInput as AnyInput,
  scale: ScaleInput as AnyInput,
  ranking: RankingInput as AnyInput,
  points_100: PointsInput as AnyInput,
  grid_2x2: GridInput as AnyInput,
  number_guess: NumberInput as AnyInput,
  quiz_text: QuizTextInput as AnyInput,
};
