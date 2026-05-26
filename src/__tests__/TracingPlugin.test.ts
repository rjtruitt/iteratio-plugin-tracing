import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTracingPlugin, TracingPlugin } from '../TracingPlugin';

describe('TracingPlugin', () => {
  let plugin: TracingPlugin;

  beforeEach(() => {
    plugin = createTracingPlugin({
      serviceName: 'iteratio-agent',
      sampleRate: 1.0, // trace everything
    });
  });

  describe('trace creation', () => {
    it('should create a trace on turn start', async () => {
      await plugin.beforeTurn({ turnNumber: 1, agentId: 'agent-1' });

      const trace = plugin.getActiveTrace();
      expect(trace).not.toBeNull();
      expect(trace!.traceId).toBeDefined();
      expect(trace!.status).toBe('active');
    });

    it('should generate unique traceId', async () => {
      await plugin.beforeTurn({ turnNumber: 1, agentId: 'agent-1' });
      const trace1 = plugin.getActiveTrace()!;

      await plugin.afterTurn({ turnNumber: 1, agentId: 'agent-1' });
      await plugin.beforeTurn({ turnNumber: 2, agentId: 'agent-1' });
      const trace2 = plugin.getActiveTrace()!;

      expect(trace1.traceId).not.toBe(trace2.traceId);
    });

    it('should reuse traceId when provided in context', async () => {
      await plugin.beforeTurn({ turnNumber: 1, agentId: 'agent-1', traceId: 'existing-trace-id' });

      const trace = plugin.getActiveTrace()!;
      expect(trace.traceId).toBe('existing-trace-id');
    });
  });

  describe('span creation', () => {
    it('should create a span per step', async () => {
      await plugin.beforeTurn({ turnNumber: 1, agentId: 'agent-1' });
      await plugin.afterTurn({
        turnNumber: 1,
        agentId: 'agent-1',
        steps: [
          { name: 'llm_call', duration: 500, startTime: Date.now() - 500 },
          { name: 'tool_execute', duration: 200, startTime: Date.now() - 200 },
        ],
      });

      const traces = plugin.getTraces();
      const lastTrace = traces[traces.length - 1];
      expect(lastTrace.spans.length).toBeGreaterThanOrEqual(2);
    });

    it('should include tool name in span', async () => {
      await plugin.beforeTurn({ turnNumber: 1, agentId: 'agent-1' });
      await plugin.afterTurn({
        turnNumber: 1,
        agentId: 'agent-1',
        toolCalls: [
          { name: 'web_search', duration: 300, startTime: Date.now() - 300, success: true },
        ],
      });

      const traces = plugin.getTraces();
      const lastTrace = traces[traces.length - 1];
      const toolSpan = lastTrace.spans.find(s => s.operationName.includes('web_search'));
      expect(toolSpan).toBeDefined();
    });

    it('should include duration in span', async () => {
      await plugin.beforeTurn({ turnNumber: 1, agentId: 'agent-1' });
      await plugin.afterTurn({
        turnNumber: 1,
        agentId: 'agent-1',
        toolCalls: [
          { name: 'file_read', duration: 150, startTime: Date.now() - 150, success: true },
        ],
      });

      const traces = plugin.getTraces();
      const lastTrace = traces[traces.length - 1];
      const span = lastTrace.spans.find(s => s.operationName.includes('file_read'));
      expect(span!.duration).toBe(150);
    });

    it('should generate unique spanId per operation', async () => {
      await plugin.beforeTurn({ turnNumber: 1, agentId: 'agent-1' });
      await plugin.afterTurn({
        turnNumber: 1,
        agentId: 'agent-1',
        steps: [
          { name: 'step1', duration: 100, startTime: Date.now() - 200 },
          { name: 'step2', duration: 100, startTime: Date.now() - 100 },
        ],
      });

      const traces = plugin.getTraces();
      const lastTrace = traces[traces.length - 1];
      const spanIds = lastTrace.spans.map(s => s.spanId);
      const uniqueIds = new Set(spanIds);
      expect(uniqueIds.size).toBe(spanIds.length);
    });
  });

  describe('traceId propagation', () => {
    it('should propagate traceId across turns within same session', async () => {
      await plugin.beforeTurn({ turnNumber: 1, agentId: 'agent-1' });
      const firstTraceId = plugin.getActiveTrace()!.traceId;
      await plugin.afterTurn({ turnNumber: 1, agentId: 'agent-1' });

      // Same trace should continue for multi-turn session
      await plugin.beforeTurn({ turnNumber: 2, agentId: 'agent-1', traceId: firstTraceId });
      const secondTraceId = plugin.getActiveTrace()!.traceId;

      expect(secondTraceId).toBe(firstTraceId);
    });
  });

  describe('trace completion', () => {
    it('should mark trace as completed on turn end', async () => {
      await plugin.beforeTurn({ turnNumber: 1, agentId: 'agent-1' });
      await plugin.afterTurn({ turnNumber: 1, agentId: 'agent-1' });

      const traces = plugin.getTraces();
      const lastTrace = traces[traces.length - 1];
      expect(lastTrace.status).toBe('completed');
      expect(lastTrace.endTime).toBeDefined();
    });

    it('should include all spans in completed trace', async () => {
      await plugin.beforeTurn({ turnNumber: 1, agentId: 'agent-1' });
      await plugin.afterTurn({
        turnNumber: 1,
        agentId: 'agent-1',
        steps: [
          { name: 'plan', duration: 100, startTime: Date.now() - 300 },
          { name: 'execute', duration: 200, startTime: Date.now() - 200 },
        ],
      });

      const traces = plugin.getTraces();
      const lastTrace = traces[traces.length - 1];
      expect(lastTrace.spans.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('error recording', () => {
    it('should record error in span when turn fails', async () => {
      const error = new Error('LLM rate limit exceeded');
      await plugin.beforeTurn({ turnNumber: 1, agentId: 'agent-1' });
      await plugin.afterTurn({ turnNumber: 1, agentId: 'agent-1', error });

      const traces = plugin.getTraces();
      const lastTrace = traces[traces.length - 1];
      expect(lastTrace.status).toBe('error');

      const errorSpan = lastTrace.spans.find(s => s.status === 'error');
      expect(errorSpan).toBeDefined();
      expect(errorSpan!.error!.message).toBe('LLM rate limit exceeded');
    });

    it('should record tool-level errors in individual spans', async () => {
      await plugin.beforeTurn({ turnNumber: 1, agentId: 'agent-1' });
      await plugin.afterTurn({
        turnNumber: 1,
        agentId: 'agent-1',
        toolCalls: [
          { name: 'broken_tool', duration: 50, startTime: Date.now() - 50, success: false },
        ],
      });

      const traces = plugin.getTraces();
      const lastTrace = traces[traces.length - 1];
      const brokenSpan = lastTrace.spans.find(s => s.operationName.includes('broken_tool'));
      expect(brokenSpan!.status).toBe('error');
    });
  });
});
