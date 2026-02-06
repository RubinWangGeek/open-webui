# Open WebUI 二次开发与持续同步方案（方案 1：Fork + Upstream Remote）

适用场景：  
- 我需要修改 `open-webui/open-webui` 的代码并长期维护自己的版本  
- 同时希望持续拿到上游更新（main/dev 的新功能与修复）  
- 我对上游仓库没有 push 权限（正常情况）  

核心思路：  
- **Fork 上游仓库到自己名下**（你对自己的 fork 有完整权限）  
- 在本地配置 **upstream 远程** 指向原仓库（只读拉取）  
- 你的修改都提交到 fork 的分支（如 `my/dev`、`my/main`）  
- 上游更新时，将上游分支同步到你的分支（推荐 `rebase`，也可 `merge`）

---

## 0. 术语约定

- `origin`：你的 fork 仓库（可 push）
- `upstream`：上游官方仓库 `https://github.com/open-webui/open-webui.git`（只拉取）
- 上游分支：
  - `upstream/main`：主分支（相对稳定）
  - `upstream/dev`：开发分支（更新最快，可能不稳定）
- 你的长期维护分支（建议）：
  - `my/main`：基于 `upstream/main` 的你的版本
  - `my/dev`：基于 `upstream/dev` 的你的版本

---

## 1. 一次性准备：Fork + 本地克隆 + 添加 upstream

### 1.1 在 GitHub 上 Fork
在 GitHub 打开上游仓库：`open-webui/open-webui`  
点击右上角 **Fork**，生成到你的账号下：`<yourname>/open-webui`

### 1.2 本地克隆你的 fork
```bash
git clone https://github.com/<yourname>/open-webui.git
cd open-webui
```

### 1.3 添加上游 remote（只读）
```bash
git remote add upstream https://github.com/open-webui/open-webui.git
git remote -v
```

你应该看到：
- `origin  https://github.com/<yourname>/open-webui.git (fetch/push)`
- `upstream https://github.com/open-webui/open-webui.git (fetch)`

### 1.4 拉取上游分支
```bash
git fetch upstream
```

---

## 2. 建立你的长期维护分支（不要直接改 main/dev）

> 目标：你的改动集中在 `my/*` 分支，便于同步与发布。

### 2.1 选择基线：跟 `main` 还是 `dev`？
- 想更稳：从 `upstream/main` 起
- 想拿最新：从 `upstream/dev` 起

#### 基于 upstream/dev 创建你的分支
```bash
git checkout -b my/dev upstream/dev
git push -u origin my/dev
```

#### （可选）基于 upstream/main 创建你的分支
```bash
git checkout -b my/main upstream/main
git push -u origin my/main
```

---

## 3. 日常开发流程（推荐）

### 3.1 从你的长期分支拉一个功能分支
```bash
git checkout my/dev
git pull
git checkout -b feature/<short-name>
```

### 3.2 修改代码并提交
```bash
git add .
git commit -m "feat: <your change summary>"
git push -u origin feature/<short-name>
```

### 3.3 合并回你的长期分支（本地或通过 GitHub PR）
本地合并示例：
```bash
git checkout my/dev
git merge --no-ff feature/<short-name>
git push origin my/dev
```

---

## 4. 上游更新同步到你的分支（两种方式）

### 方式 A（推荐）：rebase（保持历史干净，像补丁栈）
优点：历史更线性、冲突更集中、回滚更清晰  
注意：rebase 后需要强推到 **你自己的 fork**（不会影响上游）

#### 同步 my/dev <- upstream/dev
```bash
git fetch upstream
git checkout my/dev
git rebase upstream/dev
# 如果有冲突：
# 1) 手动解决冲突文件
# 2) git add <resolved-files>
# 3) git rebase --continue
git push -f origin my/dev
```

#### 同步 my/main <- upstream/main
```bash
git fetch upstream
git checkout my/main
git rebase upstream/main
git push -f origin my/main
```

### 方式 B：merge（不改历史，不强推）
优点：不需要强推，团队协作心理负担低  
缺点：历史会出现较多 merge commit

```bash
git fetch upstream
git checkout my/dev
git merge upstream/dev
git push origin my/dev
```

---

## 5. 发布与使用建议（避免“今天能跑明天炸”）

### 5.1 不要用浮动分支做部署
生产/自用部署建议使用 **固定 commit 或 tag**：

```bash
# 在 my/dev 上打 tag
git checkout my/dev
git tag release-2026-02-06
git push origin release-2026-02-06
```

部署时使用：
- 固定 tag：`release-2026-02-06`
- 或固定 commit SHA

### 5.2 建议同步节奏
- 如果你基于 `dev`：建议 **每周/每两周** 同步一次上游，避免一次性冲突太大
- 如果你基于 `main`：可 **每月** 同步一次或按需同步

---

## 6. 冲突处理与最佳实践

### 6.1 把“改动做薄”
为了让后续同步更轻松：
- 尽量把定制集中到少量文件/目录
- 能配置解决的不要硬改核心逻辑
- 尽量避免大范围重构与格式化（会增加冲突）

### 6.2 记录你的改动点
建议在仓库里维护：
- `docs/customizations.md`：写清你改了哪些模块、为什么改、如何验证
- `CHANGELOG_CUSTOM.md`：记录每次发布 tag 的变更摘要

---

## 7. 常用命令速查

查看分支与跟踪关系：
```bash
git branch -vv
```

查看 remote：
```bash
git remote -v
```

拉上游更新：
```bash
git fetch upstream
```

将当前分支重置为上游（慎用，会丢本地未保存改动）：
```bash
git reset --hard upstream/dev
```

---

## 8. 推荐的分支命名规范（可选）

- `my/dev` / `my/main`：你的长期维护分支
- `feature/*`：功能开发
- `hotfix/*`：紧急修复
- `release/*` 或 `tag release-YYYY-MM-DD`：发布版本

---

## 9. 与 Codex 协作的建议（让 AI 更容易改对）

- 每个功能用一个 `feature/*` 分支，目标清晰
- 在 PR/commit message 里写清楚：
  - 背景、改动范围、影响面、验证方式
- 给 AI 明确约束：
  - 不要大范围重排/格式化
  - 只改指定目录
  - 必须补充最小验证步骤（lint/build/启动）

---

完成以上设置后，你就可以：
- 在自己的 fork 上自由开发与 push
- 随时从 upstream 拉取更新并合并到你的版本
- 用 tag/commit 固定部署版本，保证稳定可控
