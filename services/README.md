# 微服务目录

本目录用于存放项目的实际微服务。整个规范目录复制到目标项目后，AI 必须先识别目标项目的服务边界，再为每个真实服务建立一个独立子目录。

## 每个微服务的基础结构

```text
services/<service-name>/
├── SERVICE.md
├── CONTRACT.md
├── DEPLOY.md
├── REFERENCES.md
└── ai-tasks/
```

具体填写格式分别见：

- `rules/07-service-contracts.md`
- `rules/10-database-deploy-rollback.md`
- `rules/14-multi-ai-task-worktree-handoff.md`
- `rules/15-official-links-and-source-traceability.md`

本规范源目录不预建虚假微服务。目标项目中只创建真实存在或已确认规划的服务，一个服务一个目录，不允许多个服务共用同一目录。
