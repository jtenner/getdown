import type { ReactElement } from "react";

export interface GetDownProps {
  /** GitHub Flavored Markdown source to render. */
  content: string;
}

/** Shell for the public get-down API. */
export function GetDown({ content }: GetDownProps): ReactElement | null {
  void content;
  return null;
}
