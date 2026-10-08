export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (msg, details) => new HttpError(400, msg, details);
export const unauthorized = (msg = 'Authentication required') => new HttpError(401, msg);
export const notFound = (msg = 'Resource not found') => new HttpError(404, msg);
export const conflict = (msg) => new HttpError(409, msg);
