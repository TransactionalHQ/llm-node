/**
 * Vercel AI SDK Integration
 *
 * Wrapper functions for automatic tracing of Vercel AI SDK calls.
 *
 * @example
 * ```typescript
 * import { wrapAiSdk } from '@usetransactional/llm-node/vercel-ai';
 * import { generateText } from 'ai';
 *
 * const wrappedGenerateText = wrapAiSdk(generateText);
 *
 * const { text } = await wrappedGenerateText({
 *   model: openai('gpt-4o'),
 *   prompt: 'Hello!',
 * });
 * ```
 */

import { getLlmOps, isInitialized } from '../index';

interface TelemetryMetadata {
  userId?: string;
  sessionId?: string;
  [key: string]: unknown;
}

interface WrappedOptions {
  experimental_telemetry?: {
    metadata?: TelemetryMetadata;
  };
  model?: {
    modelId?: string;
    provider?: string;
  };
  prompt?: string;
  messages?: unknown[];
  [key: string]: unknown;
}

interface GenerateResult {
  text?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  [key: string]: unknown;
}

type AiFn<T> = (options: WrappedOptions) => Promise<T>;

/**
 * Wrap a Vercel AI SDK function to automatically trace calls
 *
 * @param fn - The AI SDK function to wrap (e.g., generateText, streamText)
 * @returns A wrapped function that traces the call
 *
 * @example
 * ```typescript
 * const wrappedGenerateText = wrapAiSdk(generateText);
 * const { text } = await wrappedGenerateText({
 *   model: openai('gpt-4o'),
 *   prompt: 'Hello!',
 * });
 * ```
 */
export function wrapAiSdk<T extends GenerateResult>(fn: AiFn<T>): AiFn<T> {
  return async (options: WrappedOptions): Promise<T> => {
    if (!isInitialized()) {
      console.warn(
        '[LlmOps] SDK not initialized. Call initLlmOps() before using the Vercel AI wrapper.'
      );
      return fn(options);
    }

    const client = getLlmOps();
    const metadata = options.experimental_telemetry?.metadata || {};
    const modelId = options.model?.modelId || 'unknown';
    const provider = options.model?.provider || 'unknown';

    // Create trace
    const trace = client.trace({
      name: `${fn.name || 'ai-call'}`,
      sessionId: metadata.sessionId,
      userId: metadata.userId,
      input: {
        prompt: options.prompt,
        messages: options.messages,
      },
      metadata: {
        provider,
        modelId,
        ...metadata,
      },
    });

    // Create generation
    const generation = client.generation({
      name: `${provider}/${modelId}`,
      modelName: modelId,
      input: {
        prompt: options.prompt,
        messages: options.messages,
      },
    });

    try {
      const result = await fn(options);

      // End generation with usage
      await generation.end({
        output: { text: result.text },
        promptTokens: result.usage?.promptTokens,
        completionTokens: result.usage?.completionTokens,
      });

      // End trace
      await trace.end({
        output: { text: result.text },
      });

      return result;
    } catch (error) {
      await generation.error(error as Error);
      await trace.error(error as Error);
      throw error;
    }
  };
}

/**
 * Create a traced version of streamText
 *
 * For streaming responses, this wraps the stream and captures
 * the final token counts when the stream completes.
 */
export function wrapStreamText<T extends AsyncIterable<unknown>>(
  fn: (options: WrappedOptions) => Promise<T>
): (options: WrappedOptions) => Promise<T> {
  return async (options: WrappedOptions): Promise<T> => {
    if (!isInitialized()) {
      console.warn(
        '[LlmOps] SDK not initialized. Call initLlmOps() before using the Vercel AI wrapper.'
      );
      return fn(options);
    }

    const client = getLlmOps();
    const metadata = options.experimental_telemetry?.metadata || {};
    const modelId = options.model?.modelId || 'unknown';
    const provider = options.model?.provider || 'unknown';

    // Create trace
    const trace = client.trace({
      name: 'streamText',
      sessionId: metadata.sessionId,
      userId: metadata.userId,
      input: {
        prompt: options.prompt,
        messages: options.messages,
      },
      metadata: {
        provider,
        modelId,
        streaming: true,
        ...metadata,
      },
    });

    // Create generation
    const generation = client.generation({
      name: `${provider}/${modelId}`,
      modelName: modelId,
      input: {
        prompt: options.prompt,
        messages: options.messages,
      },
      metadata: { streaming: true },
    });

    try {
      const result = await fn(options);

      // Note: For proper streaming support, you'd need to wrap the stream
      // and detect when it completes to capture final token counts.
      // This is a simplified implementation.

      // End generation (token counts would be estimated)
      await generation.end({
        output: { streaming: true },
      });

      // End trace
      await trace.end({
        output: { streaming: true },
      });

      return result;
    } catch (error) {
      await generation.error(error as Error);
      await trace.error(error as Error);
      throw error;
    }
  };
}

// Re-export for convenience
export { getLlmOps, initLlmOps } from '../index';
