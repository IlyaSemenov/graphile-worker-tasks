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

Keep `*.task.ts` modules and `tasks.ts` worker-only: code outside the worker that enqueues jobs (producers) must not import them, directly or through barrel files.

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
import type { GraphileWorkerTasks } from "graphile-worker-tasks"

declare global {
  namespace GraphileWorker {
    interface Tasks extends GraphileWorkerTasks<typeof tasks> {}
  }
}
```

To extend it where only definitions are imported, such as in producer code, list the definitions instead:

```ts
import type { GraphileWorkerTasks } from "graphile-worker-tasks"

import { sendEmailTask } from "./tasks/sendEmail"

declare global {
  namespace GraphileWorker {
    interface Tasks extends GraphileWorkerTasks<[typeof sendEmailTask]> {}
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

Use `withPayload<void>()` to let producers enqueue a task without passing a payload: `addJob()`.

`TaskPayload<typeof sendEmailTask>` is the payload type that `addJob` accepts, for example in test helpers that check enqueued jobs.

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

### Wrapping tasks

Wrap a definition to transform its jobs on the way in and its task function on the way out.
For example, a multi-tenant app can store the tenant with each payload and run the task in that tenant's context:

```ts
// tasks/defineTenantTask.ts
import { createDefineTask, prefixTaskSpec, wrapTaskDefinition } from "graphile-worker-tasks"

import { addJob } from "../my-add-job"
import { getTenantSchema, withTenantSchema } from "../tenants"

type TenantJobPayload<TPayload> = { schema: string, payload: TPayload }

const defineTask = createDefineTask({ addJob })

export function defineTenantTask<TIdentifier extends string>(taskIdentifier: TIdentifier) {
  const createDefinition = <TPayload>() => wrapTaskDefinition(
    defineTask(`tenant:${taskIdentifier}`).withPayload<TenantJobPayload<TPayload>>(),
    {
      encodePayload: (payload: TPayload) => ({ schema: getTenantSchema(), payload }),
      encodeSpec: (spec, { schema }) => prefixTaskSpec(spec, `tenant:${schema}:`),
      wrapTask: task => ({ schema, payload }, helpers) => withTenantSchema(schema, () => task(payload, helpers)),
    },
  )
  return Object.assign(createDefinition<unknown>(), { withPayload: createDefinition })
}
```

A wrapped definition has no `withPayload`, because the wrapper cannot derive the job payload type from a new inner payload type, so the factory creates a definition for each payload type.
Like `defineTask(taskIdentifier)`, the factory returns a definition with an `unknown` payload, so `defineTenantTask("cleanup").implement(...)` works without `withPayload`.

The wrapped definition keeps the identifier and the job payload of the given definition, while its `addJob` and the `run` of its task take the inner payload, and the task function passed to `implement` receives it:

```ts
// tasks/sendEmail.ts
import { defineTenantTask } from "./defineTenantTask"

export const sendEmailTask = defineTenantTask("sendEmail").withPayload<{ to: string }>()
```

```ts
// tasks/sendEmail.task.ts
import { sendEmail } from "../email"

import { sendEmailTask } from "./sendEmail"

export default sendEmailTask.implement(async ({ to }) => {
  await sendEmail(to) // Runs in the tenant's context.
})
```

In a tenant's context, this enqueues `tenant:sendEmail` with `{ schema, payload: { to } }` and the job key `tenant:<schema>:welcome`:

```ts
import { sendEmailTask } from "./tasks/sendEmail"

await sendEmailTask.addJob({ to: "user@example.com" }, { jobKey: "welcome" })
```

`prefixTaskSpec` prefixes the job key and the queue name of a spec, when they are not empty, so jobs of different tenants do not share keys and queues.

`GraphileWorkerTasks` and `TaskJobPayload` use the job payload, and `TaskPayload` uses the inner payload.

`run` builds the job payload with `encodePayload` in the current context, so a helpers factory receives the job payload:

```ts
import sendEmail from "./tasks/sendEmail.task"

await sendEmail.run({ to: "user@example.com" }, ({ defaultHelpers, payload }) => ({
  ...defaultHelpers,
  query: queryForTenant(payload.schema),
}))
```

`wrapTaskDefinition` also accepts an unbound definition and keeps its `withAddJob`, because the job payload belongs to the task contract while `addJob` is chosen by the code that enqueues jobs.

### Defining a task with its implementation

A task that no producer enqueues, such as a cron task, can be defined together with its implementation.
`defineTask` accepts the task function directly and returns it annotated with the task identifier:

```ts
// tasks/cleanup.task.ts
import { defineTask } from "graphile-worker-tasks"

import { cleanup } from "../cleanup"

export default defineTask("cleanup", async () => {
  await cleanup()
})
```

The worker references it in a cron item by its identifier:

```ts
import { parseCronItems } from "graphile-worker"

import cleanup from "./tasks/cleanup.task"

const parsedCronItems = parseCronItems([{ task: cleanup.taskIdentifier, match: "0 4 * * *" }])
```

To reuse the schedule elsewhere, give the task a separate definition and export the cron item next to it: the cron item needs only `taskIdentifier`.
A task without payload does not need `withPayload`:

```ts
// tasks/cleanup.ts
import type { CronItem } from "graphile-worker"
import { defineTask } from "graphile-worker-tasks"

export const cleanupTask = defineTask("cleanup")

export const cleanupCronItem: CronItem = { task: cleanupTask.taskIdentifier, match: "0 4 * * *" }
```

```ts
// tasks/cleanup.task.ts
import { cleanup } from "../cleanup"

import { cleanupTask } from "./cleanup"

export default cleanupTask.implement(async () => {
  await cleanup()
})
```

A task defined together with its implementation brings its implementation and dependencies into every module that imports it.
When producers need to enqueue it, move the identifier and payload type to a definition and keep the implementation in a worker-only module:

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

## Testing

`createTestJobs()` from `graphile-worker-tasks/testing` records jobs instead of writing them to the database, so tests can check what code enqueues:

```ts
import { createTestJobs } from "graphile-worker-tasks/testing"

export const testJobs = createTestJobs()
```

In tests, make the `addJob` your definitions are bound to call `testJobs.addJob`, for example through dependency injection or a module mock.

Run the code under test with `capture` and query the jobs it enqueued:

```ts
import { sendEmailTask } from "./tasks/sendEmail"

const jobs = await testJobs.capture(() => signUp("user@example.com"))

expect(jobs.payloadsFor(sendEmailTask)).toEqual([{ to: "user@example.com" }])
```

- The queries cover only the jobs enqueued while the action runs, so jobs of fixtures and earlier steps stay out.
- `jobs.result` is the value returned by the action.
- `jobs.callsFor(sendEmailTask)` returns the identifier, payload, and spec of each job.
- For a wrapped definition, the queries return the job payload.
- `testJobs.calls` lists every recorded job, and `testJobs.clear()` forgets them, for example before each test.

To run a task in a test, see [Running tasks directly](#running-tasks-directly).
