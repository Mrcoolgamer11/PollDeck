import type { Slide } from "@polldeck/shared";

export interface InputProps<T = unknown> {
  slide: Slide;
  onSubmit: (value: T) => Promise<boolean>;
  busy: boolean;
}
