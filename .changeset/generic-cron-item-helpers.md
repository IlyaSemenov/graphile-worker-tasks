---
"graphile-worker-tasks": patch
---

Fix `defineCronItem` rejecting a task whose identifier is a type parameter, such as in a generic helper that creates a task together with its cron item.
