/** Base plugin contract shared across all iteratio plugins. */
import type { Container } from 'inversify';

/** Context passed to lifecycle hooks. */
export interface TurnContext {
  turnNumber: number;
  messages: Array<{ role: string; content: string }>;
  state: Record<string, unknown>;
}

export interface IPlugin {
  name: string;
  version: string;
  initialize(container: Container): Promise<void>;
  shutdown(): Promise<void>;
}

/** Configuration for the tracing plugin. */
export interface TracingConfig {
  enabled?: boolean;
  samplingRate?: number;
  exportEndpoint?: string;
}

/** A single unit of work within a trace. */
export interface Span {
  id: string;
  traceId: string;
  parentId?: string;
  operation: string;
  startTime: number;
  endTime?: number;
  attributes: Record<string, unknown>;
}

/** A complete trace containing all spans for a logical operation. */
export interface Trace {
  id: string;
  rootSpan: Span;
  startTime: number;
  endTime?: number;
  spans: Span[];
}

/** Hierarchical representation of a span and its children. */
export interface SpanTree {
  span: Span;
  children: SpanTree[];
}

/**
 * Captures distributed traces with spans for each turn, step, and tool call.
 * Stub implementation -- see TracingPlugin.ts for the functional version.
 */
export class TracingPlugin implements IPlugin {
  readonly name = 'tracing';
  readonly version = '0.1.0';

  /** Initialize the plugin with a dependency injection container. */
  initialize(container: Container): Promise<void> {
    throw new Error('TODO: Implement initialize');
  }

  /** Configure the tracing plugin with new settings at runtime. */
  configure(config: TracingConfig): void {
    throw new Error('TODO: Implement configure');
  }

  /** Pre-turn lifecycle hook. */
  beforeTurn(ctx: TurnContext): Promise<void> {
    throw new Error('TODO: Implement beforeTurn');
  }

  /** Post-turn lifecycle hook. */
  afterTurn(ctx: TurnContext): Promise<void> {
    throw new Error('TODO: Implement afterTurn');
  }

  /** Shut down the plugin and release any resources. */
  shutdown(): Promise<void> {
    throw new Error('TODO: Implement shutdown');
  }

  /** Return all collected traces. */
  getTraces(): Trace[] {
    throw new Error('TODO: Implement getTraces');
  }

  /** Return the currently active trace, or null if none active. */
  getActiveTrace(): Trace | null {
    throw new Error('TODO: Implement getActiveTrace');
  }
}

/** Convenience factory for the tracing plugin stub. */
export function createTracingPlugin(config?: TracingConfig): TracingPlugin {
  throw new Error('TODO: Implement createTracingPlugin');
}

/**
 * Manages parent-child span relationships and W3C traceparent header propagation.
 * Stub implementation -- see SpanCorrelation.ts for the functional version.
 */
export class SpanCorrelator {
  /** Create a root span for a new trace. */
  createRootSpan(traceId: string, operation: string): Span {
    throw new Error('TODO: Implement createRootSpan');
  }

  /** Create a child span under the given parent span. */
  createChildSpan(parent: Span, operation: string): Span {
    throw new Error('TODO: Implement createChildSpan');
  }

  /** Mark a span as ended with the current timestamp. */
  endSpan(span: Span): void {
    throw new Error('TODO: Implement endSpan');
  }

  /** Build a hierarchical tree of spans for the given trace. */
  getSpanTree(traceId: string): SpanTree {
    throw new Error('TODO: Implement getSpanTree');
  }

  /** Encode span context into W3C traceparent headers. */
  injectHeaders(span: Span): Record<string, string> {
    throw new Error('TODO: Implement injectHeaders');
  }

  /** Parse W3C traceparent headers into trace and span IDs. */
  extractFromHeaders(headers: Record<string, string>): { traceId: string; spanId: string } | null {
    throw new Error('TODO: Implement extractFromHeaders');
  }
}

/** Convenience factory for the span correlator stub. */
export function createSpanCorrelator(): SpanCorrelator {
  throw new Error('TODO: Implement createSpanCorrelator');
}
