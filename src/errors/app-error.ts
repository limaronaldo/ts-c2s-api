import { Elysia } from "elysia";
import { logger } from "../utils/logger";

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }

  static badRequest(message: string, details?: unknown): AppError {
    return new AppError(400, "BAD_REQUEST", message, details);
  }

  static unauthorized(message: string = "Unauthorized"): AppError {
    return new AppError(401, "UNAUTHORIZED", message);
  }

  static notFound(resource: string): AppError {
    return new AppError(404, "NOT_FOUND", `${resource} not found`);
  }

  static conflict(message: string): AppError {
    return new AppError(409, "CONFLICT", message);
  }

  static internal(message: string = "Internal server error"): AppError {
    return new AppError(500, "INTERNAL_ERROR", message);
  }

  static serviceUnavailable(service: string): AppError {
    return new AppError(
      503,
      "SERVICE_UNAVAILABLE",
      `${service} is currently unavailable`,
    );
  }

  toJSON(): { error: { code: string; message: string; details?: unknown } } {
    const result: { code: string; message: string; details?: unknown } = {
      code: this.code,
      message: this.message,
    };
    if (this.details) {
      result.details = this.details;
    }
    return { error: result };
  }
}

export const errorHandler = new Elysia({ name: "error-handler" }).onError(
  ({ error, set }) => {
    const err = error as Error;

    if (err instanceof AppError) {
      set.status = err.statusCode;
      return err.toJSON();
    }

    // Log unexpected errors
    logger.error({ err, stack: err.stack }, "Unexpected error");

    set.status = 500;
    return {
      error: {
        code: "INTERNAL_ERROR",
        message:
          process.env.NODE_ENV === "production"
            ? "Internal server error"
            : err.message,
      },
    };
  },
);
