# graphile-worker-tasks

A utility for organizing and collecting `graphile-worker` tasks.

This library is particularly useful when working with `graphile-worker` in environments where the built-in file-based auto-discovery mechanism is either not possible or not desirable, such as when using bundlers or other specialized setups.

## Install

```sh
pnpm add graphile-worker-tasks
```

## Use

Define tasks:

```ts
import { defineTask } from "graphile-worker-tasks"

export default defineTask("sendEmail", async (email: string) => {
  console.log(`Sending email: ${email}`)
})
```

You can organize tasks across as many modules as needed.

Once defined, collect and run your tasks:

```ts
import { run } from "graphile-worker"
import { createTaskList, mergeTasks } from "graphile-worker-tasks"

import sendEmailTask from "../tasks/sendEmail"

const tasks = mergeTasks([
  sendEmailTask,
  // ...
])

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

There is no magic in this module — basically, it just stores the task identifiers and handles the typing quirks.

You can omit the helpers and use the task handlers directly, but make sure to use correct task identifiers:

```ts
import { run } from "graphile-worker"

// Import the module under a name that matches the task identifier.
import sendEmail from "../tasks/sendEmail"

await run({
  connectionString: "...",
  taskList: {
    sendEmail, // The key here must match the task identifier.
    // ...
  },
  parsedCronItems: [],
})
```

## Binding addJob to tasks

If you want each defined task to also know how to enqueue itself, bind your app's `addJob` implementation once and use the returned `defineTask`.

For example, to enqueue jobs within the active Orchid ORM transaction, use `addJob` from [graphile-worker-orchid](https://github.com/IlyaSemenov/graphile-worker-orchid).

```ts
import { createDefineTask } from "graphile-worker-tasks"

import { addJob } from "../my-add-job"

const defineTask = createDefineTask({ addJob })

export const sendEmail = defineTask("sendEmail", async (email: string) => {
  console.log(`Sending email: ${email}`)
})

// Collect and run tasks as usual, and also enqueue them directly:
await sendEmail.addJob("user@example.com")
```
