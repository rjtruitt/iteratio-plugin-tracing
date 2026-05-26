# iteratio-plugin-tracing

Distributed tracing plugin for iteratio.

## Install

```
npm install iteratio-plugin-tracing
```

## What It Does

Adds OpenTelemetry-compatible span tracking to agent execution. Records traces for LLM calls, tool executions, and plugin lifecycle events. Lets you export traces to any OpenTelemetry-compatible backend (Jaeger, Zipkin, Datadog, etc.) for debugging and performance analysis.

## Usage

```typescript
import { AgentLoop } from 'iteratio';
import { TracingPlugin } from 'iteratio-plugin-tracing';

const tracing = new TracingPlugin({
  serviceName: 'my-agent',
  exporterUrl: 'http://localhost:4318/v1/traces'
});

const loop = AgentLoop.builder()
  .withLLM(llm)
  .withPlugin(tracing)
  .build();
```

## License

MIT
