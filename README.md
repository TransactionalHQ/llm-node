# @usetransactional/llm-node

[![npm version](https://badge.fury.io/js/%40usetransactional%2Fllm-node.svg)](https://www.npmjs.com/package/@usetransactional/llm-node)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

LLM Ops SDK for Transactional - AI observability with cost tracking, trace analysis, and performance monitoring.

## Installation

```bash
npm install @usetransactional/llm-node
```

## Quick Start

```typescript
import { initLlmOps, getLlmOps } from '@usetransactional/llm-node';

// Initialize once at startup
initLlmOps({
  dsn: process.env.TRANSACTIONAL_LLM_OPS_DSN!,
});

// Create traces
const llmOps = getLlmOps();

const trace = llmOps.trace({
  name: 'chat-completion',
  input: { prompt: 'Hello!' },
  userId: 'user-123',
});

const generation = llmOps.generation({
  name: 'gpt-4o',
  modelName: 'gpt-4o',
  input: { messages: [...] },
});

await generation.end({
  output: { content: 'Hi there!' },
  promptTokens: 10,
  completionTokens: 5,
});

await trace.end({ output: { response: 'Hi there!' } });
```

## LangChain Integration

```typescript
import { TransactionalCallbackHandler } from '@usetransactional/llm-node/langchain';
import { ChatOpenAI } from '@langchain/openai';

const handler = new TransactionalCallbackHandler({
  sessionId: 'conversation-123',
  userId: 'user-456',
});

const model = new ChatOpenAI({ modelName: 'gpt-4o' });

const response = await model.invoke('Hello!', {
  callbacks: [handler],
});
```

## Vercel AI SDK Integration

```typescript
import { wrapAiSdk } from '@usetransactional/llm-node/vercel-ai';
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

const wrappedGenerateText = wrapAiSdk(generateText);

const { text } = await wrappedGenerateText({
  model: openai('gpt-4o'),
  prompt: 'Hello!',
});
```

## Configuration

```typescript
initLlmOps({
  // Required: Your project DSN
  dsn: 'https://pk_...@api.usetransactional.com/observability/42',

  // Optional: Disable tracing
  enabled: process.env.NODE_ENV === 'production',

  // Optional: Batch settings
  batchSize: 100,
  flushInterval: 5000,

  // Optional: Debug mode
  debug: false,
});
```

## Documentation

Full documentation available at [usetransactional.com/docs/llm-ops](https://usetransactional.com/docs/llm-ops)

## License

MIT
