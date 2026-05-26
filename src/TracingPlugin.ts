/**
 * Functional implementation of the tracing plugin.
 * Captures distributed traces with spans for each turn, step, and tool call.
 */

/** Contract for the tracing plugin returned by the factory. */
export interface TracingPlugin {
  name: string;
  version: string;
  initialize(container: any): Promise<void>;
  beforeTurn(ctx: TurnContext): Promise<void>;
  afterTurn(ctx: TurnContext): Promise<void>;
  getTraces(): Trace[];
  getActiveTrace(): Trace | null;
  shutdown(): Promise<void>;
}

/** Context provided by the loop on each turn for trace correlation. */
export interface TurnContext {
  turnNumber: number;
  agentId: string;
  traceId?: string;
  steps?: StepInfo[];
  toolCalls?: ToolCallInfo[];
  error?: Error;
}

/** Timing information for a single workflow step. */
export interface StepInfo {
  name: string;
  duration: number;
  startTime: number;
}

/** Timing and success information for a single tool invocation. */
export interface ToolCallInfo {
  name: string;
  duration: number;
  startTime: number;
  success: boolean;
}

/** A complete trace containing all spans for a logical operation. */
export interface Trace {
  traceId: string;
  spans: Span[];
  startTime: number;
  endTime?: number;
  status: 'active' | 'completed' | 'error';
}

/** A single unit of work within a trace, following OpenTelemetry conventions. */
export interface Span {
  spanId: string;
  parentSpanId?: string;
  traceId: string;
  operationName: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  tags: Record<string, string | number | boolean>;
  status: 'ok' | 'error';
  error?: Error;
}

/**
 * Factory that creates an in-memory tracing plugin.
 * Supports trace propagation via explicit traceId on the turn context.
 */
export function createTracingPlugin(config?: any): TracingPlugin {
  let counter = 0;
  const traces: Trace[] = [];
  let activeTrace: Trace | null = null;

  function generateId(): string {
    counter++;
    return `span-${counter}-${Date.now().toString(36)}`;
  }

  function generateTraceId(): string {
    counter++;
    return `trace-${counter}-${Date.now().toString(36)}`;
  }

  return {
    name: 'tracing',
    version: '0.1.0',

    /** Initialize the tracing plugin. */
    async initialize(_container: any): Promise<void> {},

    /** Begin or resume a trace for the current turn. */
    async beforeTurn(ctx: TurnContext): Promise<void> {
      const traceId = ctx.traceId || generateTraceId();
      const existing = traces.find(t => t.traceId === traceId);
      if (existing) {
        activeTrace = existing;
        activeTrace.status = 'active';
        activeTrace.endTime = undefined;
      } else {
        activeTrace = {
          traceId,
          spans: [],
          startTime: Date.now(),
          status: 'active',
        };
      }
    },

    /** Record step and tool call spans after a turn completes. */
    async afterTurn(ctx: TurnContext): Promise<void> {
      if (!activeTrace) return;

      if (ctx.steps) {
        for (const step of ctx.steps) {
          activeTrace.spans.push({
            spanId: generateId(),
            traceId: activeTrace.traceId,
            operationName: step.name,
            startTime: step.startTime,
            endTime: step.startTime + step.duration,
            duration: step.duration,
            tags: {},
            status: 'ok',
          });
        }
      }

      if (ctx.toolCalls) {
        for (const tool of ctx.toolCalls) {
          activeTrace.spans.push({
            spanId: generateId(),
            traceId: activeTrace.traceId,
            operationName: tool.name,
            startTime: tool.startTime,
            endTime: tool.startTime + tool.duration,
            duration: tool.duration,
            tags: {},
            status: tool.success ? 'ok' : 'error',
          });
        }
      }

      if (ctx.error) {
        activeTrace.status = 'error';
        activeTrace.spans.push({
          spanId: generateId(),
          traceId: activeTrace.traceId,
          operationName: 'error',
          startTime: activeTrace.startTime,
          endTime: Date.now(),
          tags: {},
          status: 'error',
          error: ctx.error,
        });
      } else {
        activeTrace.status = 'completed';
      }

      activeTrace.endTime = Date.now();

      if (!traces.find(t => t.traceId === activeTrace!.traceId)) {
        traces.push(activeTrace);
      }

      activeTrace = null;
    },

    /** Return all collected traces. */
    getTraces(): Trace[] {
      return traces;
    },

    /** Return the currently active trace, or null. */
    getActiveTrace(): Trace | null {
      return activeTrace;
    },

    /** Shut down the tracing plugin. */
    async shutdown(): Promise<void> {},
  };
}
