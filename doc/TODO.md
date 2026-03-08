# 个人知识库 Agent 系统 — 总进度追踪

> **最后更新**: 2026-03-05
> **规则**: 每完成一项，将 `[ ]` 改为 `[x]`，并在末尾标注完成日期
> **状态标记**: `[ ]` 待做 | `[~]` 进行中 | `[x]` 已完成 | `[-]` 跳过/取消
> **验收流程**: 每个阶段包含「🔍 验收清单」，用户亲自操作验证后才算完成

---

## 阶段 0: 环境准备与 Open WebUI 部署

> **目标**: 跑起来原版 Open WebUI，熟悉架构，验证环境
> **状态**: 🟢 已完成 (2026-03-04)

### 0.1 本地环境准备
- [x] 安装 Docker Desktop（macOS） — Docker v29.2.0 (2026-03-04)
- [x] 安装 Python 3.11+ — Python 3.14.2 (2026-03-04)
- [ ] 安装 Node.js 18+（如需改前端）
- [x] 克隆 Open WebUI 仓库 (2026-03-04)

### 0.2 部署原版 Open WebUI
- [x] Docker 方式启动 Open WebUI (2026-03-04)
- [x] 访问 http://localhost:3000 并注册管理员账号 (2026-03-05)
- [x] 测试基本聊天功能 (2026-03-05)

### 0.3 安装 Ollama 并测试本地模型
- [x] 安装 Ollama — v0.17.4 (2026-03-04)
- [x] 启动服务: `ollama serve` — 已运行 (2026-03-04)
- [x] 下载测试模型: `ollama pull qwen2.5:7b` (2026-03-05)
- [x] 在 Open WebUI 中连接 Ollama 并测试对话 (2026-03-05)

### 0.4 熟悉 Open WebUI 架构
- [ ] 浏览代码结构（前端 Svelte + 后端 FastAPI）
- [ ] 了解配置文件位置（`.env`）
- [ ] 了解数据存储位置（`/app/backend/data`）
- [ ] 了解 Pipelines 机制

**阶段 0 交付物**:
- [x] 环境工具链已就绪（Docker + Python + Ollama + uv）(2026-03-04)
- [x] Open WebUI 运行在 http://localhost:3000 (2026-03-05 用户验收)
- [x] 能进行基本对话 (2026-03-05 用户验收)
- [ ] 熟悉代码结构和配置方式

**🔍 验收清单（用户操作）** ✅ 已通过 (2026-03-05):
- [x] 打开浏览器访问 http://localhost:3000，看到 Open WebUI 登录页面
- [x] 注册管理员账号，成功登录
- [x] 在聊天界面选择一个模型（Ollama 本地模型），发送一条消息，收到回复
- [x] 用户确认：「能够很好的回答问题」

---

## 阶段 1: Content Processing Pipeline（内容处理层）

> **目标**: 实现从原始语料（PDF/音频/视频）到结构化知识库的完整流程
> **状态**: 🟡 进行中（1A 已完成）

### 1A: agent-core 基础框架 ✅ (2026-03-04)

#### 1A.1 项目初始化
- [x] 创建 `agent-core/` 项目目录 (2026-03-04)
- [x] 初始化项目: `uv init`，Python 3.12.13 (2026-03-04)
- [x] 设置完整目录结构 (2026-03-04)

#### 1A.2 基础依赖安装
- [x] 安装核心依赖: fastapi, uvicorn, pydantic, pydantic-settings, typer, rich (2026-03-04)
- [x] 安装开发依赖: pytest, pytest-asyncio, httpx (2026-03-04)

#### 1A.3 配置系统
- [x] 实现 `core/config.py`（pydantic-settings，支持 .env） (2026-03-04)
- [x] 创建 `.env.example` 模板 (2026-03-04)
- [x] 配置项覆盖: LLM、向量库、存储路径、Whisper、Celery、Agent 参数 (2026-03-04)

#### 1A.4 日志系统
- [x] 实现 `core/logging.py`（统一格式，支持 DEBUG 模式切换） (2026-03-04)

#### 1A.5 FastAPI 框架
- [x] 实现 `apps/api.py`（health + /v1/models 端点、CORS、lifespan） (2026-03-04)
- [x] 实现 `apps/cli.py`（typer CLI：health + serve 命令） (2026-03-04)
- [x] 7 个测试全部通过，0 warnings (2026-03-04)

#### 1A.6 公用数据模型
- [x] 实现 `core/models.py`（12 个模型 + 3 个枚举） (2026-03-04)

**1A 交付物**:
- [x] agent-core 项目结构完整，FastAPI 能启动，配置系统可用 (2026-03-04)

---

### 1B: 内容提取与转录 ✅ (2026-03-04)

#### 1B.1 PDF 提取器
- [x] 安装依赖: `pdfplumber` (2026-03-04)
- [x] 实现 `content_pipeline/extractors/pdf.py` — `PDFExtractor` 类 (2026-03-04)
- [x] 功能: 提取文本 + 元数据（页数、标题、作者） (2026-03-04)
- [x] 单元测试: 4 个测试通过 (2026-03-04)

#### 1B.2 文本提取器
- [x] 实现 `content_pipeline/extractors/text.py` — `TextExtractor` 类 (2026-03-04)
- [x] 功能: 读取 .txt/.md/.rst/.csv/.log 文件 (2026-03-04)
- [x] 单元测试: 4 个测试通过 (2026-03-04)

#### 1B.3 视频下载器
- [x] 安装依赖: `yt-dlp` (2026-03-04)
- [x] 实现 `content_pipeline/downloader/video_downloader.py` — `VideoDownloader` 类 (2026-03-04)
- [x] 功能: yt-dlp 下载（仅音频），提取元数据 (2026-03-04)
- [x] 单元测试: 3 个测试通过 (2026-03-04)

#### 1B.4 音频转录器
- [x] 依赖: `faster-whisper` 设为 optional（macOS x86_64 不兼容 onnxruntime） (2026-03-04)
- [x] 实现 `content_pipeline/transcriber/whisper_transcriber.py` — `WhisperTranscriber` 类 (2026-03-04)
- [x] 功能: 懒加载模型，转录+时间戳，优雅处理未安装情况 (2026-03-04)
- [x] 单元测试: 4 个测试通过 (2026-03-04)

#### 1B.5 视频提取器（组合）
- [x] 实现 `content_pipeline/extractors/video.py` — `VideoExtractor` 类 (2026-03-04)
- [x] 功能: 组合 VideoDownloader + WhisperTranscriber (2026-03-04)
- [x] 单元测试通过 (2026-03-04)

#### 1B.6 音频提取器
- [x] 实现 `content_pipeline/extractors/audio.py` — `AudioExtractor` 类 (2026-03-04)
- [x] 功能: 直接调用 WhisperTranscriber (2026-03-04)
- [x] 单元测试: 2 个测试通过 (2026-03-04)

#### 1B.7 提取器基类与统一接口
- [x] 实现 `content_pipeline/extractors/base.py` — `BaseExtractor` 抽象类 (2026-03-04)
- [x] 所有提取器继承 BaseExtractor，返回统一的 `ExtractedContent` 格式 (2026-03-04)

**1B 交付物**:
- [x] 能从 PDF 提取文本 (2026-03-04)
- [x] 能下载 YouTube 视频并转录 (2026-03-04)
- [x] 能转录本地音频文件 (2026-03-04)
- [x] 所有提取器返回统一格式 (2026-03-04)
- [x] 25 个测试全部通过 (2026-03-04)

**🔍 验收清单（用户操作）**:
- [ ] 准备一份 PDF 文件，运行提取命令，看到提取出的文本内容
- [ ] 确认：「PDF 文本提取结果符合预期」

---

### 1C: LLM 结构化处理 ✅ (2026-03-04)

#### 1C.1 LLM 调用集成
- [x] 安装依赖: langchain, langchain-openai, langchain-community (2026-03-04)
- [x] 支持 Ollama 本地 + OpenAI 远程切换（通过 LLM_PROVIDER 配置） (2026-03-04)

#### 1C.2 通用结构化处理器
- [x] 实现 `GenericProcessor`（提取概念/案例/引用/总结/主题标签） (2026-03-04)
- [x] JSON 输出 + markdown 代码块解析 (2026-03-04)
- [x] 5 个测试通过 (2026-03-04)

#### 1C.3 第一性原理专用处理器
- [x] 实现 `FirstPrinciplesProcessor`（含 methodology_steps） (2026-03-04)
- [x] 2 个测试通过 (2026-03-04)

#### 1C.4 LLM Structurer（主调度）
- [x] 实现 `LLMStructurer`（processor 注册 + category 路由 + fallback） (2026-03-04)
- [x] 3 个测试通过（含 mock LLM） (2026-03-04)

#### 1C.5 元数据增强器
- [x] 实现 `MetadataEnricher`（source_id 生成 + Skills 关联） (2026-03-04)
- [x] 2 个测试通过 (2026-03-04)

#### 1C.6 处理器基类
- [x] 实现 `BaseProcessor`（system_prompt + analysis_prompt + 文本截断 + parse） (2026-03-04)

**1C 交付物**:
- [x] 能调用 LLM 对原始文本进行结构化 (2026-03-04)
- [x] 输出符合 StructuredContent schema (2026-03-04)
- [x] 2 个 processor（generic + first_principles） (2026-03-04)
- [x] 元数据自动生成（source_id + Skills 关联） (2026-03-04)
- [x] 37 个测试全部通过 (2026-03-04)

---

### 1D: 分层存储 ✅ (2026-03-04)

#### 1D.1 文件存储
- [x] 实现 `kb/content_store.py` — ContentStore 类 (2026-03-04)
- [x] 功能: store_raw / store_structured / store_markdown / list / delete (2026-03-04)
- [x] 自动创建目录结构 (2026-03-04)

#### 1D.2 Markdown 文档生成
- [x] 实现 `kb/markdown_renderer.py` — MarkdownRenderer 类 (2026-03-04)
- [x] 完整模板（标题/元信息/总结/概念/方法论/案例/引用） (2026-03-04)

#### 1D.3 文本切片
- [x] 实现 `kb/chunking.py` — TextChunker 类 (2026-03-04)
- [x] 智能断句（在句号/换行处断开） (2026-03-04)

#### 1D.4 嵌入生成
- [x] 实现 `kb/embeddings.py` — EmbeddingGenerator 类 (2026-03-04)
- [x] 通过 LangChain Embeddings 接口（Ollama/OpenAI），无需本地 torch (2026-03-04)

#### 1D.5 向量化存储
- [x] 安装 `chromadb`（pinned onnxruntime<1.21 for macOS x86_64） (2026-03-04)
- [x] 实现 `kb/vector_store.py` — ChromaVectorStore 类 (2026-03-04)
- [x] 功能: add_chunks / search / delete_by_source / count (2026-03-04)

**1D 交付物**:
- [x] 能存储原始文件、结构化 JSON、Markdown (2026-03-04)
- [x] 能生成人类可读的 Markdown 文档 (2026-03-04)
- [x] 能将内容切片、向量化、存入 Chroma (2026-03-04)
- [x] 47 个测试全部通过 (2026-03-04)

---

### 1E: Pipeline 编排与 CLI ✅ (2026-03-04)

#### 1E.1 Pipeline 主流程
- [x] 实现 `content_pipeline/pipeline.py` — ContentPipeline 类 (2026-03-04)
- [x] 串联: Extract → Structure → Enrich → Store → Chunk → Embed → Vector (2026-03-04)
- [x] 进度回调机制（ProgressCallback） (2026-03-04)
- [x] 错误处理（失败返回 ProcessingResult with error） (2026-03-04)

#### 1E.2 CLI 工具
- [x] 实现 `apps/cli.py` process 命令（typer + rich） (2026-03-04)
- [x] 命令: `process --type <type> --category <cat> <source>` (2026-03-04)
- [x] Rich 进度显示（Spinner + 百分比） (2026-03-04)

#### 1E.3 端到端测试
- [x] 测试处理文本文件（mock LLM + embedder） (2026-03-04)
- [x] 测试处理 PDF（mock pdfplumber + LLM + embedder） (2026-03-04)
- [x] 测试错误处理（不支持类型 / 文件不存在） (2026-03-04)

**1E 交付物**:
- [x] 完整的 Content Processing Pipeline (2026-03-04)
- [x] CLI 工具可用 (2026-03-04)
- [x] 51 个测试全部通过 (2026-03-04)

**🔍 阶段 1 整体验收清单（用户操作）**:
- [ ] 运行 `cd agent-core && uv run python -m apps.cli health`，看到服务健康状态
- [ ] 运行 `uv run python -m apps.cli serve`，浏览器访问 http://localhost:8000/docs，看到 FastAPI Swagger 文档页面
- [ ] 准备一份测试用 PDF，运行 `uv run python -m apps.cli process --type pdf --category general <文件路径>`，看到 Rich 进度条和处理结果
- [ ] 检查 `data/` 目录下生成的文件：原始文件、结构化 JSON、Markdown 文档
- [ ] 确认：「内容处理管线能正常工作，我能看到结构化的输出」

---

## 阶段 2: Open WebUI 知识库管理 UI

> **目标**: 在 Open WebUI 中添加知识库管理界面
> **状态**: 🔴 未开始
> **前置**: 阶段 1 完成

### 2A: agent-core HTTP API

#### 2A.1 内容处理 API
- [ ] 实现 `POST /v1/content/process` — 接收文件/URL，创建异步处理任务
- [ ] 支持文件上传（UploadFile）和 URL 输入

#### 2A.2 异步任务系统
- [ ] 安装依赖: `celery`, `redis`
- [ ] 实现 `core/celery_app.py` — Celery 配置
- [ ] 实现 `process_content_task` Celery 任务
- [ ] 启动 Redis + Celery worker

#### 2A.3 进度查询 API
- [ ] 实现 `GET /v1/content/progress/{task_id}` — 返回 status/current_step/progress_percent

#### 2A.4 结果获取 API
- [ ] 实现 `GET /v1/content/result/{task_id}` — 返回处理结果

#### 2A.5 知识库管理 API
- [ ] 实现 `GET /v1/kb/sources` — 列出所有语料
- [ ] 实现 `GET /v1/kb/sources/{source_id}` — 获取详情
- [ ] 实现 `DELETE /v1/kb/sources/{source_id}` — 删除语料
- [ ] 实现 `PUT /v1/kb/sources/{source_id}/metadata` — 更新元数据

#### 2A.6 CORS 和鉴权
- [ ] 配置 CORS（允许 Open WebUI 前端调用）
- [ ] 实现 API Key 鉴权（可选）

#### 2A.7 API 测试
- [ ] 用 curl/Postman 测试所有接口
- [ ] 编写 pytest 测试用例

**2A 交付物**:
- [ ] FastAPI 提供完整的内容处理 + 知识库管理 HTTP API
- [ ] 异步处理 + 进度查询功能可用

**🔍 验收清单（用户操作）**:
- [ ] 启动 agent-core 服务，浏览器打开 http://localhost:8000/docs
- [ ] 在 Swagger 页面调用 `POST /v1/content/process`，上传一份 PDF，拿到 task_id
- [ ] 调用 `GET /v1/content/progress/{task_id}`，看到进度百分比在变化
- [ ] 调用 `GET /v1/content/result/{task_id}`，看到处理完成的结构化结果
- [ ] 调用 `GET /v1/kb/sources`，看到刚处理的语料出现在列表中
- [ ] 确认：「我能通过 HTTP API 上传、查进度、看结果、管理知识库」

---

### 2B: Open WebUI 前端集成

#### 2B.1 了解前端架构
- [ ] 阅读 Open WebUI 前端代码（SvelteKit + TailwindCSS）
- [ ] 了解路由机制、状态管理、API 调用方式

#### 2B.2 创建知识库管理页面
- [ ] 新增路由: `/admin/knowledge-base`
- [ ] 创建组件目录: `src/lib/components/admin/KnowledgeBase/`

#### 2B.3 上传区域组件
- [ ] 实现 `UploadArea.svelte` — 拖拽上传 + URL 输入 + 类别选择

#### 2B.4 处理队列组件
- [ ] 实现 `ProcessingQueue.svelte` — 当前处理中任务列表 + 实时进度条（2秒轮询）

#### 2B.5 语料列表组件
- [ ] 实现 `SourceList.svelte` — 表格展示 + 搜索 + 筛选 + 分页

#### 2B.6 详情预览组件
- [ ] 实现 `SourceDetail.svelte` — 结构化内容预览 + Markdown 查看 + 元数据编辑

#### 2B.7 API 调用封装
- [ ] 实现 `src/lib/apis/knowledge-base.ts` — uploadContent / getProgress / listSources 等

#### 2B.8 错误处理与提示
- [ ] 上传失败/处理失败提示
- [ ] 成功 Toast 提示

**2B 交付物**:
- [ ] Open WebUI 中有完整的知识库管理页面
- [ ] 能拖拽上传文件或输入 URL
- [ ] 实时显示处理进度
- [ ] 能查看和编辑已处理的语料

**🔍 阶段 2 整体验收清单（用户操作）**:
- [ ] 打开浏览器访问 http://localhost:3000，登录后在菜单中找到「知识库管理」入口
- [ ] 点击进入知识库管理页面，看到上传区域和语料列表
- [ ] 拖拽一份 PDF 到上传区域（或输入一个 URL），选择类别，点击处理
- [ ] 在页面上看到处理进度条实时更新（从 0% → 100%）
- [ ] 处理完成后，在语料列表中看到新条目，点击查看详情
- [ ] 在详情页看到结构化内容（概念、总结、引用等）和 Markdown 预览
- [ ] 确认：「我能在网页上管理知识库，上传→处理→查看 全流程通畅」

---

## 阶段 3: LangGraph Agent 系统

> **目标**: 实现 Skills 路由、RAG 检索、Agent 编排
> **状态**: 🔴 未开始
> **前置**: 阶段 1 + 2 完成

### 3A: Skills 体系

#### 3A.1 Skill 规范定义
- [ ] 设计 Skill 目录结构: `skills/{skill_name}/{manifest.yaml, prompt.md, schema.json, tests/}`
- [ ] 定义 `manifest.yaml` 规范（inputs/outputs/retrieval_policy/quality_checks）

#### 3A.2 第一个 Skill — first_principles_analysis
- [ ] 编写 `manifest.yaml`
- [ ] 编写 `prompt.md`（固定模板）
- [ ] 定义 `schema.json`（输出结构）
- [ ] 实现 `reference_loader.py`（加载 Skills Reference）
- [ ] 编写 2-3 个测试用例

#### 3A.3 第二个 Skill — generic_summary
- [ ] 编写 manifest + prompt + schema
- [ ] 通用总结能力（带引用）
- [ ] 测试用例

#### 3A.4 Skill Registry
- [ ] 实现 `agent/skill_registry.py` — `SkillRegistry` 类
- [ ] 功能: list_skills() / get_skill()（扫描 skills/ 目录）

#### 3A.5 Skill Executor
- [ ] 实现 `agent/executor.py` — `SkillExecutor` 类
- [ ] 流程: 加载定义 → 加载 Reference → 构建 prompt → 调用 LLM → 验证输出

#### 3A.6 更多 Skills（后续迭代）
- [ ] 博弈论分析 Skill（game_theory_analysis）
- [ ] 赛维人格分析 Skill（sawi_personality）
- [ ] 决策矩阵 Skill（decision_matrix）
- [ ] 思维模型 Skill（mental_models）
- [ ] 元学习 Skill（meta_learning）
- [ ] 批判性思维 Skill（critical_thinking）

**3A 交付物**:
- [ ] Skills 规范完整
- [ ] 至少 2 个 Skill 可用
- [ ] Skill Registry + Executor 能工作

---

### 3B: RAG 检索

#### 3B.1 Retriever
- [ ] 实现 `kb/retriever.py` — `KnowledgeRetriever` 类
- [ ] 功能: retrieve(query, category, top_k) → 向量相似度搜索 + 过滤

#### 3B.2 Citation 生成
- [ ] 实现 `agent/citation_generator.py` — `CitationGenerator` 类
- [ ] 功能: 从 RetrievalResult 生成 Citation（source_id, chunk_id, quote_hint）

#### 3B.3 检索效果测试
- [ ] 用真实问题测试检索准确性
- [ ] 调整 chunk_size、overlap、embedding 模型

#### 3B.4 混合检索（优化项）
- [ ] 实现向量 + 关键词混合检索
- [ ] 结果排序与去重

**3B 交付物**:
- [ ] Retriever 可用，能根据 query 检索相关内容
- [ ] 返回带 citations 的结果

---

### 3C: LangGraph 编排

#### 3C.1 学习 LangGraph
- [ ] 阅读 LangGraph 文档
- [ ] 跑通官方示例
- [ ] 理解 StateGraph / Node / Edge 概念

#### 3C.2 AgentState 定义
- [ ] 定义 `AgentState`（TypedDict）: thread_id, user_query, intent, skill_plan, retrieval_results, skill_outputs, final_output, citations

#### 3C.3 Agent Graph 构建
- [ ] 实现 `agent/graph.py` — `build_agent_graph()` 函数
- [ ] MVP 节点: Intake → Route → Retrieve → Execute → Finalize

#### 3C.4 各节点实现
- [ ] `intake_node` — 理解用户意图（LLM）
- [ ] `route_node` — 选择 Skill(s)
- [ ] `retrieve_node` — 检索知识库证据
- [ ] `execute_node` — 执行选中的 Skill(s)
- [ ] `finalize_node` — 汇总输出 Markdown + citations

#### 3C.5 高级节点（后续迭代）
- [ ] `askback_node` — 信息不足时追问用户
- [ ] `selfcheck_node` — 输出质量自检（引用完整性/结构合规）
- [ ] 条件边: should_askback(), should_retry()

#### 3C.6 Trace 落盘
- [ ] 实现 `agent/trace_store.py` — `TraceStore` 类
- [ ] 保存每次 Agent 运行的完整 state 到 jsonl/sqlite

**3C 交付物**:
- [ ] LangGraph Agent 可运行
- [ ] 能完成基础对话流程
- [ ] 输出包含 Markdown + citations

---

### 3D: 与 Open WebUI 聊天集成

#### 3D.1 OpenAI-compatible Chat API
- [ ] 实现 `POST /v1/chat/completions` — 接收 messages，调用 Agent，返回 OpenAI 格式响应
- [ ] 支持流式输出（SSE）

#### 3D.2 在 Open WebUI 中配置 agent-core
- [ ] Settings → Connections → 添加自定义模型 "Agent Core"
- [ ] Base URL: http://localhost:8000/v1

#### 3D.3 端到端对话测试
- [ ] 在 Open WebUI 选择 "Agent Core" 模型
- [ ] 发送: "用第一性原理分析如何提高工作效率"
- [ ] 检查回复包含分析内容 + 引用标注

#### 3D.4 Citations 前端展示
- [ ] 修改 Open WebUI 消息展示组件，显示引用列表
- [ ] 引用可点击跳转到知识库详情

**3D 交付物**:
- [ ] agent-core 实现 OpenAI-compatible API
- [ ] Open WebUI 能调用 agent-core 进行对话
- [ ] 聊天界面显示引用

**🔍 阶段 3 整体验收清单（用户操作）**:
- [ ] 打开 Open WebUI，在模型下拉列表中看到「Agent Core」选项
- [ ] 选择 Agent Core，发送：「用第一性原理分析如何提高工作效率」
- [ ] 看到 Agent 的回复包含：结构化分析内容 + 底部引用列表
- [ ] 点击引用链接，能跳转到知识库中对应的源内容
- [ ] 再发送一条通用问题（如「总结一下我知识库里关于XXX的内容」），验证 RAG 检索有效
- [ ] 确认：「AI 能基于我的知识库进行结构化分析，引用来源清晰可追溯」

---

## 阶段 4: 优化与部署

> **目标**: 性能优化、Docker 打包、服务器部署
> **状态**: 🔴 未开始
> **前置**: 阶段 3 完成

### 4A: 性能优化
- [ ] 视频转录优化（GPU 加速）
- [ ] 向量检索优化（批量查询、缓存）
- [ ] LLM 调用优化（缓存常见问题）
- [ ] 并发处理优化（限流、队列）

### 4B: Docker 打包
- [ ] 编写 `agent-core/Dockerfile`
- [ ] 编写 `docker-compose.yml`（open-webui + agent-core + redis + postgres）
- [ ] 测试一键启动: `docker-compose up -d`

### 4C: 服务器部署（可选）
- [ ] 选择云服务器（阿里云/腾讯云/AWS）
- [ ] 配置 GPU（如需）
- [ ] 部署 Docker Compose
- [ ] 配置域名和 HTTPS
- [ ] 监控与日志

**🔍 阶段 4 整体验收清单（用户操作）**:
- [ ] 运行 `docker-compose up -d`，一条命令启动所有服务
- [ ] 打开浏览器访问 http://localhost:3000，所有功能正常（聊天 + 知识库管理）
- [ ] （如部署到服务器）通过域名访问，HTTPS 正常
- [ ] 上传一个大 PDF 或长视频，处理速度在可接受范围内
- [ ] 确认：「系统可以一键部署，性能满意，可以日常使用」

---

## 进度看板

| 阶段 | 子阶段 | 状态 | 用户验收 | 完成日期 |
|------|--------|------|----------|----------|
| 0 | 环境准备 | 🟢 已完成 | ✅ 已验收 | 2026-03-05 |
| 1A | agent-core 基础框架 | 🟢 代码完成 | 🔲 待验收 | 2026-03-04 |
| 1B | 内容提取与转录 | 🟢 代码完成 | 🔲 待验收 | 2026-03-04 |
| 1C | LLM 结构化处理 | 🟢 代码完成 | 🔲 待验收 | 2026-03-04 |
| 1D | 分层存储 | 🟢 代码完成 | 🔲 待验收 | 2026-03-04 |
| 1E | Pipeline 编排与 CLI | 🟢 代码完成 | 🔲 待验收 | 2026-03-04 |
| 2A | agent-core HTTP API | 🔴 未开始 | — | — |
| 2B | Open WebUI 前端集成 | 🔴 未开始 | — | — |
| 3A | Skills 体系 | 🔴 未开始 | — | — |
| 3B | RAG 检索 | 🔴 未开始 | — | — |
| 3C | LangGraph 编排 | 🔴 未开始 | — | — |
| 3D | Open WebUI 聊天集成 | 🔴 未开始 | — | — |
| 4A | 性能优化 | 🔴 未开始 | — | — |
| 4B | Docker 打包 | 🔴 未开始 | — | — |
| 4C | 服务器部署 | 🔴 未开始 | — | — |

---

## 技术文档索引

| 文档 | 路径 | 说明 |
|------|------|------|
| 详细技术设计 | `doc/technical_design.md` | 所有模块的详细设计（代码架构） |
| 技术设计(Word) | `doc/technical_design.docx` | 同上，Word 格式 |
| 系统架构图 | `doc/diagrams/01_system_architecture.drawio` | 三层架构 |
| 内容处理流程图 | `doc/diagrams/02_content_pipeline_flow.drawio` | 6 步处理流程 |
| LangGraph 状态机 | `doc/diagrams/03_langgraph_state_machine.drawio` | Agent 状态流转 |
| API 时序图 | `doc/diagrams/04_api_sequence.drawio` | Chat + Content 时序 |
| 类图 | `doc/diagrams/05_class_diagrams.drawio` | 3 组类图 |
| 实施路线图 | `docs/implementation_roadmap.md` | 4 阶段实施计划 |
| 集成规格 | `docs/content_processing_integration_spec.md` | 内容处理集成规格 |
| 架构规格 | `docs/langgraph_langchain_openwebui_integration_spec.md` | 主架构规格 |
| 部署指南 | `docs/stage0_setup_guide.md` | 阶段 0 详细指南 |

---

> **使用说明**:
> 1. 每次开始工作前，阅读此文件了解当前进度
> 2. 开始一项任务时，将 `[ ]` 改为 `[~]`
> 3. 完成一项任务时，将 `[~]` 改为 `[x]`，末尾加日期如 `(2026-03-05)`
> 4. 跳过/取消时，将 `[ ]` 改为 `[-]`，说明原因
> 5. 每完成一个子阶段，更新底部"进度看板"
