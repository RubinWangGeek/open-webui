# 部署验证 + Docker 标准流程

日期: 2026-03-07

## 背景

多模型 LLM 配置功能（9 个文件）已全部完成，后端 API curl 验证通过，99 tests pass。
前端代码（Settings 标签）需要 Docker 重建才能生效。
之前 Docker 构建存在两个问题：
1. `package-lock.json` 包含 ByteDance 内部 registry (`bnpm.byted.org`)，导致 `npm ci` 网络失败
2. 使用 `--no-cache` 导致每次全量重建 30+ 分钟

## 已完成

1. 修复 `package-lock.json`（4 处 byted.org → registry.npmjs.org）
2. 创建 `scripts/rebuild.sh` 标准构建脚本（自动红线检查 + 增量构建 + 健康检查）

## 验证步骤

1. 执行 `./scripts/rebuild.sh` 重建 Docker
2. 浏览器确认 Admin → Knowledge → Settings 标签可见
3. 在 Settings UI 配置 API易 模型 + key
4. 点 Test 验证连通性
5. 用梅诗博人格分析问题测试质量
