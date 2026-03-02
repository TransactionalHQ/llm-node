/**
 * LLM Ops Type Definitions
 *
 * Core types for the LLM Ops SDK.
 */

// ===========================================
// ENUMS
// ===========================================

export enum TraceStatus {
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR',
}

export enum ObservationType {
  SPAN = 'SPAN',
  GENERATION = 'GENERATION',
  EVENT = 'EVENT',
}

export enum ObservationLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
}

// ===========================================
// TRACE TYPES
// ===========================================

export interface Trace {
  id: string;
  projectId: number;
  sessionId?: string;
  name: string;
  status: TraceStatus;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  tags?: string[];
  userId?: string;
  startTime: string;
  endTime?: string;
  totalTokens: number;
  totalCost: number;
  latencyMs?: number;
}

export interface CreateTraceParams {
  name: string;
  sessionId?: string;
  input?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  tags?: string[];
  userId?: string;
}

export interface UpdateTraceParams {
  status?: TraceStatus;
  output?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  endTime?: string;
}

// ===========================================
// OBSERVATION TYPES
// ===========================================

export interface Observation {
  id: string;
  traceId: string;
  parentObservationId?: string;
  type: ObservationType;
  name: string;
  status: TraceStatus;
  modelName?: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cost?: number;
  startTime: string;
  endTime?: string;
  latencyMs?: number;
  metadata?: Record<string, unknown>;
  level?: ObservationLevel;
}

export interface CreateObservationParams {
  traceId?: string;
  parentObservationId?: string;
  type: ObservationType;
  name: string;
  modelName?: string;
  input?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  level?: ObservationLevel;
}

export interface UpdateObservationParams {
  status?: TraceStatus;
  output?: Record<string, unknown>;
  promptTokens?: number;
  completionTokens?: number;
  metadata?: Record<string, unknown>;
  endTime?: string;
}

// ===========================================
// SESSION TYPES
// ===========================================

export interface Session {
  id: string;
  projectId: number;
  externalId?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
  startTime: string;
  endTime?: string;
  traceCount: number;
  totalTokens: number;
  totalCost: number;
}

export interface UpsertSessionParams {
  id?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

// ===========================================
// BATCH TYPES
// ===========================================

export interface BatchItem {
  type: 'trace' | 'observation' | 'session';
  id: string;
  traceId?: string;
  [key: string]: unknown;
}

export interface BatchIngestParams {
  traces?: CreateTraceParams[];
  observations?: CreateObservationParams[];
  sessions?: UpsertSessionParams[];
}

export interface BatchIngestResult {
  success: boolean;
  tracesCreated: number;
  observationsCreated: number;
  sessionsCreated: number;
  errors?: string[];
}

// ===========================================
// CLIENT TYPES
// ===========================================

export interface LlmOpsConfig {
  /** DSN format: https://{publicKey}@api.usetransactional.com/observability/{projectId} */
  dsn?: string;
  /** Public key (alternative to DSN) */
  publicKey?: string;
  /** Project ID (alternative to DSN) */
  projectId?: number;
  /** Base URL (alternative to DSN) */
  baseUrl?: string;
  /** Enable/disable tracing (default: true) */
  enabled?: boolean;
  /** Batch size before flushing (default: 100) */
  batchSize?: number;
  /** Flush interval in ms (default: 5000) */
  flushInterval?: number;
  /** Enable debug logging (default: false) */
  debug?: boolean;
}

export interface ParsedConfig {
  publicKey: string;
  projectId: number;
  baseUrl: string;
  enabled: boolean;
  batchSize: number;
  flushInterval: number;
  debug: boolean;
}

// ===========================================
// HANDLE TYPES
// ===========================================

export interface TraceHandle {
  id: string;
  end: (params?: { output?: Record<string, unknown> }) => Promise<void>;
  error: (error: Error) => Promise<void>;
}

export interface ObservationHandle {
  id: string;
  end: (params?: {
    output?: Record<string, unknown>;
    promptTokens?: number;
    completionTokens?: number;
  }) => Promise<void>;
  error: (error: Error) => Promise<void>;
}
