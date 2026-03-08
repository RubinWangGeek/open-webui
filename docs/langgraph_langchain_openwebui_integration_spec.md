# 方案：LangGraph/LangChain 做核心 + Open WebUI 做 UI（Pipelines 作为桥接层）
> 目的：把“个人知识库 + 方法论 Skills（工作/赛维人格/博弈论/第一性原理）”做成 **本地可运行** 的 Agent 系统。  
> UI 使用 Open WebUI；真正的编排、检索、技能执行在你自建的 `agent-core` 服务中完成。  
> 原则：**Pipelines 不替代 LangGraph/LangChain，只做 Adapter/Router（轻逻辑）**。

---

## 1. 诉求（What / Why）

### 1.1 我想要的最终效果
- 在本地通过一个 UI（Open WebUI）和 Agent 对话
- Agent 能：
  1) 自动判断应调用哪些 **Skills**
  2) 从个人知识库检索证据（RAG）并提供引用（citations）
  3) 信息不全时追问（Ask-back）
  4) 输出结构化结果（Markdown + JSON）
  5) 落盘可回放（trace/audit）

### 1.2 核心理念
- **Skill-first**：把方法论固化成稳定、可测试、可复用的 Skills
- **Agent-driven**：用 LangGraph 把 Skills 串成闭环（路由/检索/追问/自检/汇总）

---

## 2. 总体架构（Responsibilities）

### 2.1 Open WebUI（UI 层）
负责：
- 聊天 UI、会话历史
- 模型入口（本地模型/外部模型）统一接入
- 展示 agent-core 输出（文本 + citations）

不负责：
- 任何核心业务编排（Skills 路由、RAG 策略、循环自检等）

### 2.2 Open WebUI Pipelines（桥接层 / Adapter）
负责（尽量精简）：
- 把 Open WebUI 的请求格式转发到 agent-core
- 做轻量路由（可选）：普通对话走 LLM；“技能/Agent 模式”走 agent-core
- 做鉴权（可选）：在转发时附带 `X-API-Key`

不建议做：
- 把 LangGraph/LangChain 的核心逻辑塞进 Pipelines（会导致核心逻辑绑死在 UI 插件里）

### 2.3 agent-core（核心层：LangGraph/LangChain）
负责：
- Skills 定义、路由、执行
- RAG 检索与引用（citations）
- Ask-back 追问补齐信息
- Self-check 质量自检与最多 N 次循环
- Trace 落盘（jsonl/sqlite）

---

## 3. 技术选型（Tech Stack）

### 3.1 LLM 运行（本地优先）
- **Ollama**：本地模型运行与统一 API（可选；也可直接使用 OpenAI-compatible 远端模型）

### 3.2 Agent 编排与集成
- **LangGraph**：状态机/图编排（循环、checkpoint、human-in-the-loop）
- **LangChain**：工具封装、Retriever、模型调用等集成
- （可选）**LlamaIndex**：知识库 ingestion / 索引工程

### 3.3 向量库（MVP 与升级）
- MVP：Chroma（快）
- 升级：pgvector（更稳，可把结构化数据与向量统一存储）

### 3.4 服务与协议
- agent-core：FastAPI（HTTP API）
- 输出格式：Markdown + JSON（含 citations）

---

## 4. 项目结构（Repo Layout）

### 4.1 建议拆成两个 Repo（强烈推荐）
1) `open-webui/`（尽量不 fork，或只做最小改动）
2) `agent-core/`（你自己完全掌控，长期沉淀 skills 资产）

#### agent-core 目录结构（建议）
```
agent-core/
  README.md
  pyproject.toml
  .env.example

  apps/
    api.py                # FastAPI：/v1/chat/completions or /chat
    cli.py                # 可选：本地调试

  core/
    config.py
    logging.py
    models.py             # Pydantic：state、inputs、outputs、citations

  kb/
    ingest.py
    chunking.py
    embeddings.py
    vector_store.py       # chroma/pgvector adapter
    retriever.py

  skills/
    <skill_id>/
      manifest.yaml
      prompt.md
      schema.json
      tests/

  agent/
    graph.py              # LangGraph 定义
    router.py             # skill route
    askback.py
    executor.py
    selfcheck.py
    trace_store.py

  tests/
    test_agent_flow.py
    test_kb_ingest.py
```

---

## 5. 接入方式（两种选择）

### 方式 A（推荐）：agent-core 实现 OpenAI-compatible Chat Completions
**目标**：Open WebUI 把 agent-core 当成一个“模型提供商”使用，集成最顺滑。

agent-core 提供接口：
- `POST /v1/chat/completions`

请求体（最小兼容，OpenAI 格式）：
```json
{
  "model": "agent-core",
  "messages": [
    {"role": "system", "content": "你是我的本地个人Agent"},
    {"role": "user", "content": "帮我用第一性原理分析这个问题..."}
  ],
  "stream": false
}
```

响应体（OpenAI 格式 + 附加字段建议放在 `metadata` 或 `tool` 字段里）：
```json
{
  "id": "cmpl_xxx",
  "object": "chat.completion",
  "created": 0,
  "model": "agent-core",
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": "（最终 Markdown 输出，带引用标注）"
    },
    "finish_reason": "stop"
  }],
  "metadata": {
    "request_id": "req_xxx",
    "citations": [
      {"source_id": "fp_book_01", "chunk_id": "fp_book_01#c12", "quote_hint": "第一性原理四步法..."}
    ]
  }
}
```

> 说明：Open WebUI 的展示对 `metadata` 的支持程度与版本有关；如果 UI 不展示 citations，可在 `content` 中用清晰格式呈现（见 6.2）。

### 方式 B：Pipelines 作为 Adapter 转发到 agent-core 私有接口
agent-core 提供更直观的自定义接口：
- `POST /chat`
- `POST /skills/run`
- `POST /kb/ingest`

Pipelines 转发请求并把响应拼装回 Open WebUI 可展示的内容。

---

## 6. 输出规范（必须可读 + 可结构化 + 可引用）

### 6.1 所有响应至少包含
- `result_markdown`：给人看的最终结果（主输出）
- `result_structured`：给系统用的结构化 JSON（用于后续复用/自动化）
- `citations`：必须有引用来源（source_id / chunk_id / quote_hint）
- `next_questions`：信息不足时的追问清单
- `confidence`：low/med/high 或 0-1

### 6.2 建议在 Markdown 中统一引用格式（UI 兼容最好）
示例：
```md
## 结论
...（结论内容）...

## 依据
- [fp_book_01#c12] 第一性原理四步法：拆解目标→约束→变量→路径
- [game_notes_02#c07] 博弈论：参与者、策略空间、收益矩阵的定义
```

---

## 7. Skills 体系（Skill-first 资产沉淀）

### 7.1 MVP Skills（建议先做 8 个）
1) `first_principles_analysis`：第一性原理拆解与决策路径  
2) `game_theory_analysis`：博弈结构/策略/收益与对策  
3) `sawei_personality_profile`：赛维人格画像与沟通建议  
4) `work_retrospective`：工作复盘（事实/原因/改进/行动）  
5) `negotiation_strategy`：谈判策略（底线/让步/锚点/话术）  
6) `decision_memo`：决策备忘录（选项/取舍/风险/建议）  
7) `action_plan`：行动计划（里程碑/Owner/风险/验收）  
8) `summary_with_citations`：对任意材料做结构化总结并引用  

### 7.2 Skill 定义文件（必须）
- `manifest.yaml`：purpose、inputs、outputs、retrieval_policy、quality_checks、version
- `schema.json`：输入/输出 JSON schema
- `prompt.md`：固定模板（保证输出结构稳定）
- `tests/`：至少 1~3 个回归用例

---

## 8. LangGraph 编排（Agent Graph）

### 8.1 节点（MVP 必须）
1) `Intake`：解析用户问题（生成 intent 草案）  
2) `Route`：选择 skill（可多选）形成 SkillPlan  
3) `AskBack`：缺关键输入时追问（暂停等待用户补充）  
4) `Retrieve`：按 retrieval_policy 检索 evidence + citations  
5) `ExecuteSkill`：执行技能产出结构化结果  
6) `SelfCheck`：检查是否答偏/是否缺引用/是否结构不合规（最多循环 N 次）  
7) `Finalize`：汇总输出（Markdown + JSON），落盘 trace  

### 8.2 状态（State）字段建议
- `thread_id`
- `request_id`
- `user_query`
- `intent`
- `skill_plan[]`
- `retrieval_results[]`
- `skill_outputs[]`
- `final_output`
- `audit_log[]`

---

## 9. Open WebUI 集成步骤（落地清单）

### 9.1 先跑起来（最小可用）
1) 启动向量库（Chroma 或 Postgres+pgvector）  
2) 启动 `agent-core`（FastAPI）  
3) 启动 Open WebUI  
4) 在 Open WebUI 中配置一个“自定义 OpenAI-compatible provider”  
   - Base URL 指向 `agent-core`
   - API Key（如果你实现了鉴权）

### 9.2 再增强（可选）
- 使用 Open WebUI Pipelines 做：  
  - 轻量路由（普通聊天 vs 技能/Agent 模式）  
  - 附带用户信息（例如 user_id/thread_id）到 agent-core  
  - 输出转成更适合 UI 展示的格式（引用折叠、卡片等）

---

## 10. 安全与边界（必须写进实现）
- agent-core 默认只监听 `127.0.0.1` 或内网；不要暴露公网  
- Pipelines 转发必须做简单鉴权（X-API-Key）  
- 对外部输入做 prompt 注入防护：  
  - 检索内容只作为“证据”，不能覆盖 system 指令  
  - 输出必须带 citations，且结论必须可追溯到 citations（最低要求）  

---

## 11. 验收标准（Acceptance Criteria）
MVP 完成判定：  
1) `kb ingest` 能导入资料并检索到  
2) 任意一次对话输出都包含：  
   - Markdown 结论 + 依据引用  
   - JSON 结构化结果（含 citations、next_questions、confidence）  
3) Agent 支持追问补齐信息  
4) Skills 至少 8 个，且每个 skill 至少 1 个回归 case  
5) Open WebUI 能把 agent-core 当作 provider 使用，能在 UI 上完整完成一轮问答并看到引用  

---

## 12. 给 Claude 写代码的任务清单（按顺序执行）
1) 初始化 `agent-core` repo（FastAPI + 基础目录结构 + config）  
2) 实现 KB ingestion（md/txt -> chunk -> embedding -> chroma）  
3) 实现 Retriever（带 metadata filter + top_k）  
4) 实现 Skills 规范（manifest+schema 校验 + examples/tests）  
5) 实现 LangGraph 编排图（Route/AskBack/Retrieve/Execute/SelfCheck/Finalize）  
6) 实现 OpenAI-compatible `/v1/chat/completions` 接口（方式 A）  
7) 输出格式强制：Markdown + citations + JSON（metadata）  
8) 写最小 smoke tests（agent flow / kb ingest）  
9) 提供 `docker-compose.yml`（可选）：open-webui + agent-core + chroma/pg  

> 约束：每一步都必须可运行验证；改动范围可控；提交信息清晰；禁止一次性大重构；优先实现 MVP。
