import type { FigmaOperation } from '@ui-ux-magec/schemas';

export interface PluginInfo {
  version: string;
  fileKey: string | null;
  fileName: string;
  editorType: string;
  apiVersion?: string;
  supportedOps: string[];
  connectedAt: string;
}

export interface BridgeStatus {
  connected: boolean;
  role: 'host' | 'controller' | 'in-memory' | 'none';
  port?: number;
  plugin?: PluginInfo;
  detail?: string;
}

/** Anything that can execute validated operations against a Figma document. */
export interface FigmaTransport {
  status(): Promise<BridgeStatus>;
  request(operation: FigmaOperation, opts?: { idempotencyKey?: string; timeoutMs?: number }): Promise<unknown>;
  close(): Promise<void>;
}
