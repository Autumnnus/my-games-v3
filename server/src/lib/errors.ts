export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number = 400,
    public details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}
