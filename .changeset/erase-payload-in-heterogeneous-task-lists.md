---
"graphile-worker-tasks": patch
---

Fix `mergeTasks` and `createTaskList` to accept tasks with different payload types without requiring `any`.
Export the new `AnyNamedTask` type (`NamedTask<string, never>`) for consumers who need to type a heterogeneous list of tasks themselves.
