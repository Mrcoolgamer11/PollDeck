import type { ComponentType } from "react";
import type { SlideType } from "@polldeck/shared";
import type { InputProps } from "./types";
import { ChoiceInput, OpenInput, WordCloudInput } from "./basic";

/** Eingabekomponente je Folientyp. */
export const INPUTS: Partial<Record<SlideType, ComponentType<InputProps<never>>>> = {
  multiple_choice: ChoiceInput as ComponentType<InputProps<never>>,
  word_cloud: WordCloudInput as ComponentType<InputProps<never>>,
  open_ended: OpenInput as ComponentType<InputProps<never>>,
};
