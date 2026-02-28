/**
 * LLM Ops Client
 *
 * Main client for sending traces and observations to the LLM Ops API.
 */

import { nanoid } from 'nanoid';
import type {
  LlmOpsConfig,
  ParsedConfig,
  BatchItem,
  CreateTraceParams,
  CreateObservationParams,
  UpdateTraceParams,
  UpdateObservationParams,
  TraceHandle,
  ObservationHandle,
  TraceStatus,
  ObservationType,
} from './types';

// ===========================================
// TRACE CONTEXT
// ===========================================

// Simple trace context using a global variable
// In production, you'd use AsyncLocalStorage for proper context propagation
let currentTraceId: string | undefined;
let currentObservationId: string | undefined;

export function setTraceContext(traceId: string, observationId?: string): void {
  currentTraceId = traceId;
  currentObservationId = observationId;
}

export function getTraceContext(): { traceId?: string; observationId?: string } {
  return { traceId: currentTraceId, observationId: currentObservationId };
}

export function clearTraceContext(): void {
  currentTraceId = undefined;
  currentObservationId = undefined;
}

// ===========================================
// CLIENT
// ===========================================

export class LlmOpsClient {
  private config: ParsedConfig;
  private queue: BatchItem[] = [];
  private flushTimer?: ReturnType<typeof setInterval>;
  private pendingFlush?: Promise<void>;

  constructor(config: LlmOpsConfig) {
    this.config = this.parseConfig(config);

    if (this.config.enabled) {
      this.startFlushTimer();
    }
  }

  private parseConfig(config: LlmOpsConfig): ParsedConfig {
    let publicKey = config.publicKey;
    let projectId = config.projectId;
    let baseUrl = config.baseUrl || 'https://api.transactional.dev';

    if (config.dsn) {
      try {
        const url = new URL(config.dsn);
        publicKey = url.username;
        const pathParts = url.pathname.split('/').filter(Boolean);
        projectId = parseInt(pathParts[pathParts.length - 1] || '0');
        baseUrl = `${url.protocol}//${url.host}`;
      } catch {
        throw new Error(`Invalid DSN format: ${config.dsn}`);
      }
    }

    if (!publicKey || !projectId) {
      throw new Error('LlmOps requires either a DSN or publicKey + projectId');
    }

    return {
      publicKey,
      projectId,
      baseUrl,
      enabled: config.enabled ?? true,
      batchSize: config.batchSize ?? 100,
      flushInterval: config.flushInterval ?? 5000,
      debug: config.debug ?? false,
    };
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flush().catch((err) => {
        if (this.config.debug) {
          console.error('[LlmOps] Flush error:', err);
        }
      });
    }, this.config.flushInterval);
  }

  private log(message: string, ...args: unknown[]): void {
    if (this.config.debug) {
      console.log(`[LlmOps] ${message}`, ...args);
    }
  }

  private enqueue(item: BatchItem): void {
    if (!this.config.enabled) return;

    this.queue.push(item);
    this.log('Enqueued:', item.type, item.id);

    if (this.queue.length >= this.config.batchSize) {
      this.flush().catch((err) => {
        if (this.config.debug) {
          console.error('[LlmOps] Flush error:', err);
        }
      });
    }
  }

  /**
   * Create a new trace
   */
  trace(params: CreateTraceParams): TraceHandle {
    const traceId = nanoid();
    const startTime = new Date().toISOString();

    this.enqueue({
      type: 'trace',
      id: traceId,
      projectId: this.config.projectId,
      ...params,
      status: 'RUNNING' as TraceStatus,
      startTime,
    });

    // Set trace context
    setTraceContext(traceId);

    return {
      id: traceId,
      end: async (endParams) => {
        await this.updateTrace(traceId, {
          status: 'COMPLETED' as TraceStatus,
          output: endParams?.output,
          endTime: new Date().toISOString(),
        });
        clearTraceContext();
      },
      error: async (error) => {
        await this.updateTrace(traceId, {
          status: 'ERROR' as TraceStatus,
          metadata: { error: error.message, stack: error.stack },
          endTime: new Date().toISOString(),
        });
        clearTraceContext();
      },
    };
  }

  /**
   * Update an existing trace
   */
  async updateTrace(traceId: string, params: UpdateTraceParams): Promise<void> {
    this.enqueue({
      type: 'trace',
      id: traceId,
      ...params,
    });
  }

  /**
   * Create a new observation (span, generation, or event)
   */
  observation(params: CreateObservationParams): ObservationHandle {
    const observationId = nanoid();
    const startTime = new Date().toISOString();
    const context = getTraceContext();

    const traceId = params.traceId || context.traceId;
    if (!traceId) {
      throw new Error('No trace context found. Create a trace first.');
    }

    // Destructure to separate observation type from batch item type
    const { type: observationType, ...restParams } = params;
    this.enqueue({
      type: 'observation',
      id: observationId,
      traceId,
      parentObservationId: restParams.parentObservationId || context.observationId,
      ...restParams,
      observationType,
      status: 'RUNNING' as TraceStatus,
      startTime,
    });

    // Update context for nesting
    setTraceContext(traceId, observationId);

    return {
      id: observationId,
      end: async (endParams) => {
        await this.updateObservation(observationId, {
          status: 'COMPLETED' as TraceStatus,
          output: endParams?.output,
          promptTokens: endParams?.promptTokens,
          completionTokens: endParams?.completionTokens,
          endTime: new Date().toISOString(),
        });
        // Restore parent context
        setTraceContext(traceId, params.parentObservationId || context.observationId);
      },
      error: async (error) => {
        await this.updateObservation(observationId, {
          status: 'ERROR' as TraceStatus,
          metadata: { error: error.message, stack: error.stack },
          endTime: new Date().toISOString(),
        });
        setTraceContext(traceId, params.parentObservationId || context.observationId);
      },
    };
  }

  /**
   * Create a generation observation (LLM call)
   */
  generation(params: Omit<CreateObservationParams, 'type'>): ObservationHandle {
    return this.observation({
      ...params,
      type: 'GENERATION' as ObservationType,
    });
  }

  /**
   * Create a span observation
   */
  span(params: Omit<CreateObservationParams, 'type'>): ObservationHandle {
    return this.observation({
      ...params,
      type: 'SPAN' as ObservationType,
    });
  }

  /**
   * Create an event observation
   */
  event(params: Omit<CreateObservationParams, 'type'>): ObservationHandle {
    return this.observation({
      ...params,
      type: 'EVENT' as ObservationType,
    });
  }

  /**
   * Update an existing observation
   */
  async updateObservation(
    observationId: string,
    params: UpdateObservationParams
  ): Promise<void> {
    this.enqueue({
      type: 'observation',
      id: observationId,
      ...params,
    });
  }

  /**
   * Flush queued events to the API
   */
  async flush(): Promise<void> {
    if (this.queue.length === 0) return;

    // Prevent concurrent flushes
    if (this.pendingFlush) {
      await this.pendingFlush;
    }

    const batch = this.queue.splice(0, this.config.batchSize);
    this.log('Flushing', batch.length, 'items');

    this.pendingFlush = this.sendBatch(batch);
    await this.pendingFlush;
    this.pendingFlush = undefined;
  }

  private async sendBatch(batch: BatchItem[]): Promise<void> {
    try {
      const response = await fetch(
        `${this.config.baseUrl}/observability/ingest/batch`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.config.publicKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            projectId: this.config.projectId,
            batch,
          }),
        }
      );

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to send batch: ${response.status} ${text}`);
      }

      this.log('Batch sent successfully');
    } catch (error) {
      // Re-queue failed items for retry
      this.queue.unshift(...batch);
      throw error;
    }
  }

  /**
   * Shutdown the client and flush remaining events
   */
  async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    await this.flush();
    this.log('Shutdown complete');
  }
}
