---
"graphile-worker-tasks": patch
---

Remove `addJob` from the task returned by `implement()` of a bound task definition, added in 2.3.0; enqueue jobs through the definition instead.
