/**
 * Span correlation utilities for building parent-child span trees
 * and propagating trace context across service boundaries via W3C traceparent headers.
 */

/** Contract for span correlation operations. */
export interface SpanCorrelator {
  createRootSpan(traceId: string, operation: string): Span;
  createChildSpan(parent: Span, operation: string): Span;
  endSpan(span: Span): void;
  getSpanTree(traceId: string): SpanTree;
  injectHeaders(span: Span): Record<string, string>;
  extractFromHeaders(headers: Record<string, string>): { traceId: string; spanId: string } | null;
}

/** A single unit of work within a trace. */
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
}

/** Hierarchical representation of all spans in a trace. */
export interface SpanTree {
  root: Span;
  /** Maps each parent span ID to its immediate children. */
  children: Map<string, Span[]>;
  /** Maximum nesting depth of the tree. */
  depth: number;
}

/**
 * Factory that creates a span correlator with deterministic span ID generation.
 * Span IDs are sequential hex strings suitable for traceparent propagation.
 */
export function createSpanCorrelator(): SpanCorrelator {
  let counter = 0;
  const spans: Map<string, Span[]> = new Map();

  function generateSpanId(): string {
    counter++;
    return counter.toString(16).padStart(16, '0');
  }

  return {
    /** Create a root span for a new trace with the given operation name. */
    createRootSpan(traceId: string, operation: string): Span {
      const span: Span = {
        spanId: generateSpanId(),
        traceId,
        operationName: operation,
        startTime: Date.now(),
        tags: {},
        status: 'ok',
      };
      if (!spans.has(traceId)) spans.set(traceId, []);
      spans.get(traceId)!.push(span);
      return span;
    },

    /** Create a child span linked to the given parent span. */
    createChildSpan(parent: Span, operation: string): Span {
      const span: Span = {
        spanId: generateSpanId(),
        parentSpanId: parent.spanId,
        traceId: parent.traceId,
        operationName: operation,
        startTime: Date.now(),
        tags: {},
        status: 'ok',
      };
      if (!spans.has(parent.traceId)) spans.set(parent.traceId, []);
      spans.get(parent.traceId)!.push(span);
      return span;
    },

    /** Mark a span as ended and compute its duration. */
    endSpan(span: Span): void {
      span.endTime = Date.now();
      span.duration = span.endTime - span.startTime;
    },

    /** Build a hierarchical span tree for the given trace ID. */
    getSpanTree(traceId: string): SpanTree {
      const allSpans = spans.get(traceId) || [];
      const root = allSpans.find(s => !s.parentSpanId)!;
      const childrenMap = new Map<string, Span[]>();
      for (const s of allSpans) {
        if (s.parentSpanId) {
          if (!childrenMap.has(s.parentSpanId)) childrenMap.set(s.parentSpanId, []);
          childrenMap.get(s.parentSpanId)!.push(s);
        }
      }

      function calcDepth(spanId: string): number {
        const kids = childrenMap.get(spanId);
        if (!kids || kids.length === 0) return 1;
        return 1 + Math.max(...kids.map(k => calcDepth(k.spanId)));
      }

      return {
        root,
        children: childrenMap,
        depth: calcDepth(root.spanId),
      };
    },

    /** Encode span context into a W3C traceparent header value. */
    injectHeaders(span: Span): Record<string, string> {
      const spanId = span.spanId.padStart(16, '0').slice(0, 16);
      return { traceparent: `00-${span.traceId}-${spanId}-01` };
    },

    /** Parse a W3C traceparent header into trace/span IDs. */
    extractFromHeaders(headers: Record<string, string>): { traceId: string; spanId: string } | null {
      const tp = headers['traceparent'];
      if (!tp) return null;
      if (!tp.startsWith('00-')) return null;
      if (!/^[\da-f]{2}$/.test(tp.slice(-2))) return null;
      const middle = tp.slice(3, -3);
      const lastDash = middle.lastIndexOf('-');
      if (lastDash === -1) return null;
      const spanId = middle.slice(lastDash + 1);
      const traceId = middle.slice(0, lastDash);
      if (!/^[\da-f]{16}$/.test(spanId)) return null;
      if (traceId.length === 0) return null;
      return { traceId, spanId };
    },
  };
}
