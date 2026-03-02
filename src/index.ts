/**
 * Transactional LLM Ops SDK
 *
 * AI observability with cost tracking, trace analysis, and performance monitoring.
 *
 * @example
 * ```typescript
 * import { initLlmOps, getLlmOps } from '@usetransactional/llm-node';
 *
 * initLlmOps({
 *   dsn: process.env.TRANSACTIONAL_LLM_OPS_DSN!,
 * });
 *
 * const llmOps = getLlmOps();
 *
 * const trace = llmOps.trace({
 *   name: 'chat-completion',
 *   input: { prompt: 'Hello!' },
 * });
 *
 * const generation = llmOps.generation({
 *   name: 'gpt-4o',
 *   modelName: 'gpt-4o',
 * });
 *
 * await generation.end({
 *   output: { content: 'Hi there!' },
 *   promptTokens: 10,
 *   completionTokens: 5,
 * });
 *
 * await trace.end({ output: { response: 'Hi there!' } });
 * ```
 */

import { LlmOpsClient } from './client';
import type { LlmOpsConfig } from './types';

// Singleton instance
let defaultClient: LlmOpsClient | null = null;

/**
 * Initialize the LLM Ops SDK
 *
 * Call this once at application startup before using any tracing functions.
 *
 * @param config - Configuration options including DSN
 * @returns The initialized client instance
 *
 * @example
 * ```typescript
 * initLlmOps({
 *   dsn: 'https://pk_...@api.usetransactional.com/observability/42',
 * });
 * ```
 */
export function initLlmOps(config: LlmOpsConfig): LlmOpsClient {
  if (defaultClient) {
    console.warn('[LlmOps] SDK already initialized. Ignoring duplicate initialization.');
    return defaultClient;
  }

  defaultClient = new LlmOpsClient(config);
  return defaultClient;
}

/**
 * Get the LLM Ops client instance
 *
 * @throws Error if SDK has not been initialized
 * @returns The client instance
 *
 * @example
 * ```typescript
 * const llmOps = getLlmOps();
 * const trace = llmOps.trace({ name: 'my-trace' });
 * ```
 */
export function getLlmOps(): LlmOpsClient {
  if (!defaultClient) {
    throw new Error(
      'LLM Ops SDK not initialized. Call initLlmOps() first.'
    );
  }
  return defaultClient;
}

/**
 * Check if the SDK is initialized
 */
export function isInitialized(): boolean {
  return defaultClient !== null;
}

/**
 * Reset the SDK (mainly for testing)
 */
export function resetLlmOps(): void {
  if (defaultClient) {
    defaultClient.shutdown().catch(() => {});
    defaultClient = null;
  }
}

// Export types
export type {
  LlmOpsConfig,
  Trace,
  Observation,
  Session,
  CreateTraceParams,
  CreateObservationParams,
  UpdateTraceParams,
  UpdateObservationParams,
  TraceHandle,
  ObservationHandle,
  BatchIngestParams,
  BatchIngestResult,
} from './types';

export {
  TraceStatus,
  ObservationType,
  ObservationLevel,
} from './types';

// Export client class for advanced usage
export { LlmOpsClient } from './client';

// Export context utilities
export {
  setTraceContext,
  getTraceContext,
  clearTraceContext,
} from './client';
