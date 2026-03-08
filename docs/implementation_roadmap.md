# 实现路径 Roadmap - 分阶段渐进式开发

> **目标**: 构建 "个人知识库 + 方法论 Skills Agent" 系统
> **原则**: 分层开发、逐步验证、每个阶段都可独立运行
> **部署**: 本地优先，服务器兼容

---

## 0. 技术选型的部署兼容性说明

### 0.1 本地部署 vs 服务器部署

**所有技术选型都支持本地和服务器两种模式**，具体说明：

| 组件 | 本地部署 | 服务器部署 | 说明 |
|------|----------|------------|------|
| **Open WebUI** | ✅ Docker/pip | ✅ Docker/K8s | 官方支持，无差异 |
| **Ollama** | ✅ 本地安装 | ✅ Docker/独立服务器 | 本地跑小模型（7B/13B），服务器跑大模型（70B+） |
| **agent-core** | ✅ Python 虚拟环境 | ✅ Docker/Gunicorn | FastAPI 标准部署 |
| **Whisper** | ✅ faster-whisper（本地） | ✅ GPU 服务器加速 | 本地 CPU 可用，服务器 GPU 更快 |
| **Chroma** | ✅ 本地文件 | ✅ Docker/持久化卷 | 轻量级，适合 MVP |
| **pgvector** | ✅ PostgreSQL（本地） | ✅ PostgreSQL（云/自建） | 生产级，升级选项 |
| **Celery + Redis** | ✅ 本地进程 | ✅ Docker Compose | 异步任务队列 |

### 0.2 推荐的部署路径

```
本地开发阶段（现在）
  ↓
本地 MVP 运行（验证功能）
  ↓
Docker Compose 打包（一键部署）
  ↓
服务器部署（可选 GPU 加速）
```

**关键点**：
- ✅ 所有代码从一开始就按"可部署"的方式写（用配置文件，不硬编码路径）
- ✅ 用 Docker Compose 统一开发和生产环境
- ✅ 本地用轻量配置（CPU + Chroma），服务器用高性能配置（GPU + pgvector）

---

## 1. 总体 Roadmap（四大阶段）

```
阶段 0: 环境准备与 Open WebUI 部署
  ↓
阶段 1: Content Processing Pipeline（内容处理）
  ├─ 1A: agent-core 基础框架
  ├─ 1B: 内容提取与转录
  ├─ 1C: LLM 结构化
  └─ 1D: 分层存储
  ↓
阶段 2: Open WebUI 知识库管理 UI
  ├─ 2A: 后端 API 集成
  └─ 2B: 前端页面开发
  ↓
阶段 3: LangGraph Agent 系统
  ├─ 3A: Skills 体系
  ├─ 3B: RAG 检索
  ├─ 3C: LangGraph 编排
  └─ 3D: 与 Open WebUI 聊天集成
  ↓
阶段 4: 优化与部署
  ├─ 4A: 性能优化
  ├─ 4B: Docker 打包
  └─ 4C: 服务器部署
```

---

## 阶段 0: 环境准备与 Open WebUI 部署

**目标**: 跑起来原版 Open WebUI，熟悉架构，验证环境

### 任务清单

#### 0.1 本地环境准备
- [ ] 安装 Docker Desktop（macOS）
- [ ] 安装 Python 3.11+（用 pyenv 或 Homebrew）
- [ ] 安装 Node.js 18+（如果要改前端）
- [ ] 克隆 Open WebUI 仓库（或直接用现有的）

#### 0.2 部署原版 Open WebUI
- [ ] 使用 Docker 方式启动：
  ```bash
  docker run -d -p 3000:8080 \
    --add-host=host.docker.internal:host-gateway \
    -v open-webui:/app/backend/data \
    --name open-webui \
    --restart always \
    ghcr.io/open-webui/open-webui:main
  ```
- [ ] 访问 http://localhost:3000，注册账号
- [ ] 测试基本聊天功能

#### 0.3 （可选）安装 Ollama 并测试本地模型
- [ ] 安装 Ollama：`brew install ollama`
- [ ] 启动服务：`ollama serve`
- [ ] 下载测试模型：`ollama pull qwen2.5:7b`
- [ ] 在 Open WebUI 中连接 Ollama
- [ ] 测试对话是否正常

#### 0.4 熟悉 Open WebUI 架构
- [ ] 浏览 Open WebUI 代码结构（前端 Svelte + 后端 FastAPI）
- [ ] 了解配置文件位置（`.env`）
- [ ] 了解数据存储位置（`/app/backend/data`）
- [ ] 了解 Pipelines 机制（如果有）

### 交付物
- ✅ Open WebUI 运行在 http://localhost:3000
- ✅ 能进行基本对话（连接 Ollama 或远程 API）
- ✅ 熟悉代码结构和配置方式

### 时间估计
**1-2 天**（如果环境顺利，半天即可）

---

## 阶段 1: Content Processing Pipeline（内容处理层）

**目标**: 实现从原始语料（PDF/音频/视频）到结构化知识库的完整流程

**为什么先做这一层？**
- 这是整个系统的"数据基础"，后续 RAG 和 Skills 都依赖它
- 可以独立开发和测试（不依赖 Open WebUI 的改动）
- 完成后可以先用 CLI 验证效果，再接入 UI

### 1A: agent-core 基础框架（1 周）

#### 任务清单
- [ ] 初始化 `agent-core` 项目
  ```bash
  mkdir agent-core
  cd agent-core
  uv init  # 或 poetry init
  ```
- [ ] 设置项目结构：
  ```
  agent-core/
    README.md
    pyproject.toml
    .env.example
    apps/
      api.py          # FastAPI 主入口
      cli.py          # 命令行工具
    core/
      config.py       # 配置管理
      logging.py      # 日志
      models.py       # Pydantic 数据模型
    content_pipeline/
      __init__.py
      pipeline.py
      models.py       # Pipeline 专用模型
    tests/
      __init__.py
  ```
- [ ] 安装基础依赖：
  ```bash
  uv add fastapi uvicorn pydantic pydantic-settings
  uv add --dev pytest pytest-asyncio
  ```
- [ ] 实现基础配置系统（`config.py`）：
  - 读取环境变量
  - 支持 `.env` 文件
  - 定义配置类（LLM API Key、存储路径等）
- [ ] 实现简单的 FastAPI 框架：
  ```python
  # apps/api.py
  from fastapi import FastAPI

  app = FastAPI(title="Agent Core API")

  @app.get("/health")
  def health():
      return {"status": "ok"}
  ```
- [ ] 测试运行：
  ```bash
  uvicorn apps.api:app --reload
  # 访问 http://localhost:8000/docs
  ```

#### 交付物
- ✅ agent-core 项目结构完整
- ✅ FastAPI 能启动并访问 `/health`
- ✅ 配置系统可用

#### 时间估计
**2-3 天**

---

### 1B: 内容提取与转录（1.5 周）

#### 任务清单

##### 1B.1 实现 PDF 提取器
- [ ] 安装依赖：`uv add pdfplumber`
- [ ] 实现 `extractors/pdf.py`：
  ```python
  class PDFExtractor:
      def extract(self, pdf_path: str) -> ExtractedContent:
          # 使用 pdfplumber 提取文本
          # 提取元数据（页数、标题、作者）
          # 返回 ExtractedContent 对象
  ```
- [ ] 测试：用一个真实 PDF 测试提取效果

##### 1B.2 实现视频下载器
- [ ] 安装依赖：`uv add yt-dlp`
- [ ] 实现 `downloader/video_downloader.py`：
  ```python
  class VideoDownloader:
      def download(self, url: str, audio_only: bool = True) -> DownloadResult:
          # 调用 yt-dlp 下载
          # 提取元数据（标题、作者、时长）
          # 返回文件路径和元数据
  ```
- [ ] 测试：下载一个 YouTube 视频（只音频）

##### 1B.3 实现音频转录器
- [ ] 安装依赖：`uv add faster-whisper`
- [ ] 实现 `transcriber/whisper_transcriber.py`：
  ```python
  class WhisperTranscriber:
      def transcribe(self, audio_path: str, language: str = "zh") -> TranscriptResult:
          # 加载 Whisper 模型（small/medium）
          # 转录音频
          # 返回文本 + segments（带时间戳）
  ```
- [ ] 测试：转录一段中文音频，检查准确率

##### 1B.4 实现视频提取器（组合）
- [ ] 实现 `extractors/video.py`：
  ```python
  class VideoExtractor:
      def __init__(self):
          self.downloader = VideoDownloader()
          self.transcriber = WhisperTranscriber()

      def extract(self, url: str) -> ExtractedContent:
          # 1. 下载视频（audio_only）
          # 2. 转录音频
          # 3. 返回 ExtractedContent
  ```

##### 1B.5 实现文本提取器（简单）
- [ ] 实现 `extractors/text.py`：直接读取 .txt/.md 文件

##### 1B.6 实现音频提取器
- [ ] 实现 `extractors/audio.py`：直接调用 Transcriber

#### 交付物
- ✅ 能从 PDF 提取文本
- ✅ 能下载 YouTube 视频并转录
- ✅ 能转录本地音频文件
- ✅ 所有提取器都返回统一的 `ExtractedContent` 格式

#### 时间估计
**4-5 天**

---

### 1C: LLM 结构化处理（1.5 周）

#### 任务清单

##### 1C.1 集成 LLM 调用
- [ ] 安装依赖：`uv add langchain langchain-openai`
- [ ] 实现 LLM 配置（支持 Ollama 本地 + OpenAI 远程）
- [ ] 测试 LLM 调用是否正常

##### 1C.2 实现通用结构化处理器
- [ ] 实现 `structurer/processors/generic.py`：
  ```python
  class GenericProcessor:
      ANALYSIS_PROMPT = """
      分析以下内容，提取：
      1. 核心概念（3-5个）
      2. 典型案例（1-3个）
      3. 关键引用（3-5条）
      4. 总结（200字）

      以 JSON 格式输出...
      """

      def process(self, text: str, metadata: dict) -> StructuredContent:
          # 调用 LLM
          # 解析 JSON
          # 验证 schema
          # 返回 StructuredContent
  ```
- [ ] 测试：用一段文本测试结构化效果

##### 1C.3 实现第一性原理专用处理器
- [ ] 实现 `structurer/processors/first_principles.py`：
  ```python
  class FirstPrinciplesProcessor:
      ANALYSIS_PROMPT = """
      你是第一性原理思维方法论专家。
      请提取：
      1. 核心概念
      2. 方法论步骤（四步法等）
      3. 典型案例
      4. 关键引用
      ...
      """
  ```
- [ ] 测试：用一本第一性原理相关的书测试

##### 1C.4 实现 LLM Structurer（主调度）
- [ ] 实现 `structurer/llm_structurer.py`：
  ```python
  class LLMStructurer:
      def __init__(self):
          self.processors = {
              "generic": GenericProcessor(),
              "first_principles": FirstPrinciplesProcessor(),
              # 后续添加其他 processor
          }

      def structure(self, text: str, category: str, metadata: dict) -> StructuredContent:
          processor = self.processors.get(category, self.processors["generic"])
          return processor.process(text, metadata)
  ```

##### 1C.5 实现元数据增强器
- [ ] 实现 `enricher/metadata_enricher.py`：
  ```python
  class MetadataEnricher:
      def enrich(self, structured: StructuredContent, source_meta: dict) -> EnrichedMetadata:
          # 生成 source_id（唯一标识）
          # 提取主题标签
          # 关联 Skills
          # 标注可信度
          # 返回 EnrichedMetadata
  ```

#### 交付物
- ✅ 能调用 LLM 对原始文本进行结构化
- ✅ 输出符合 `StructuredContent` schema
- ✅ 至少有 2 个 processor（generic + first_principles）
- ✅ 元数据自动生成

#### 时间估计
**4-5 天**

---

### 1D: 分层存储（1 周）

#### 任务清单

##### 1D.1 实现文件存储
- [ ] 创建存储目录结构：
  ```
  kb_storage/
    raw/
      pdf/
      audio/
      video/
      transcripts/
    structured/
    references/
    vector/
  ```
- [ ] 实现 `storage/content_store.py`：
  ```python
  class ContentStore:
      def store_raw(self, source_id: str, content: bytes, source_type: str):
          # 存储原始文件到 raw/

      def store_structured(self, source_id: str, structured: StructuredContent):
          # 存储 JSON 到 structured/

      def generate_markdown(self, source_id: str, structured: StructuredContent, metadata: EnrichedMetadata) -> str:
          # 生成 Markdown 文档
          # 存储到 references/
  ```

##### 1D.2 实现 Markdown 生成
- [ ] 设计 Markdown 模板：
  ```markdown
  # {title}

  **来源类型**: {source_type}
  **作者**: {author}
  **主题**: {topics}

  ## 核心概念
  ### 1. {concept_name}
  {definition}

  ## 方法论
  ### {methodology_name}
  1. {step_1}
  2. {step_2}

  ## 典型案例
  ### {example_title}
  {example_content}

  ## 关键引用
  - "{quote}" [{source_chunk_id}]
  ```
- [ ] 实现模板渲染逻辑

##### 1D.3 实现向量化存储
- [ ] 安装依赖：`uv add chromadb sentence-transformers`
- [ ] 实现 `kb/vector_store.py`：
  ```python
  class ChromaVectorStore:
      def __init__(self, persist_dir: str = "./kb_storage/vector/chroma"):
          self.client = chromadb.PersistentClient(path=persist_dir)
          self.collection = self.client.get_or_create_collection("knowledge_base")

      def add_chunks(self, chunks: list[Chunk], embeddings: list[list[float]], metadata: list[dict]):
          # 添加向量到 Chroma
  ```

##### 1D.4 实现文本切片
- [ ] 实现 `kb/chunking.py`：
  ```python
  class TextChunker:
      def chunk(self, text: str, chunk_size: int = 500, overlap: int = 50) -> list[Chunk]:
          # 切片文本
          # 保留上下文（overlap）
          # 生成 chunk_id
  ```

##### 1D.5 实现嵌入生成
- [ ] 实现 `kb/embeddings.py`：
  ```python
  class EmbeddingGenerator:
      def __init__(self, model_name: str = "BAAI/bge-small-zh-v1.5"):
          # 加载嵌入模型

      def embed(self, texts: list[str]) -> list[list[float]]:
          # 批量生成嵌入
  ```

#### 交付物
- ✅ 能存储原始文件、结构化 JSON、Markdown
- ✅ 能生成人类可读的 Markdown 文档
- ✅ 能将内容切片、向量化、存入 Chroma
- ✅ 存储结构清晰、易于管理

#### 时间估计
**3-4 天**

---

### 1E: Pipeline 编排与 CLI（1 周）

#### 任务清单

##### 1E.1 实现 Pipeline 主流程
- [ ] 实现 `content_pipeline/pipeline.py`：
  ```python
  class ContentPipeline:
      def __init__(self):
          self.extractors = {...}
          self.structurer = LLMStructurer()
          self.enricher = MetadataEnricher()
          self.chunker = TextChunker()
          self.embedder = EmbeddingGenerator()
          self.storage = ContentStore()

      def process(self, source: str, source_type: str, category: str) -> ProcessingResult:
          # 1. Extract
          extracted = self._extract(source, source_type)

          # 2. Structure
          structured = self.structurer.structure(extracted.text, category, extracted.metadata)

          # 3. Enrich
          metadata = self.enricher.enrich(structured, extracted.metadata)

          # 4. Chunk + Embed
          chunks = self.chunker.chunk(extracted.text)
          embeddings = self.embedder.embed([c.text for c in chunks])

          # 5. Store
          source_id = self.storage.store(
              raw=extracted.raw_content,
              structured=structured,
              chunks=chunks,
              embeddings=embeddings,
              metadata=metadata
          )

          return ProcessingResult(source_id=source_id, ...)
  ```

##### 1E.2 实现 CLI 工具
- [ ] 实现 `apps/cli.py`：
  ```bash
  python -m agent_core.cli process \
    --source "test.pdf" \
    --type pdf \
    --category first_principles

  python -m agent_core.cli process \
    --source "https://youtube.com/watch?v=xxx" \
    --type video \
    --category generic
  ```
- [ ] 添加进度显示（rich 库）
- [ ] 添加错误处理

##### 1E.3 端到端测试
- [ ] 测试处理一个 PDF 书籍
- [ ] 测试处理一个 YouTube 视频
- [ ] 测试处理一个音频文件
- [ ] 检查输出：
  - 原始文件是否保存
  - JSON 是否符合 schema
  - Markdown 是否可读
  - 向量是否存入 Chroma

#### 交付物
- ✅ 完整的 Content Processing Pipeline
- ✅ CLI 工具可用（process 命令）
- ✅ 能成功处理 3 种格式（PDF/视频/音频）
- ✅ 输出完整（raw/JSON/Markdown/vector）

#### 时间估计
**3-4 天**

---

### 阶段 1 总结

**总时间**: 4-5 周

**交付物**:
- ✅ agent-core 项目完整可运行
- ✅ Content Processing Pipeline 完整
- ✅ CLI 工具可独立使用
- ✅ 能处理 PDF/Text/音频/视频 四种格式
- ✅ 输出双格式（JSON + Markdown）
- ✅ 向量索引可用（Chroma）

**验收标准**:
```bash
# 处理一本第一性原理的书
python -m agent_core.cli process \
  --source "first_principles.pdf" \
  --type pdf \
  --category first_principles

# 检查输出
ls kb_storage/raw/pdf/src_xxx.pdf
ls kb_storage/structured/src_xxx.json
ls kb_storage/references/first_principles/src_xxx.md
```

**阶段 1 完成后的状态**:
- ✅ 已经有一个完整可用的内容处理系统
- ✅ 可以用 CLI 测试和验证
- ✅ 为下一阶段（UI 集成）做好准备

---

## 阶段 2: Open WebUI 知识库管理 UI

**目标**: 在 Open WebUI 中添加知识库管理界面，提供可视化的上传、处理、查看功能

**为什么现在做 UI？**
- 阶段 1 已经有完整的后端能力（CLI 可用）
- 现在需要提供用户友好的界面
- 完成后整个知识库管理模块可独立使用（无需 Agent）

### 2A: agent-core HTTP API（1.5 周）

#### 任务清单

##### 2A.1 实现内容处理 API
- [ ] 实现 `POST /v1/content/process`：
  ```python
  @app.post("/v1/content/process")
  async def process_content(
      file: UploadFile = None,
      url: str = None,
      source_type: SourceType,
      category: ContentCategory,
      user_id: str = None
  ) -> ProcessTaskResponse:
      # 创建异步任务
      task_id = create_task(...)
      # 返回 task_id
  ```

##### 2A.2 实现异步任务系统
- [ ] 安装依赖：`uv add celery redis`
- [ ] 配置 Celery：
  ```python
  # core/celery_app.py
  from celery import Celery

  celery_app = Celery('agent_core', broker='redis://localhost:6379/0')

  @celery_app.task
  def process_content_task(source, source_type, category):
      pipeline = ContentPipeline()
      result = pipeline.process(source, source_type, category)
      return result
  ```
- [ ] 启动 Redis：`docker run -d -p 6379:6379 redis`
- [ ] 启动 Celery worker：`celery -A core.celery_app worker --loglevel=info`

##### 2A.3 实现进度查询 API
- [ ] 实现 `GET /v1/content/progress/{task_id}`：
  ```python
  @app.get("/v1/content/progress/{task_id}")
  async def get_progress(task_id: str) -> ProcessingProgress:
      # 查询任务状态
      # 返回进度（status/current_step/progress_percent）
  ```

##### 2A.4 实现结果获取 API
- [ ] 实现 `GET /v1/content/result/{task_id}`：
  ```python
  @app.get("/v1/content/result/{task_id}")
  async def get_result(task_id: str) -> ProcessingResult:
      # 获取处理结果
  ```

##### 2A.5 实现知识库管理 API
- [ ] 实现 `GET /v1/kb/sources`（列出所有语料）
- [ ] 实现 `GET /v1/kb/sources/{source_id}`（获取详情）
- [ ] 实现 `DELETE /v1/kb/sources/{source_id}`（删除语料）
- [ ] 实现 `PUT /v1/kb/sources/{source_id}/metadata`（更新元数据）

##### 2A.6 实现 CORS 和鉴权
- [ ] 配置 CORS（允许 Open WebUI 调用）
- [ ] 实现简单的 API Key 鉴权（可选）

##### 2A.7 API 测试
- [ ] 用 Postman/curl 测试所有接口
- [ ] 写 pytest 测试用例

#### 交付物
- ✅ FastAPI 提供完整的 HTTP API
- ✅ 支持文件上传和 URL 输入
- ✅ 异步处理 + 进度查询
- ✅ 知识库管理功能完整

#### 时间估计
**5-6 天**

---

### 2B: Open WebUI 前端集成（2-3 周）

#### 任务清单

##### 2B.1 了解 Open WebUI 前端架构
- [ ] 阅读 Open WebUI 前端代码（Svelte）
- [ ] 了解路由机制（SvelteKit）
- [ ] 了解状态管理
- [ ] 了解 API 调用方式

##### 2B.2 创建知识库管理页面
- [ ] 在 Open WebUI 中新增路由：`/admin/knowledge-base`
- [ ] 创建页面组件：
  ```
  open-webui/src/lib/components/admin/KnowledgeBase/
    KnowledgeBaseManager.svelte    # 主页面
    UploadArea.svelte              # 上传区域
    ProcessingQueue.svelte         # 处理队列
    SourceList.svelte              # 语料列表
    SourceDetail.svelte            # 详情预览
  ```

##### 2B.3 实现上传区域
- [ ] 拖拽上传组件（文件）
- [ ] URL 输入框（视频）
- [ ] 类别选择下拉框：
  - 第一性原理
  - 博弈论
  - 赛维人格
  - 通用内容
- [ ] 上传按钮 + 校验

##### 2B.4 实现处理队列
- [ ] 显示当前处理中的任务
- [ ] 实时进度条：
  ```svelte
  <div class="progress-bar">
    <div class="progress" style="width: {progress_percent}%"></div>
  </div>
  <p>{current_step}</p>
  ```
- [ ] 轮询更新进度（每 2 秒）

##### 2B.5 实现语料列表
- [ ] 表格展示：
  | 标题 | 类型 | 来源 | 主题 | 关联技能 | 时间 | 操作 |
  |------|------|------|------|----------|------|------|
- [ ] 搜索框（全文搜索）
- [ ] 筛选器（按类型/主题/技能）
- [ ] 分页

##### 2B.6 实现详情预览
- [ ] 点击"查看"弹出侧边栏或 Modal
- [ ] 左侧：结构化内容预览
  - 核心概念（可展开/折叠）
  - 方法论步骤
  - 典型案例
  - 关键引用
- [ ] 右侧：Markdown 文档（可编辑）
- [ ] 底部：元数据（可编辑）
- [ ] 保存按钮（调用 PUT API）

##### 2B.7 实现 API 调用
- [ ] 封装 API 调用函数：
  ```typescript
  // src/lib/apis/knowledge-base.ts
  export async function uploadContent(file: File, category: string) {
    // POST /v1/content/process
  }

  export async function getProgress(taskId: string) {
    // GET /v1/content/progress/{task_id}
  }

  export async function listSources() {
    // GET /v1/kb/sources
  }
  ```

##### 2B.8 错误处理与提示
- [ ] 上传失败提示
- [ ] 处理失败提示（显示错误原因）
- [ ] 成功提示（Toast）

##### 2B.9 响应式设计
- [ ] 桌面端布局
- [ ] 移动端适配（可选）

#### 交付物
- ✅ Open WebUI 中有完整的知识库管理页面
- ✅ 能拖拽上传文件或输入 URL
- ✅ 实时显示处理进度
- ✅ 能查看所有已处理的语料
- ✅ 能预览和编辑详情

#### 时间估计
**8-10 天**

---

### 阶段 2 总结

**总时间**: 3-4 周

**交付物**:
- ✅ agent-core 提供完整的 HTTP API
- ✅ Open WebUI 有知识库管理页面
- ✅ 用户能通过 UI 上传和管理语料
- ✅ 整个知识库模块可独立使用

**验收标准**:
1. 打开 http://localhost:3000/admin/knowledge-base
2. 拖拽一个 PDF 文件上传
3. 选择"第一性原理"类别
4. 点击上传
5. 实时看到进度：下载 → 提取 → 分析 → 存储
6. 完成后在列表中看到新语料
7. 点击"查看"，能看到结构化内容和 Markdown

**阶段 2 完成后的状态**:
- ✅ 完整的知识库管理系统（可独立使用）
- ✅ 用户友好的 UI 界面
- ✅ 为下一阶段（Agent 系统）提供知识库支持

---

## 阶段 3: LangGraph Agent 系统

**目标**: 实现基于 LangGraph 的 Agent 编排，支持 Skills 路由、RAG 检索、自检等功能

**为什么现在做 Agent？**
- 前两个阶段已经有了知识库（存储 + UI）
- 现在需要让 Agent 能"使用"这些知识库
- 实现智能对话（自动选择 Skills、检索证据、提供引用）

### 3A: Skills 体系（2 周）

#### 任务清单

##### 3A.1 定义 Skill 规范
- [ ] 设计 Skill 目录结构：
  ```
  agent-core/skills/
    first_principles_analysis/
      manifest.yaml
      prompt.md
      schema.json
      reference_loader.py
      tests/
        test_cases.json
    generic_summary/
      manifest.yaml
      ...
  ```

##### 3A.2 实现 manifest.yaml 规范
```yaml
skill_id: first_principles_analysis
version: "1.0.0"
purpose: "用第一性原理分析问题"
inputs:
  - name: problem
    type: string
    required: true
    description: "需要分析的问题"
outputs:
  - name: analysis
    type: object
    schema_ref: schema.json
retrieval_policy:
  enabled: true
  category: first_principles
  top_k: 5
quality_checks:
  - check_citations: true
  - check_structure: true
```

##### 3A.3 实现第一个 Skill（first_principles_analysis）
- [ ] 编写 `prompt.md`（固定模板）
- [ ] 定义 `schema.json`（输出结构）
- [ ] 实现 `reference_loader.py`（加载 Skills Reference）
- [ ] 写 2-3 个测试用例

##### 3A.4 实现第二个 Skill（generic_summary）
- [ ] 通用总结能力（带引用）
- [ ] 测试用例

##### 3A.5 实现 Skill Executor
- [ ] 实现 `agent/executor.py`：
  ```python
  class SkillExecutor:
      def execute(self, skill_id: str, inputs: dict, context: dict) -> SkillOutput:
          # 1. 加载 Skill 定义（manifest + prompt + schema）
          # 2. 加载 Skills Reference（如果有）
          # 3. 构建 prompt
          # 4. 调用 LLM
          # 5. 验证输出（schema 校验）
          # 6. 返回 SkillOutput
  ```

##### 3A.6 实现 Skill Registry
- [ ] 实现 `agent/skill_registry.py`：
  ```python
  class SkillRegistry:
      def list_skills(self) -> list[SkillManifest]:
          # 扫描 skills/ 目录
          # 返回所有可用 Skills

      def get_skill(self, skill_id: str) -> SkillManifest:
          # 获取单个 Skill 定义
  ```

#### 交付物
- ✅ Skills 规范完整
- ✅ 至少 2 个 Skill 可用（first_principles + summary）
- ✅ Skill Executor 能执行 Skills
- ✅ 每个 Skill 有测试用例

#### 时间估计
**6-7 天**

---

### 3B: RAG 检索（1.5 周）

#### 任务清单

##### 3B.1 实现 Retriever
- [ ] 实现 `kb/retriever.py`：
  ```python
  class KnowledgeRetriever:
      def __init__(self, vector_store: ChromaVectorStore):
          self.vector_store = vector_store

      def retrieve(
          self,
          query: str,
          category: str = None,
          top_k: int = 5
      ) -> list[RetrievalResult]:
          # 1. 生成 query embedding
          # 2. 向量相似度搜索
          # 3. 按 category 过滤（如果指定）
          # 4. 返回 top_k 结果（带 metadata 和 chunk_id）
  ```

##### 3B.2 实现 Citation 生成
- [ ] 实现 `agent/citation_generator.py`：
  ```python
  class CitationGenerator:
      def generate(self, retrieval_results: list[RetrievalResult]) -> list[Citation]:
          # 从 RetrievalResult 生成 Citation
          # 包含：source_id、chunk_id、quote_hint
  ```

##### 3B.3 测试 RAG 效果
- [ ] 用真实问题测试检索：
  ```python
  query = "什么是第一性原理？"
  results = retriever.retrieve(query, category="first_principles", top_k=3)
  # 检查返回的 chunk 是否相关
  ```

##### 3B.4 优化检索质量
- [ ] 调整 chunk_size 和 overlap
- [ ] 尝试不同的 embedding 模型
- [ ] 实现混合检索（向量 + 关键词）

#### 交付物
- ✅ Retriever 可用
- ✅ 能根据 query 检索相关内容
- ✅ 返回带 citations 的结果
- ✅ 检索质量可接受（人工评估）

#### 时间估计
**4-5 天**

---

### 3C: LangGraph 编排（2 周）

#### 任务清单

##### 3C.1 学习 LangGraph
- [ ] 阅读 LangGraph 文档
- [ ] 跑通官方示例
- [ ] 理解 StateGraph、Node、Edge 概念

##### 3C.2 设计 Agent Graph
```python
# agent/graph.py
from langgraph.graph import StateGraph

class AgentState(TypedDict):
    thread_id: str
    request_id: str
    user_query: str
    intent: str
    skill_plan: list[str]
    retrieval_results: list[RetrievalResult]
    skill_outputs: list[SkillOutput]
    final_output: str
    citations: list[Citation]

def build_agent_graph():
    graph = StateGraph(AgentState)

    # 添加节点
    graph.add_node("intake", intake_node)
    graph.add_node("route", route_node)
    graph.add_node("retrieve", retrieve_node)
    graph.add_node("execute", execute_node)
    graph.add_node("finalize", finalize_node)

    # 添加边
    graph.add_edge("intake", "route")
    graph.add_edge("route", "retrieve")
    graph.add_edge("retrieve", "execute")
    graph.add_edge("execute", "finalize")

    graph.set_entry_point("intake")
    graph.set_finish_point("finalize")

    return graph.compile()
```

##### 3C.3 实现各个节点

**Intake Node（理解意图）**：
```python
def intake_node(state: AgentState) -> AgentState:
    # 使用 LLM 理解用户问题
    # 生成 intent 草案
    state["intent"] = ...
    return state
```

**Route Node（选择 Skills）**：
```python
def route_node(state: AgentState) -> AgentState:
    # 根据 intent 选择合适的 Skill(s)
    state["skill_plan"] = ["first_principles_analysis"]
    return state
```

**Retrieve Node（检索证据）**：
```python
def retrieve_node(state: AgentState) -> AgentState:
    # 根据 query 和 skill_plan 检索
    results = retriever.retrieve(state["user_query"], ...)
    state["retrieval_results"] = results
    return state
```

**Execute Node（执行 Skills）**：
```python
def execute_node(state: AgentState) -> AgentState:
    outputs = []
    for skill_id in state["skill_plan"]:
        output = executor.execute(skill_id, {...}, state)
        outputs.append(output)
    state["skill_outputs"] = outputs
    return state
```

**Finalize Node（汇总输出）**：
```python
def finalize_node(state: AgentState) -> AgentState:
    # 汇总 skill_outputs
    # 生成 Markdown 输出
    # 附加 citations
    state["final_output"] = ...
    state["citations"] = ...
    return state
```

##### 3C.4 实现简化版 Agent（MVP）
- [ ] 先不做 AskBack 和 SelfCheck
- [ ] 只实现基础流程：Intake → Route → Retrieve → Execute → Finalize
- [ ] 测试完整流程

##### 3C.5 添加 Trace 落盘
- [ ] 实现 `agent/trace_store.py`：
  ```python
  class TraceStore:
      def save_trace(self, state: AgentState, output: dict):
          # 保存到 jsonl 或 sqlite
  ```

#### 交付物
- ✅ LangGraph Agent 可运行
- ✅ 能完成基础对话流程
- ✅ 输出包含 Markdown + citations
- ✅ Trace 可记录

#### 时间估计
**6-7 天**

---

### 3D: 与 Open WebUI 聊天集成（1.5 周）

#### 任务清单

##### 3D.1 实现 OpenAI-compatible Chat API
- [ ] 实现 `POST /v1/chat/completions`：
  ```python
  @app.post("/v1/chat/completions")
  async def chat_completions(request: ChatCompletionRequest) -> ChatCompletionResponse:
      # 1. 提取 messages
      # 2. 调用 LangGraph Agent
      # 3. 格式化为 OpenAI 响应格式
      # 4. 附加 citations 到 metadata
  ```

##### 3D.2 在 Open WebUI 中配置 agent-core
- [ ] 在 Open WebUI 设置中添加自定义模型：
  - Name: "Agent Core"
  - Base URL: http://localhost:8000/v1
  - API Key: (如果有)

##### 3D.3 测试对话
- [ ] 在 Open WebUI 聊天界面选择"Agent Core"模型
- [ ] 发送问题："用第一性原理分析一下如何降低成本"
- [ ] 检查回复是否包含：
  - 分析内容
  - 引用标注

##### 3D.4 实现 Citations 展示
- [ ] 在 Open WebUI 前端修改消息展示组件
- [ ] 显示引用列表：
  ```svelte
  {#if message.citations}
    <div class="citations">
      <h4>📚 依据：</h4>
      {#each message.citations as citation}
        <div class="citation" on:click={() => showSource(citation.source_id)}>
          [{citation.source_id}#{citation.chunk_id}] {citation.quote_hint}
        </div>
      {/each}
    </div>
  {/if}
  ```

##### 3D.5 实现引用跳转
- [ ] 点击引用后跳转到知识库管理页面
- [ ] 高亮显示对应的 chunk

#### 交付物
- ✅ agent-core 实现 OpenAI-compatible API
- ✅ Open WebUI 能调用 agent-core
- ✅ 聊天界面显示引用
- ✅ 引用可点击跳转

#### 时间估计
**5-6 天**

---

### 阶段 3 总结

**总时间**: 5-6 周

**交付物**:
- ✅ 完整的 LangGraph Agent 系统
- ✅ 至少 2 个可用 Skills
- ✅ RAG 检索能力
- ✅ 与 Open WebUI 聊天集成
- ✅ 输出包含 Markdown + citations

**验收标准**:
1. 打开 Open WebUI 聊天界面
2. 选择"Agent Core"模型
3. 发送："用第一性原理分析如何提高工作效率"
4. Agent 回复：
   - 第一性原理四步法分析
   - 具体建议
   - 引用来源（如 [fp_book_01#c12]）
5. 点击引用，跳转到知识库详情

**阶段 3 完成后的状态**:
- ✅ 完整的 Agent 对话系统
- ✅ 知识库与 Agent 深度整合
- ✅ 用户能获得有据可查的建议

---

## 阶段 4: 优化与部署

**目标**: 性能优化、Docker 打包、服务器部署

### 4A: 性能优化（1 周）

#### 任务清单
- [ ] 视频转录优化（使用 GPU）
- [ ] 向量检索优化（批量查询、缓存）
- [ ] LLM 调用优化（缓存常见问题）
- [ ] 并发处理优化（限流、队列）

### 4B: Docker 打包（1 周）

#### 任务清单
- [ ] 编写 `agent-core/Dockerfile`
- [ ] 编写 `docker-compose.yml`：
  ```yaml
  version: '3.8'
  services:
    open-webui:
      image: ghcr.io/open-webui/open-webui:main
      ports:
        - "3000:8080"
      volumes:
        - open-webui-data:/app/backend/data

    agent-core:
      build: ./agent-core
      ports:
        - "8000:8000"
      volumes:
        - kb-storage:/app/kb_storage
      environment:
        - OPENAI_API_KEY=${OPENAI_API_KEY}

    redis:
      image: redis:7-alpine
      ports:
        - "6379:6379"

    postgres:
      image: pgvector/pgvector:pg16
      volumes:
        - postgres-data:/var/lib/postgresql/data
  ```
- [ ] 测试一键启动：`docker-compose up -d`

### 4C: 服务器部署（可选）

#### 任务清单
- [ ] 选择云服务器（阿里云/腾讯云/AWS）
- [ ] 配置 GPU（如果需要）
- [ ] 部署 Docker Compose
- [ ] 配置域名和 HTTPS
- [ ] 监控与日志

---

## 总体时间估算

| 阶段 | 时间 | 累计 |
|------|------|------|
| 阶段 0: 环境准备 | 1-2 天 | 2 天 |
| 阶段 1: Content Pipeline | 4-5 周 | 5.3 周 |
| 阶段 2: UI 集成 | 3-4 周 | 9.3 周 |
| 阶段 3: Agent 系统 | 5-6 周 | 15.3 周 |
| 阶段 4: 优化部署 | 2 周 | 17.3 周 |

**总计**: **约 17-18 周**（4-4.5 个月）

**如果只做 MVP（去掉部分优化）**: **约 12-14 周**（3-3.5 个月）

---

## 里程碑与验收点

### 里程碑 1: Content Pipeline 可用（第 5 周）
- ✅ CLI 能处理 PDF/视频/音频
- ✅ 输出 JSON + Markdown
- ✅ 向量索引可用

### 里程碑 2: 知识库管理 UI 可用（第 9 周）
- ✅ 能在 UI 上传和管理语料
- ✅ 实时看到处理进度
- ✅ 查看结构化结果

### 里程碑 3: Agent 对话可用（第 15 周）
- ✅ 能在 Open WebUI 聊天
- ✅ Agent 自动选择 Skills
- ✅ 回复包含引用

### 里程碑 4: 生产部署（第 17 周）
- ✅ Docker 一键部署
- ✅ 服务器运行稳定

---

## 风险与应对

| 风险 | 影响 | 应对 |
|------|------|------|
| LLM 结构化能力不足 | 输出质量差 | 用 GPT-4/Claude，优化 prompt |
| Whisper 转录不准 | 知识库质量差 | 用远程 API（Deepgram），或人工校对 |
| Open WebUI 升级导致代码冲突 | UI 集成失败 | 最小化改动，或做独立前端 |
| LangGraph 学习曲线陡峭 | 开发周期延长 | 先做简化版，后续迭代 |
| 服务器成本 | 预算超支 | 优先本地，按需升级服务器 |

---

## 下一步行动

**建议**: 从阶段 0 开始，逐步推进

1. **现在（今天）**: 部署原版 Open WebUI，跑通基本对话
2. **本周**: 完成阶段 1A（agent-core 基础框架）
3. **下周**: 开始阶段 1B（内容提取与转录）
4. **持续**: 每完成一个子阶段，验证效果，调整计划

---

> **文档版本**: v1.0
> **创建时间**: 2025-01-15
> **维护者**: Agent-Core Team
> **相关文档**:
> - `langgraph_langchain_openwebui_integration_spec.md`
> - `content_processing_integration_spec.md`
