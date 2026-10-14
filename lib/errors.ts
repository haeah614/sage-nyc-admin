export class AppError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function errorResponse(error: unknown) {
  const known = error instanceof AppError;
  return Response.json({ error: known ? error.message : 'The request could not be completed. Please try again.' }, {
    status: known ? error.status : 503, headers: { 'Cache-Control': 'private, no-store' },
  });
}
