---
"graphile-worker-tasks": patch
---

Make `helpers.abortPromise` reject when an `abortSignal` passed to `task.run` aborts.
