---
"graphile-worker-tasks": minor
---

Add standalone task definitions: `defineTask(name).withPayload<T>()` declares a task without an implementation, `implement()` creates the task, and `withAddJob()` or `createDefineTask()` binds it to `addJob` for enqueueing.
