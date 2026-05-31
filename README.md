[中文版本](./README_CN.md)

# DeepGoal

DeepGoal is a pre-alpha AI Agent framework for goal-driven automatic programming. It models engineering workflows as composable pipelines: container nodes orchestrate the flow, while executors perform the leaf work.

## Status

DeepGoal is under active design and development. APIs may change before the first stable release.

**Current version:** TypeScript implementation (deepgoal-ts)

## Requirements

- Node.js 18+
- TypeScript 5.3+

## Installation

```bash
npm install deepgoal
```

For local development:

```bash
cd deepgoal-ts
npm install
npm run build
```

## Minimal Example

```typescript
import { Executor } from 'deepgoal/core';
import type { PipelineInput, PipelineOutput, PipelineResult, EngineOptions } from 'deepgoal/core';
import { Pipe } from 'deepgoal/core';

class WriteSpecExecutor extends Executor {
  async execute(input: PipelineInput, options: EngineOptions): Promise<PipelineResult> {
    return {
      status: 'ok',
      output: { primary_path: 'workspace/spec.md' }
    };
  }
}

const pipe = new Pipe({ items: [new WriteSpecExecutor()] });
const result = await pipe.run({ primary_path: 'goal.md' });
console.log(result.output.primary_path);
```

## Core Idea

- `Node` / `Pipe` are containers that expose pipeline input and output boundaries.
- `Executor` is a leaf execution unit.
- Containers can compose child nodes and executors into serial, parallel, loop, or branch workflows.
