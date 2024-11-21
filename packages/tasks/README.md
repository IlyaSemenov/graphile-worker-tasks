# graphile-worker-tasks

A utility for organizing and collecting `graphile-worker` tasks.

This library is particularly useful when working with `graphile-worker` in environments where the built-in file-based auto-discovery mechanism is either not possible or not desirable, such as when using bundlers or other specialized setups.

## Install

```sh
pnpm add graphile-worker-tasks
```

## Use

Define task types:

```ts
declare global {
  namespace GraphileWorker {
    interface Tasks {
      sendEmail: { email: string }
      // ...
    }
  }
}

export {}
```

Define tasks:

```ts
import { defineTask } from "graphile-worker-tasks"

// Type check task name, infer argument types.
export default defineTask("sendEmail", async ({ email }) => {
  console.log(`Sending email: ${email}`)
})
```

Collect and run tasks:

```ts
import { run } from "graphile-worker"
import { createTaskList } from "graphile-worker-tasks"

import sendEmailTask from "./tasks/sendEmail"

const taskList = createTaskList([
  sendEmailTask,
  // ...
])

await run({
  connectionString: "...",
  taskList,
  parsedCronItems: [],
})
```

You can use the task handlers directly, but make sure to use correct names:

```ts
import { run } from "graphile-worker"

// Import the module under a name that matches the queue job name.
import sendEmail from "./tasks/sendEmail"

await run({
  connectionString: "...",
  taskList: {
    sendEmail, // The key here must match the queue job name.
    // ...
  },
  parsedCronItems: [],
})
```
