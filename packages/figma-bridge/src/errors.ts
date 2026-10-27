export type FigmaErrorCode =
  | 'not_configured' | 'not_connected' | 'timeout' | 'invalid_operation' | 'unsupported_operation' | 'plugin_error'
  | 'conflict' | 'permission_denied' | 'auth_failed' | 'node_missing' | 'locked';

export class FigmaBridgeError extends Error {
  constructor(public readonly code: FigmaErrorCode, message: string, public readonly details?: unknown) {
    super(message);
    this.name = 'FigmaBridgeError';
  }
}
