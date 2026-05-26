import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSpanCorrelator, SpanCorrelator } from '../SpanCorrelation';

describe('SpanCorrelation', () => {
  let correlator: SpanCorrelator;

  beforeEach(() => {
    correlator = createSpanCorrelator();
  });

  describe('parent-child span relationship', () => {
    it('should create child span with reference to parent', () => {
      const root = correlator.createRootSpan('trace-1', 'turn');
      const child = correlator.createChildSpan(root, 'step.llm_call');

      expect(child.parentSpanId).toBe(root.spanId);
      expect(child.traceId).toBe(root.traceId);
    });

    it('should create nested children (grandchild)', () => {
      const root = correlator.createRootSpan('trace-1', 'turn');
      const child = correlator.createChildSpan(root, 'step');
      const grandchild = correlator.createChildSpan(child, 'tool.execute');

      expect(grandchild.parentSpanId).toBe(child.spanId);
      expect(grandchild.traceId).toBe('trace-1');
    });

    it('should maintain tree structure', () => {
      const root = correlator.createRootSpan('trace-1', 'turn');
      const step1 = correlator.createChildSpan(root, 'step.plan');
      const step2 = correlator.createChildSpan(root, 'step.execute');
      const tool = correlator.createChildSpan(step2, 'tool.web_search');

      correlator.endSpan(tool);
      correlator.endSpan(step2);
      correlator.endSpan(step1);
      correlator.endSpan(root);

      const tree = correlator.getSpanTree('trace-1');
      expect(tree.root.spanId).toBe(root.spanId);
      expect(tree.children.get(root.spanId)).toHaveLength(2);
      expect(tree.children.get(step2.spanId)).toHaveLength(1);
      expect(tree.depth).toBe(3); // root -> step -> tool
    });

    it('should give each span a unique spanId', () => {
      const root = correlator.createRootSpan('trace-1', 'turn');
      const child1 = correlator.createChildSpan(root, 'a');
      const child2 = correlator.createChildSpan(root, 'b');

      expect(root.spanId).not.toBe(child1.spanId);
      expect(child1.spanId).not.toBe(child2.spanId);
    });
  });

  describe('cross-agent trace correlation', () => {
    it('should share traceId across agent boundaries', () => {
      // Agent A creates a trace
      const agentASpan = correlator.createRootSpan('shared-trace-id', 'agent_a.turn');

      // Agent B joins the same trace
      const agentBSpan = correlator.createChildSpan(agentASpan, 'agent_b.turn');

      expect(agentASpan.traceId).toBe('shared-trace-id');
      expect(agentBSpan.traceId).toBe('shared-trace-id');
      expect(agentBSpan.parentSpanId).toBe(agentASpan.spanId);
    });

    it('should produce a unified tree from multiple agents', () => {
      const agentA = correlator.createRootSpan('multi-agent-trace', 'agent_a');
      const agentB = correlator.createChildSpan(agentA, 'agent_b');
      const agentC = correlator.createChildSpan(agentA, 'agent_c');
      const bTool = correlator.createChildSpan(agentB, 'agent_b.tool');

      correlator.endSpan(bTool);
      correlator.endSpan(agentC);
      correlator.endSpan(agentB);
      correlator.endSpan(agentA);

      const tree = correlator.getSpanTree('multi-agent-trace');
      expect(tree.root.operationName).toBe('agent_a');
      expect(tree.children.get(agentA.spanId)).toHaveLength(2);
    });
  });

  describe('cross-machine trace propagation', () => {
    it('should inject trace context into transport headers', () => {
      const span = correlator.createRootSpan('trace-xyz', 'remote_call');

      const headers = correlator.injectHeaders(span);

      expect(headers).toHaveProperty('traceparent');
      expect(headers['traceparent']).toContain('trace-xyz');
      expect(headers['traceparent']).toContain(span.spanId);
    });

    it('should extract trace context from incoming headers', () => {
      const span = correlator.createRootSpan('trace-abc', 'original');
      const headers = correlator.injectHeaders(span);

      // Simulate receiving on another machine
      const extracted = correlator.extractFromHeaders(headers);

      expect(extracted).not.toBeNull();
      expect(extracted!.traceId).toBe('trace-abc');
      expect(extracted!.spanId).toBe(span.spanId);
    });

    it('should return null for missing trace headers', () => {
      const extracted = correlator.extractFromHeaders({});
      expect(extracted).toBeNull();
    });

    it('should return null for malformed trace headers', () => {
      const extracted = correlator.extractFromHeaders({ traceparent: 'garbage-data' });
      expect(extracted).toBeNull();
    });

    it('should support W3C Trace Context format', () => {
      const span = correlator.createRootSpan('0af7651916cd43dd8448eb211c80319c', 'call');
      const headers = correlator.injectHeaders(span);

      // W3C format: version-traceId-spanId-flags
      expect(headers['traceparent']).toMatch(/^[\da-f]{2}-[\da-f]{32}-[\da-f]{16}-[\da-f]{2}$/);
    });
  });

  describe('span timing accuracy', () => {
    it('should record start time on span creation', () => {
      const before = Date.now();
      const span = correlator.createRootSpan('trace-1', 'op');
      const after = Date.now();

      expect(span.startTime).toBeGreaterThanOrEqual(before);
      expect(span.startTime).toBeLessThanOrEqual(after);
    });

    it('should record end time when span is ended', () => {
      const span = correlator.createRootSpan('trace-1', 'op');
      const before = Date.now();
      correlator.endSpan(span);
      const after = Date.now();

      expect(span.endTime).toBeGreaterThanOrEqual(before);
      expect(span.endTime).toBeLessThanOrEqual(after);
    });

    it('should calculate duration as endTime - startTime', () => {
      vi.useFakeTimers();
      const span = correlator.createRootSpan('trace-1', 'timed_op');
      vi.advanceTimersByTime(250);
      correlator.endSpan(span);

      expect(span.duration).toBe(250);
      vi.useRealTimers();
    });

    it('should have child span duration within parent span duration', () => {
      vi.useFakeTimers();
      const parent = correlator.createRootSpan('trace-1', 'parent');
      vi.advanceTimersByTime(50);
      const child = correlator.createChildSpan(parent, 'child');
      vi.advanceTimersByTime(100);
      correlator.endSpan(child);
      vi.advanceTimersByTime(50);
      correlator.endSpan(parent);

      expect(child.duration).toBe(100);
      expect(parent.duration).toBe(200);
      expect(child.duration!).toBeLessThan(parent.duration!);
      vi.useRealTimers();
    });
  });

  describe('nested spans (turn -> step -> tool)', () => {
    it('should create proper nesting for turn/step/tool hierarchy', () => {
      const turnSpan = correlator.createRootSpan('trace-1', 'turn');
      const stepSpan = correlator.createChildSpan(turnSpan, 'step.execute');
      const toolSpan = correlator.createChildSpan(stepSpan, 'tool.web_search');

      expect(toolSpan.parentSpanId).toBe(stepSpan.spanId);
      expect(stepSpan.parentSpanId).toBe(turnSpan.spanId);
      expect(turnSpan.parentSpanId).toBeUndefined();
    });

    it('should track depth correctly', () => {
      const turn = correlator.createRootSpan('trace-1', 'turn');
      const step = correlator.createChildSpan(turn, 'step');
      const tool = correlator.createChildSpan(step, 'tool');

      correlator.endSpan(tool);
      correlator.endSpan(step);
      correlator.endSpan(turn);

      const tree = correlator.getSpanTree('trace-1');
      expect(tree.depth).toBe(3);
    });

    it('should allow multiple tools under one step', () => {
      const turn = correlator.createRootSpan('trace-1', 'turn');
      const step = correlator.createChildSpan(turn, 'step');
      const tool1 = correlator.createChildSpan(step, 'tool.search');
      const tool2 = correlator.createChildSpan(step, 'tool.read');

      correlator.endSpan(tool1);
      correlator.endSpan(tool2);
      correlator.endSpan(step);
      correlator.endSpan(turn);

      const tree = correlator.getSpanTree('trace-1');
      expect(tree.children.get(step.spanId)).toHaveLength(2);
    });
  });
});
