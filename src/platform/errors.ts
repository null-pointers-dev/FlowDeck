export type ErrorCode = "unauthorized" | "forbidden" | "not_found" | "conflict" | "invalid" | "unavailable" | "internal";

/** An expected failure with a message safe to show to the person. */
export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const forbidden = (message = "You don't have permission to do that.") => new AppError("forbidden", message);
export const notFound = (what = "That item") => new AppError("not_found", `${what} no longer exists.`);
export const conflict = (message: string) => new AppError("conflict", message);
export const invalid = (message: string, fieldErrors?: Record<string, string>) => new AppError("invalid", message, fieldErrors);
