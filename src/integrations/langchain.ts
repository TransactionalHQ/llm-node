/**
 * LangChain Integration
 *
 * Callback handler for automatic tracing of LangChain chains and LLM calls.
 *
 * @example
 * ```typescript
 * import { TransactionalCallbackHandler } from 'transactional-llm/langchain';
 * import { ChatOpenAI } from '@langchain/openai';
 *
 * const handler = new TransactionalCallbackHandler({
 *   sessionId: 'conversation-123',
 * });
 *
 * const model = new ChatOpenAI({ modelName: 'gpt-4o' });
 * const response = await model.invoke('Hello!', { callbacks: [handler] });
 * ```
 */

import type { Serialized } from '@langchain/core/load/serializable';
import type { LLMResult } from '@langchain/core/outputs';
import { getLlmOps, isInitialized } from '../index';
import type { ObservationHandle, TraceHandle } from '../types';

export interface TransactionalCallbackHandlerOptions {
  /** Session ID to group traces */
  sessionId?: string;
  /** User ID for attribution */
  userId?: string;
  /** Custom metadata for all traces */
  metadata?: Record<string, unknown>;
}

/**
 * Extract model name from a LangChain Serialized object safely
 */
function getModelName(serialized: Serialized, fallback: string): string {
  // Check if it's a SerializedConstructor which has kwargs
  if ('kwargs' in serialized && serialized.kwargs) {
    const kwargs = serialized.kwargs as Record<string, unknown>;
    return String(kwargs.model || kwargs.modelName || fallback);
  }
  return fallback;
}

/**
 * LangChain callback handler for automatic tracing.
 * Implements the LangChain callback interface without extending BaseCallbackHandler
 * to avoid requiring @langchain/core as a direct dependency.
 */
export class TransactionalCallbackHandler {
  name = 'TransactionalCallbackHandler';

  private options: TransactionalCallbackHandlerOptions;
  private traceHandle?: TraceHandle;
  private observationStack: Map<string, ObservationHandle> = new Map();

  constructor(options: TransactionalCallbackHandlerOptions = {}) {
    this.options = options;
  }

  private getClient() {
    if (!isInitialized()) {
      console.warn(
        '[LlmOps] SDK not initialized. Call initLlmOps() before using the LangChain handler.'
      );
      return null;
    }
    return getLlmOps();
  }

  // ===========================================
  // CHAIN CALLBACKS
  // ===========================================

  async handleChainStart(
    chain: Serialized,
    inputs: Record<string, unknown>,
    runId: string
  ): Promise<void> {
    const client = this.getClient();
    if (!client) return;

    const name = chain.id?.join('/') || 'chain';

    if (!this.traceHandle) {
      // Top-level chain becomes the trace
      this.traceHandle = client.trace({
        name,
        sessionId: this.options.sessionId,
        userId: this.options.userId,
        input: inputs,
        metadata: this.options.metadata,
      });
    } else {
      // Nested chain becomes a span
      const span = client.span({
        name,
        input: inputs,
      });
      this.observationStack.set(runId, span);
    }
  }

  async handleChainEnd(
    outputs: Record<string, unknown>,
    runId: string
  ): Promise<void> {
    const observation = this.observationStack.get(runId);
    if (observation) {
      await observation.end({ output: outputs });
      this.observationStack.delete(runId);
    } else if (this.traceHandle && this.observationStack.size === 0) {
      // End the trace when top-level chain ends
      await this.traceHandle.end({ output: outputs });
      this.traceHandle = undefined;
    }
  }

  async handleChainError(error: Error, runId: string): Promise<void> {
    const observation = this.observationStack.get(runId);
    if (observation) {
      await observation.error(error);
      this.observationStack.delete(runId);
    } else if (this.traceHandle) {
      await this.traceHandle.error(error);
      this.traceHandle = undefined;
    }
  }

  // ===========================================
  // LLM CALLBACKS
  // ===========================================

  async handleLLMStart(
    llm: Serialized,
    prompts: string[],
    runId: string
  ): Promise<void> {
    const client = this.getClient();
    if (!client) return;

    const name = llm.id?.join('/') || 'llm';
    const modelName = getModelName(llm, name);

    const generation = client.generation({
      name,
      modelName,
      input: { prompts },
    });

    this.observationStack.set(runId, generation);
  }

  async handleLLMEnd(output: LLMResult, runId: string): Promise<void> {
    const observation = this.observationStack.get(runId);
    if (!observation) return;

    const tokenUsage = output.llmOutput?.tokenUsage as
      | { promptTokens?: number; completionTokens?: number }
      | undefined;

    await observation.end({
      output: { generations: output.generations },
      promptTokens: tokenUsage?.promptTokens,
      completionTokens: tokenUsage?.completionTokens,
    });

    this.observationStack.delete(runId);
  }

  async handleLLMError(error: Error, runId: string): Promise<void> {
    const observation = this.observationStack.get(runId);
    if (observation) {
      await observation.error(error);
      this.observationStack.delete(runId);
    }
  }

  // ===========================================
  // CHAT MODEL CALLBACKS
  // ===========================================

  async handleChatModelStart(
    llm: Serialized,
    messages: unknown[][],
    runId: string
  ): Promise<void> {
    const client = this.getClient();
    if (!client) return;

    const name = llm.id?.join('/') || 'chat';
    const modelName = getModelName(llm, name);

    const generation = client.generation({
      name,
      modelName,
      input: { messages },
    });

    this.observationStack.set(runId, generation);
  }

  // ===========================================
  // TOOL CALLBACKS
  // ===========================================

  async handleToolStart(
    tool: Serialized,
    input: string,
    runId: string
  ): Promise<void> {
    const client = this.getClient();
    if (!client) return;

    const name = tool.id?.join('/') || 'tool';
    const span = client.span({
      name,
      input: { input },
    });

    this.observationStack.set(runId, span);
  }

  async handleToolEnd(output: string, runId: string): Promise<void> {
    const observation = this.observationStack.get(runId);
    if (observation) {
      await observation.end({ output: { output } });
      this.observationStack.delete(runId);
    }
  }

  async handleToolError(error: Error, runId: string): Promise<void> {
    const observation = this.observationStack.get(runId);
    if (observation) {
      await observation.error(error);
      this.observationStack.delete(runId);
    }
  }

  // ===========================================
  // RETRIEVER CALLBACKS
  // ===========================================

  async handleRetrieverStart(
    retriever: Serialized,
    query: string,
    runId: string
  ): Promise<void> {
    const client = this.getClient();
    if (!client) return;

    const name = retriever.id?.join('/') || 'retriever';
    const span = client.span({
      name,
      input: { query },
    });

    this.observationStack.set(runId, span);
  }

  async handleRetrieverEnd(
    documents: unknown[],
    runId: string
  ): Promise<void> {
    const observation = this.observationStack.get(runId);
    if (observation) {
      await observation.end({ output: { documents } });
      this.observationStack.delete(runId);
    }
  }

  async handleRetrieverError(error: Error, runId: string): Promise<void> {
    const observation = this.observationStack.get(runId);
    if (observation) {
      await observation.error(error);
      this.observationStack.delete(runId);
    }
  }
}
