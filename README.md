# graphile-worker-tasks

A utility for organizing and collecting `graphile-worker` tasks.

This library is particularly useful when working with `graphile-worker` in environments where the built-in file-based auto-discovery mechanism is either not possible or not desirable, such as when using bundlers or other specialized setups.

## Install

```sh
pnpm add graphile-worker-tasks
```

## Use

Define a task contract: its identifier and payload type, without an implementation.

```ts
// tasks/sendEmail.ts
import { defineTask } from "graphile-worker-tasks"

export const sendEmailTask = defineTask("sendEmail").withPayload<{ to: string }>()
```

Implement the task in a module imported only by the worker:

```ts
// tasks/sendEmail.task.ts
import { sendEmail } from "../email"

import { sendEmailTask } from "./sendEmail"

export default sendEmailTask.implement(async ({ to }) => {
  await sendEmail(to)
})
```

Collect the tasks in a module imported only by the worker:

```ts
// tasks/tasks.ts
import { mergeTasks } from "graphile-worker-tasks"

import sendEmail from "./sendEmail.task"

export const tasks = mergeTasks([
  sendEmail,
  // ...
])
```

Run the worker with these tasks:

```ts
import { run } from "graphile-worker"
import { createTaskList } from "graphile-worker-tasks"

import { tasks } from "./tasks/tasks"

await run({
  connectionString: "...",
  taskList: createTaskList(tasks),
  parsedCronItems: [],
})
```

Extend `GraphileWorker.Tasks` to ensure the `graphile-worker` tooling picks up the types:

```ts
declare global {
  namespace GraphileWorker {
    interface Tasks extends GraphileWorkerTasks<typeof tasks> {}
  }
}
```

There is no magic in this module — it just stores the task identifiers and handles the typing quirks.

You can omit the helpers and use the tasks directly, but make sure to use correct task identifiers:

```ts
import sendEmail from "./tasks/sendEmail.task"

await run({
  connectionString: "...",
  taskList: {
    sendEmail, // The key here must match the task identifier.
    // ...
  },
  parsedCronItems: [],
})
```

### Enqueueing jobs

Bind a definition to your app's `addJob` implementation to enqueue jobs with a typed payload:

```ts
// tasks/sendEmail.ts
import { defineTask } from "graphile-worker-tasks"

import { addJob } from "../my-add-job"

export const sendEmailTask = defineTask("sendEmail").withPayload<{ to: string }>().withAddJob(addJob)
```

Producers enqueue jobs through the definition:

```ts
import { sendEmailTask } from "./tasks/sendEmail"

await sendEmailTask.addJob({ to: "user@example.com" }, { maxAttempts: 5 })
```

The producer imports the definition, not the task, so the implementation and its dependencies stay out of the producer's module graph.

For example, to enqueue jobs within the active Orchid ORM transaction, use `addJob` from [graphile-worker-orchid](https://github.com/IlyaSemenov/graphile-worker-orchid).

`withAddJob` returns a new bound definition, so one definition can be bound to several `addJob` implementations.

### Binding every task at once

To bind all tasks to one `addJob` implementation, create a bound `defineTask` once and use it in place of the imported one.
Producers enqueue jobs through its definitions, and `implement` returns a plain task for the worker:

```ts
import { createDefineTask } from "graphile-worker-tasks"

import { addJob } from "../my-add-job"

const defineTask = createDefineTask({ addJob })

export const sendEmailTask = defineTask("sendEmail").withPayload<{ to: string }>()

await sendEmailTask.addJob({ to: "user@example.com" })
```

If only using the bound `addJob`, you can omit augmenting `namespace GraphileWorker`.

### Defining a task with its implementation

`defineTask` also accepts the task function directly and returns it annotated with the task identifier:

```ts
export const sendEmailTask = defineTask("sendEmail", async ({ to }: { to: string }) => {
  await sendEmail(to)
})
```

The same form of a bound `defineTask` also adds `addJob` to the task:

```ts
const defineTask = createDefineTask({ addJob })

export const sendEmailTask = defineTask("sendEmail", async ({ to }: { to: string }) => {
  await sendEmail(to)
})

await sendEmailTask.addJob({ to: "user@example.com" })
```

Such a task brings its implementation and dependencies into every module that imports it.
To split it, move the identifier and payload type to a definition and keep the implementation in a worker-only module:

```ts
// Before
export const sendEmailTask = defineTask("sendEmail", async ({ to }: { to: string }) => {
  await sendEmail(to)
})

// After: tasks/sendEmail.ts
export const sendEmailTask = defineTask("sendEmail").withPayload<{ to: string }>()

// After: tasks/sendEmail.task.ts
export default sendEmailTask.implement(async ({ to }) => {
  await sendEmail(to)
})
```

The task identifier and payload are unchanged, so jobs enqueued before the split run with the new task.

## Running tasks directly

Tasks can be run directly, which is useful in tests:

```ts
import sendEmail from "./tasks/sendEmail.task"

await sendEmail.run({ to: "user@example.com" })
```

By default, `run` provides a minimal `JobHelpers` object.
The default manual helpers use graphile-worker's console logger and include a synthetic `helpers.job` for the manual run.
Helpers that require a real worker or database context, such as `query`, `withPgClient`, `addJob`, `addJobs`, and `getQueueName`, are not provided.

If your task uses those helpers, pass them as the second argument. A partial object is shallow-merged onto the default helpers:

```ts
await sendEmail.run({ to: "user@example.com" }, { query: myTestQuery })
```

For helpers that depend on the payload, pass a factory instead. It receives the default helpers and returns the full helpers object:

```ts
await sendEmail.run({ to: "user@example.com" }, ({ defaultHelpers, payload }) => ({
  ...defaultHelpers,
  query: queryForTenant(payload),
}))
```

When using a bound `defineTask`, you can configure default helpers for `run` of every task it defines.
Per-call helpers still override them:

```ts
const defineTask = createDefineTask({
  addJob,
  helpers: { query: myTestQuery },
})
```

### Cancelling a manual run

By default, `helpers.abortSignal` never aborts during a manual run.

A task supports cancellation by reacting to `helpers.abortSignal` or `helpers.abortPromise`.
To cancel such a task during a manual run, pass `abortSignal`.
Unless you also pass `abortPromise`, `helpers.abortPromise` rejects when the signal aborts, as in a worker run:

```ts
// tasks/pollFeed.ts
import { defineTask } from "graphile-worker-tasks"

export const pollFeedTask = defineTask("pollFeed").withPayload<number>()
```

```ts
// tasks/pollFeed.task.ts
import { setTimeout } from "node:timers/promises"

import { pollFeedTask } from "./pollFeed"

export default pollFeedTask.implement(async (delay, helpers) => {
  await setTimeout(delay, undefined, { signal: helpers.abortSignal })
})
```

```ts
import pollFeed from "./tasks/pollFeed.task"

const controller = new AbortController()
const run = pollFeed.run(60_000, { abortSignal: controller.signal })
controller.abort()
await run // rejects with an AbortError
```

The same applies to helpers configured for a bound `defineTask`: a per-call `abortSignal` without `abortPromise` also replaces the configured `abortPromise`.
A helpers factory must keep `abortSignal` and `abortPromise` consistent itself.
