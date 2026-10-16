// Compile-only check of extending the global GraphileWorker.Tasks, kept in its own TypeScript project so the augmentation does not retype addJob in other tests.

import type { AddJobFunction } from "graphile-worker"
import type { GraphileWorkerTasks } from "graphile-worker-tasks"
import { defineTask, mergeTasks } from "graphile-worker-tasks"

declare const addJob: AddJobFunction

export const sendEmailTask = defineTask("sendEmail").withPayload<{ to: string }>()
export const pollFeedTask = defineTask("pollFeed").withPayload<number>().withAddJob(addJob)
export const notifyTask = defineTask("notify").withPayload<string>()

export const tasks = mergeTasks([
  notifyTask.implement(async (_message, helpers) => {
    await helpers.addJob("sendEmail", { to: "user@example.com" })
    // @ts-expect-error The payload does not match the sendEmail definition.
    await helpers.addJob("sendEmail", { to: 1 })
  }),
])

declare global {
  // eslint-disable-next-line ts/no-namespace
  namespace GraphileWorker {
    interface Tasks extends GraphileWorkerTasks<[typeof sendEmailTask, typeof pollFeedTask, ...typeof tasks]> {}
  }
}

void addJob("sendEmail", { to: "user@example.com" })
void addJob("pollFeed", 1)
void addJob("notify", "hello")

// @ts-expect-error The payload does not match the sendEmail definition.
void addJob("sendEmail", { to: 1 })
// @ts-expect-error The payload does not match the bound pollFeed definition.
void addJob("pollFeed", "1")
// @ts-expect-error The payload does not match the notify task.
void addJob("notify", 1)
