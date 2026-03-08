# Content Processing Pipeline 集成方案
> **目标**：在 LangGraph/LangChain + Open WebUI 架构基础上，增加智能内容处理能力
> **核心**：用户上传原始语料（PDF/音频/视频），系统自动处理并生成结构化知识库和 Skills Reference
> **集成**：与 Open WebUI 深度融合，提供可视化的上传、处理、结果展示 UI

---

## 1. 需求背景

### 1.1 现有方案的缺口

原 PRD（`langgraph_langchain_openwebui_integration_spec.md`）中的 KB ingestion 只支持：
```
md/txt → chunk → embedding → vector DB
```

**缺少的能力**：
- ❌ 多格式内容提取（PDF、音频、视频）
- ❌ 视频下载（YouTube、B站、其他视频网站）
- ❌ 音频转录
- ❌ 智能内容理解与结构化（不只是切片，而是提取概念、方法论、案例）
- ❌ 生成 Skills Reference（方法论文档）
- ❌ 用户友好的 UI（拖拽上传、处理进度、结果预览）

### 1.2 新增需求

1. **格式支持（分模块）**：
   - 文字：PDF、Text 文本（.txt/.md）
   - 音频：mp3/wav/m4a 等通用格式
   - 视频：支持下载能力，不区分网站（YouTube/B站/抖音/通用 URL）

2. **UI 集成**：
   - 在 Open WebUI 中新增"知识库管理"页面
   - 拖拽上传文件或输入视频 URL
   - 实时显示处理进度（下载 → 转录 → 分析 → 存储）
   - 展示处理结果（结构化内容预览、引用统计、Skills 关联）

3. **输出双格式**：
   - JSON（机器可读，供 agent-core 使用）
   - Markdown（人类可读，可直接查看和编辑）

---

## 2. 总体架构（扩展版）

### 2.1 四层架构

```
┌─────────────────────────────────────────────────────────┐
│  Open WebUI（UI 层）                                     │
│  ├ 聊天界面（原有）                                      │
│  └ 知识库管理界面（新增）                                │
│    ├ 上传/URL 输入                                       │
│    ├ 处理进度监控                                        │
│    └ 结果预览与编辑                                      │
└────────────────┬────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────┐
│  Open WebUI Pipelines（桥接层）                         │
│  ├ 聊天路由（原有）                                      │
│  └ 内容处理路由（新增）                                  │
│    └ 转发到 agent-core 的 /content/process 接口         │
└────────────────┬────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────┐
│  agent-core（核心层）                                    │
│  ├ Content Processing Pipeline（新增）                  │
│  │  ├ Extractors（PDF/音频/视频）                       │
│  │  ├ Transcriber（音频转文字）                         │
│  │  ├ Downloader（视频下载）                            │
│  │  ├ Structurer（LLM 驱动的内容理解）                  │
│  │  └ Enricher（元数据生成）                            │
│  ├ KB Storage（原有 + 扩展）                            │
│  │  ├ raw/（原始文件）                                  │
│  │  ├ structured/（结构化 JSON）                        │
│  │  ├ references/（Skills Reference Markdown）          │
│  │  └ vector/（向量索引）                               │
│  ├ Skills System（原有）                                │
│  └ LangGraph Agent（原有）                              │
└─────────────────────────────────────────────────────────┘
```

### 2.2 数据流

```
用户上传语料
  ↓
Open WebUI 知识库管理界面
  ↓
Pipelines 转发请求
  ↓
agent-core Content Pipeline
  ├─→ 1. Extract（提取内容）
  │     - PDF → text
  │     - 视频 URL → download → audio → transcript
  │     - 音频 → transcript
  │
  ├─→ 2. Structure（LLM 理解）
  │     - 提取核心概念
  │     - 梳理方法论步骤
  │     - 标注典型案例
  │     - 提取关键引用
  │
  ├─→ 3. Enrich（元数据）
  │     - 生成主题标签
  │     - 关联 Skills
  │     - 标注可信度
  │
  ├─→ 4. Chunk + Embed（向量化）
  │     - 切片（保留 source 引用）
  │     - 向量化（带 metadata）
  │
  └─→ 5. Store（分层存储）
        ├ raw/（原始文件/转录文本）
        ├ structured/（JSON）
        ├ references/（Markdown）
        └ vector/（Chroma/pgvector）
  ↓
返回结果到 Open WebUI
  ↓
用户查看处理结果
```

---

## 3. 核心模块设计

### 3.1 Content Processing Pipeline（新增模块）

#### 目录结构

```
agent-core/
  content_pipeline/
    __init__.py
    pipeline.py              # 主编排逻辑

    extractors/
      __init__.py
      base.py                # 抽象基类
      pdf.py                 # PDF 提取
      text.py                # 纯文本
      audio.py               # 音频提取
      video.py               # 视频处理（下载 + 音频提取）

    downloader/
      __init__.py
      video_downloader.py    # 通用视频下载（yt-dlp）

    transcriber/
      __init__.py
      whisper_transcriber.py # Whisper 转录

    structurer/
      __init__.py
      llm_structurer.py      # LLM 驱动的结构化
      processors/
        first_principles.py  # 第一性原理专用处理器
        game_theory.py       # 博弈论专用处理器
        generic.py           # 通用处理器

    enricher/
      __init__.py
      metadata_enricher.py   # 元数据生成

    storage/
      __init__.py
      content_store.py       # 分层存储管理

    models.py                # Pydantic 数据模型
    config.py                # 配置
```

#### 核心类设计

##### A. Pipeline 主流程

```python
class ContentPipeline:
    """
    内容处理主流程编排
    """
    def __init__(self):
        self.extractors = {...}      # 各类提取器
        self.downloader = VideoDownloader()
        self.transcriber = WhisperTranscriber()
        self.structurer = LLMStructurer()
        self.enricher = MetadataEnricher()
        self.storage = ContentStore()

    async def process(
        self,
        source: str | UploadFile,
        source_type: SourceType,
        content_category: str = "generic",
        user_id: str = None
    ) -> ProcessingResult:
        """
        完整处理流程（异步）

        Args:
            source: 文件路径、URL 或上传的文件对象
            source_type: pdf | text | audio | video
            content_category: first_principles | game_theory | generic
            user_id: 用户标识

        Returns:
            ProcessingResult: 包含所有处理结果和元数据
        """
        # 1. Extract
        # 2. Structure
        # 3. Enrich
        # 4. Chunk + Embed
        # 5. Store
        # 6. Generate Skills Reference

    def get_progress(self, task_id: str) -> ProcessingProgress:
        """获取处理进度"""
```

##### B. Extractors（多格式提取器）

```python
class BaseExtractor(ABC):
    """提取器抽象基类"""
    @abstractmethod
    def extract(self, source: str | bytes) -> ExtractedContent:
        """
        Returns:
            ExtractedContent:
                - text: str
                - metadata: dict
                - raw_path: str
        """
        pass

class PDFExtractor(BaseExtractor):
    """
    PDF 提取
    - 使用 pdfplumber（精确）或 Docling（保留布局）
    - 提取文本 + 元数据（作者、标题、页数）
    """

class AudioExtractor(BaseExtractor):
    """
    音频提取
    - 直接调用 Transcriber
    - 提取元数据（时长、格式）
    """

class VideoExtractor(BaseExtractor):
    """
    视频提取
    1. 调用 VideoDownloader 下载（如果是 URL）
    2. 提取音频流
    3. 调用 Transcriber 转录
    4. 提取元数据（时长、分辨率、来源网站）
    """
```

##### C. VideoDownloader（通用视频下载）

```python
class VideoDownloader:
    """
    基于 yt-dlp 的通用视频下载器
    支持 YouTube、B站、抖音等 1000+ 网站
    """
    def download(
        self,
        url: str,
        output_dir: str = "./downloads",
        audio_only: bool = True
    ) -> DownloadResult:
        """
        Args:
            url: 视频 URL
            audio_only: 只下载音频（默认 True，节省空间）

        Returns:
            DownloadResult:
                - file_path: str
                - metadata: dict (title, author, duration, platform)
        """
        # 使用 yt-dlp
        # 自动识别网站
        # 提取最佳质量音频
```

##### D. Transcriber（音频转录）

```python
class WhisperTranscriber:
    """
    基于 Whisper 的音频转录
    支持本地模型（faster-whisper）或远程 API
    """
    def transcribe(
        self,
        audio_path: str,
        language: str = "zh"
    ) -> TranscriptResult:
        """
        Returns:
            TranscriptResult:
                - text: str（完整转录文本）
                - segments: list（带时间戳的分段）
                - language: str（检测到的语言）
                - confidence: float
        """
```

##### E. Structurer（LLM 驱动的内容理解）

```python
class LLMStructurer:
    """
    使用 LLM 分析原始内容，提取结构化信息
    """
    def structure(
        self,
        raw_text: str,
        content_category: str,
        source_metadata: dict
    ) -> StructuredContent:
        """
        Args:
            raw_text: 原始文本
            content_category: first_principles | game_theory | generic

        Returns:
            StructuredContent:
                - concepts: list[Concept]  # 核心概念
                - methodology: Methodology | None  # 方法论（如果有）
                - examples: list[Example]  # 典型案例
                - key_quotes: list[Quote]  # 关键引用
                - summary: str  # 总结
        """
        # 根据 content_category 选择对应的 processor
        processor = self._get_processor(content_category)
        return processor.process(raw_text, source_metadata)
```

**Processor 示例**：

```python
class FirstPrinciplesProcessor:
    """
    专门处理"第一性原理"相关内容
    """
    ANALYSIS_PROMPT = """
你是一个专门分析"第一性原理"思维方法论的专家。

请分析以下内容，提取：

1. **核心概念**（3-5 个）
   - 概念名称
   - 定义
   - 在原文中的位置（用于引用）

2. **方法论步骤**（如果有明确步骤）
   - 步骤编号
   - 步骤描述
   - 示例说明

3. **典型案例**（1-3 个）
   - 案例背景
   - 应用过程
   - 结果/启示

4. **关键引用**（3-5 条金句）
   - 引用原文
   - 重要性说明

5. **总结**（200 字以内）

请以 JSON 格式输出，schema 如下：
{
  "concepts": [...],
  "methodology": {...},
  "examples": [...],
  "key_quotes": [...],
  "summary": "..."
}

---
内容：
{content}
---
"""

    def process(self, text: str, metadata: dict) -> StructuredContent:
        # 调用 LLM
        # 解析 JSON
        # 验证 schema
        # 返回结构化对象
```

##### F. Enricher（元数据生成）

```python
class MetadataEnricher:
    """
    生成丰富的 metadata，用于检索和过滤
    """
    def enrich(
        self,
        structured_content: StructuredContent,
        source_metadata: dict
    ) -> EnrichedMetadata:
        """
        Returns:
            EnrichedMetadata:
                - source_id: str（唯一标识）
                - source_type: str（pdf/audio/video）
                - source_url: str | None
                - title: str
                - author: str | None
                - created_at: datetime
                - topics: list[str]（主题标签）
                - applicable_skills: list[str]（适用的 Skills）
                - credibility: str（high/medium/low）
                - language: str
                - content_category: str
        """
```

##### G. ContentStore（分层存储）

```python
class ContentStore:
    """
    分层存储管理
    """
    def __init__(self, base_dir: str = "./kb_storage"):
        self.base_dir = base_dir
        self.raw_dir = f"{base_dir}/raw"
        self.structured_dir = f"{base_dir}/structured"
        self.references_dir = f"{base_dir}/references"
        self.vector_store = ChromaVectorStore()  # 或 pgvector

    def store(
        self,
        source_id: str,
        raw_content: bytes | str,
        structured_content: StructuredContent,
        chunks: list[Chunk],
        embeddings: list[list[float]],
        metadata: EnrichedMetadata
    ):
        """
        完整存储流程：
        1. 存储原始文件到 raw/
        2. 存储结构化 JSON 到 structured/
        3. 生成并存储 Markdown 到 references/
        4. 存储向量到 vector DB
        """

    def generate_markdown_reference(
        self,
        source_id: str,
        structured_content: StructuredContent,
        metadata: EnrichedMetadata
    ) -> str:
        """
        生成人类可读的 Markdown 文档

        格式示例：
        ---
        # 第一性原理思维方法（来源：埃隆·马斯克访谈）

        **来源类型**: 视频
        **作者**: Tim Urban
        **时长**: 45:23
        **主题**: 第一性原理、创新思维
        **适用技能**: first_principles_analysis

        ## 核心概念

        ### 1. 第一性原理（First Principles）
        > "从最基本的真理出发进行推理，而不是类比推理"

        **定义**: ...
        **引用位置**: [fp_video_01#c12]

        ## 方法论

        ### 四步法
        1. **拆解目标** - ...
        2. **识别约束** - ...

        ## 典型案例

        ### SpaceX 火箭成本优化
        ...

        ## 关键引用

        - "Physics is the law, everything else is a recommendation" [00:12:34]
        - ...
        ---
        """
```

#### 数据模型（Pydantic）

```python
# content_pipeline/models.py

class SourceType(str, Enum):
    PDF = "pdf"
    TEXT = "text"
    AUDIO = "audio"
    VIDEO = "video"

class ContentCategory(str, Enum):
    FIRST_PRINCIPLES = "first_principles"
    GAME_THEORY = "game_theory"
    SAWEI_PERSONALITY = "sawei_personality"
    GENERIC = "generic"

class ExtractedContent(BaseModel):
    text: str
    metadata: dict
    raw_path: str

class Concept(BaseModel):
    name: str
    definition: str
    source_chunk_id: str  # 引用位置

class MethodologyStep(BaseModel):
    step_number: int
    description: str
    example: str | None = None

class Methodology(BaseModel):
    name: str
    steps: list[MethodologyStep]
    source_chunk_id: str

class Example(BaseModel):
    title: str
    background: str
    application: str
    outcome: str
    source_chunk_id: str

class Quote(BaseModel):
    text: str
    importance: str
    source_chunk_id: str
    timestamp: str | None = None  # 视频/音频的时间戳

class StructuredContent(BaseModel):
    concepts: list[Concept]
    methodology: Methodology | None = None
    examples: list[Example]
    key_quotes: list[Quote]
    summary: str

class EnrichedMetadata(BaseModel):
    source_id: str
    source_type: SourceType
    source_url: str | None = None
    title: str
    author: str | None = None
    created_at: datetime
    topics: list[str]
    applicable_skills: list[str]
    credibility: str  # high/medium/low
    language: str
    content_category: ContentCategory

class ProcessingProgress(BaseModel):
    task_id: str
    status: str  # pending/extracting/structuring/embedding/completed/failed
    current_step: str
    progress_percent: int
    message: str
    started_at: datetime
    completed_at: datetime | None = None
    error: str | None = None

class ProcessingResult(BaseModel):
    task_id: str
    source_id: str
    status: str
    structured_content: StructuredContent
    metadata: EnrichedMetadata
    markdown_path: str
    json_path: str
    chunks_count: int
    processing_time: float
```

---

### 3.2 agent-core API 扩展（新增接口）

#### A. 内容处理接口

```
POST /v1/content/process
```

**请求体**：
```json
{
  "source_type": "video",
  "source": "https://youtube.com/watch?v=xxx",
  "content_category": "first_principles",
  "user_id": "user_123",
  "options": {
    "language": "zh",
    "audio_only": true
  }
}
```

**响应体**（异步，立即返回 task_id）：
```json
{
  "task_id": "task_abc123",
  "status": "pending",
  "message": "Content processing started"
}
```

---

```
GET /v1/content/progress/{task_id}
```

**响应体**：
```json
{
  "task_id": "task_abc123",
  "status": "structuring",
  "current_step": "Analyzing content with LLM",
  "progress_percent": 60,
  "message": "Extracting concepts and methodology...",
  "started_at": "2025-01-15T10:30:00Z"
}
```

---

```
GET /v1/content/result/{task_id}
```

**响应体**：
```json
{
  "task_id": "task_abc123",
  "source_id": "src_fp_video_001",
  "status": "completed",
  "structured_content": {
    "concepts": [...],
    "methodology": {...},
    "examples": [...],
    "key_quotes": [...],
    "summary": "..."
  },
  "metadata": {
    "source_type": "video",
    "title": "Elon Musk on First Principles Thinking",
    "topics": ["first_principles", "innovation"],
    "applicable_skills": ["first_principles_analysis"]
  },
  "markdown_path": "/kb_storage/references/src_fp_video_001.md",
  "json_path": "/kb_storage/structured/src_fp_video_001.json",
  "chunks_count": 45,
  "processing_time": 120.5
}
```

---

#### B. 知识库管理接口

```
GET /v1/kb/sources
```
获取所有已处理的语料列表

```
GET /v1/kb/sources/{source_id}
```
获取单个语料的详细信息

```
DELETE /v1/kb/sources/{source_id}
```
删除语料（包括原始文件、结构化数据、向量索引）

```
PUT /v1/kb/sources/{source_id}/metadata
```
更新元数据（如修正主题标签、关联的 Skills）

---

### 3.3 Open WebUI 集成（UI 层）

#### A. 新增"知识库管理"页面

**页面路径**: `/admin/knowledge-base`

**功能模块**：

1. **上传区域**
   - 拖拽上传文件（PDF/txt/音频）
   - 或输入视频 URL（YouTube/B站/通用）
   - 选择内容类别（下拉框）：
     - 第一性原理
     - 博弈论
     - 赛维人格
     - 工作方法
     - 通用内容

2. **处理队列**
   - 显示当前处理中的任务
   - 实时进度条：
     ```
     [████████░░] 60% - 正在分析内容结构...
     已完成: 下载 → 转录
     进行中: 结构化分析
     待处理: 向量化 → 存储
     ```

3. **语料库列表**
   - 表格展示所有已处理的语料：
     | 标题 | 类型 | 来源 | 主题标签 | 关联技能 | 上传时间 | 操作 |
     |------|------|------|----------|----------|----------|------|
     | 第一性原理思维 | 视频 | YouTube | 第一性原理 | first_principles_analysis | 2025-01-15 | 查看/删除 |

4. **详情预览**
   - 点击"查看"弹出详情面板：
     - 左侧：结构化内容预览（概念、方法论、案例、引用）
     - 右侧：Markdown 文档（可编辑）
     - 底部：元数据（可编辑）

5. **搜索与过滤**
   - 按类型筛选（PDF/音频/视频）
   - 按主题筛选
   - 按关联技能筛选
   - 全文搜索

---

#### B. UI 实现方式（两种选择）

**方式 1：扩展 Open WebUI（推荐）**

在 Open WebUI 的前端代码中新增页面：
```
open-webui/src/lib/components/
  admin/
    KnowledgeBase/
      KnowledgeBaseManager.svelte    # 主页面
      UploadArea.svelte              # 上传区域
      ProcessingQueue.svelte         # 处理队列
      SourceList.svelte              # 语料列表
      SourceDetail.svelte            # 详情预览
```

通过 Open WebUI 的后端 API（FastAPI）调用 agent-core 的接口。

**方式 2：独立 Web App（备选）**

如果不想改动 Open WebUI 源码，可以做一个独立的管理界面：
- 单独的前端项目（React/Vue）
- 直接调用 agent-core 的 `/v1/content/*` 接口
- 通过链接从 Open WebUI 跳转过去

---

#### C. 与聊天界面的联动

**场景**: 用户在聊天时想知道某个回答的依据来源

**实现**:
1. agent-core 在响应中附带 `citations`：
   ```json
   {
     "content": "根据第一性原理，我们应该...",
     "citations": [
       {
         "source_id": "src_fp_video_001",
         "chunk_id": "src_fp_video_001#c12",
         "quote": "从最基本的真理出发..."
       }
     ]
   }
   ```

2. Open WebUI 在聊天界面展示引用：
   ```
   Agent: 根据第一性原理，我们应该从最基本的真理出发进行推理。

   📚 依据：
   - [第一性原理思维 #c12] "从最基本的真理出发..."
     (点击查看完整内容)
   ```

3. 点击引用后：
   - 弹出侧边栏，显示原始语料的相关片段
   - 或跳转到知识库管理页面的详情页

---

## 4. 技术选型

### 4.1 核心依赖

| 功能 | 技术选型 | 备注 |
|------|----------|------|
| PDF 提取 | `pdfplumber` | 精确文本提取 |
| 视频下载 | `yt-dlp` | 支持 1000+ 网站 |
| 音频转录 | `faster-whisper` | 本地运行，快速 |
| LLM 调用 | LangChain | 统一接口 |
| 向量数据库 | Chroma（MVP）→ pgvector（升级） | 简单 → 生产级 |
| 异步任务 | Celery + Redis | 处理队列 |
| 文件存储 | 本地文件系统（MVP）→ S3（升级） | 简单 → 可扩展 |

### 4.2 可选增强

| 功能 | 技术 | 用途 |
|------|------|------|
| 更好的 PDF 解析 | `Docling` | 保留布局、表格 |
| 远程转录 | `Deepgram`/`AssemblyAI` | 更准确，支持说话人分离 |
| 通用文档解析 | `unstructured.io` | 支持 PPT/Word/Excel |
| OCR | `Tesseract`/`EasyOCR` | 图片/扫描件提取 |

---

## 5. 实现路径（分阶段）

### Phase 0: 准备工作（1 周）

**目标**: 搭建基础框架，跑通最简单的流程

**任务**:
1. 初始化 `content_pipeline/` 模块结构
2. 安装依赖：
   ```bash
   pip install pdfplumber yt-dlp faster-whisper langchain chromadb
   ```
3. 实现基础数据模型（Pydantic）
4. 实现 ContentStore（本地文件存储）
5. 写一个最简单的 CLI 测试：
   ```bash
   python -m content_pipeline process \
     --source test.pdf \
     --type pdf \
     --category generic
   ```

**验收**: 能处理一个 PDF，输出 JSON 和 Markdown（内容可以很简陋）

---

### Phase 1: 核心 Pipeline（2-3 周）

**目标**: 实现完整的内容处理流程（三种格式）

#### 1.1 文字处理（PDF + Text）
- 实现 `PDFExtractor`（pdfplumber）
- 实现 `TextExtractor`（直接读取）
- 实现基础的 `GenericProcessor`（LLM 结构化）
- 测试用例：处理一本 PDF 书籍

#### 1.2 视频处理
- 实现 `VideoDownloader`（yt-dlp）
- 实现 `WhisperTranscriber`（faster-whisper）
- 实现 `VideoExtractor`（串联下载 + 转录）
- 测试用例：处理一个 YouTube 视频

#### 1.3 音频处理
- 实现 `AudioExtractor`（直接转录）
- 测试用例：处理一个播客音频

#### 1.4 结构化处理器
- 实现 `FirstPrinciplesProcessor`（专门处理第一性原理内容）
- 实现 `GenericProcessor`（通用内容）
- 实现 LLM 调用逻辑（通过 LangChain）

**验收**:
- 能处理 PDF/视频/音频三种格式
- 输出包含：concepts、methodology、examples、key_quotes、summary
- 生成 JSON 和 Markdown 两种格式

---

### Phase 2: API 与异步处理（1-2 周）

**目标**: 提供稳定的 HTTP API，支持异步处理

#### 2.1 FastAPI 接口
- 实现 `POST /v1/content/process`（接收上传/URL）
- 实现 `GET /v1/content/progress/{task_id}`（查询进度）
- 实现 `GET /v1/content/result/{task_id}`（获取结果）
- 实现 `GET /v1/kb/sources`（列出所有语料）

#### 2.2 异步任务队列
- 集成 Celery + Redis
- 把 Pipeline 处理改为异步任务
- 实现进度回调（更新处理状态）

#### 2.3 错误处理
- 处理失败重试（最多 3 次）
- 错误日志记录
- 用户友好的错误提示

**验收**:
- 能通过 HTTP API 上传文件或 URL
- 立即返回 task_id
- 通过轮询获取进度
- 处理完成后获取结果

---

### Phase 3: UI 集成（2-3 周）

**目标**: 在 Open WebUI 中提供完整的知识库管理界面

#### 3.1 后端集成
- 在 Open WebUI 后端添加路由（转发到 agent-core）
- 或通过 Pipelines 转发

#### 3.2 前端开发
- 开发"知识库管理"页面（Svelte）
- 上传区域（拖拽 + URL 输入）
- 处理队列（实时进度）
- 语料列表（表格 + 搜索）
- 详情预览（结构化内容 + Markdown）

#### 3.3 聊天联动
- 在聊天界面展示 citations
- 点击引用跳转到详情

**验收**:
- 能在 UI 上传文件/输入 URL
- 实时看到处理进度
- 查看处理结果
- 在聊天中看到引用并跳转

---

### Phase 4: 增强与优化（2 周）

**目标**: 生产级优化

#### 4.1 更多处理器
- 实现 `GameTheoryProcessor`（博弈论）
- 实现 `SaweiPersonalityProcessor`（赛维人格）
- 实现 `WorkRetrospectiveProcessor`（工作复盘）

#### 4.2 性能优化
- 视频下载并发控制
- 转录批处理
- 向量化批处理
- 缓存中间结果

#### 4.3 质量提升
- 转录后校对（LLM 修正错别字）
- 结构化内容验证（schema 校验）
- 引用位置精确标注（chunk_id 优化）

#### 4.4 用户体验
- 处理失败后可重试
- Markdown 在线编辑（手动修正）
- 元数据手动调整
- 批量导入

**验收**:
- 处理速度提升 30%+
- 转录准确率 > 95%
- 结构化内容质量稳定

---

## 6. 数据存储方案

### 6.1 目录结构

```
kb_storage/
  raw/                          # 原始文件
    pdf/
      src_fp_book_001.pdf
    audio/
      src_podcast_001.mp3
    video/
      src_youtube_001.mp4       # 或只保留音频
    transcripts/
      src_youtube_001.txt       # 转录文本

  structured/                   # 结构化 JSON
    src_fp_book_001.json
    src_youtube_001.json

  references/                   # Skills Reference Markdown
    first_principles/
      src_fp_book_001.md
      src_youtube_001.md
    game_theory/
      src_game_book_001.md

  vector/                       # 向量数据库
    chroma/                     # Chroma 数据文件
```

### 6.2 数据库设计（PostgreSQL - 可选）

如果需要更强大的查询能力，可以用 PostgreSQL 存储元数据：

```sql
-- 语料表
CREATE TABLE sources (
  source_id VARCHAR(64) PRIMARY KEY,
  source_type VARCHAR(20) NOT NULL,  -- pdf/audio/video
  source_url TEXT,
  title VARCHAR(500) NOT NULL,
  author VARCHAR(200),
  content_category VARCHAR(50),      -- first_principles/game_theory/...
  language VARCHAR(10),
  credibility VARCHAR(20),           -- high/medium/low
  raw_path TEXT,
  json_path TEXT,
  markdown_path TEXT,
  chunks_count INT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 主题标签表（多对多）
CREATE TABLE source_topics (
  source_id VARCHAR(64) REFERENCES sources(source_id),
  topic VARCHAR(100),
  PRIMARY KEY (source_id, topic)
);

-- 技能关联表（多对多）
CREATE TABLE source_skills (
  source_id VARCHAR(64) REFERENCES sources(source_id),
  skill_id VARCHAR(100),
  PRIMARY KEY (source_id, skill_id)
);

-- 处理任务表
CREATE TABLE processing_tasks (
  task_id VARCHAR(64) PRIMARY KEY,
  source_id VARCHAR(64),
  status VARCHAR(20),                -- pending/processing/completed/failed
  progress_percent INT,
  current_step VARCHAR(100),
  error_message TEXT,
  started_at TIMESTAMP,
  completed_at TIMESTAMP
);
```

---

## 7. 安全与边界

### 7.1 文件安全
- 文件大小限制（PDF < 100MB，视频 < 1GB）
- 文件类型白名单验证（不只看扩展名，检查 MIME type）
- 病毒扫描（可选，集成 ClamAV）

### 7.2 URL 安全
- URL 白名单（只允许已知视频网站）
- 或用户确认机制（显示将要下载的网站，需用户确认）
- 下载超时限制（避免恶意网站卡住）

### 7.3 内容安全
- 转录内容审核（检测敏感内容）
- 结构化内容的 prompt 注入防护
- 生成的 Markdown 中禁止执行代码（XSS 防护）

### 7.4 资源限制
- 并发处理任务数限制（避免资源耗尽）
- 每用户存储配额（避免滥用）
- 过期内容清理（90 天未使用的语料可归档）

---

## 8. 验收标准（MVP）

### 8.1 功能完整性
- ✅ 支持 PDF/Text/音频/视频 四种格式
- ✅ 视频支持 YouTube + 至少一个国内网站（B站）
- ✅ 能自动转录音频/视频
- ✅ 能提取核心概念、方法论、案例、引用
- ✅ 输出 JSON + Markdown 双格式
- ✅ 提供 HTTP API（上传、进度、结果）
- ✅ 提供 UI 界面（上传、查看、管理）

### 8.2 质量标准
- ✅ 转录准确率 > 90%（中文）
- ✅ 结构化内容符合 JSON schema
- ✅ 每个语料至少提取 3 个核心概念
- ✅ 引用位置可追溯（chunk_id 明确）

### 8.3 性能标准
- ✅ PDF（50 页）处理时间 < 2 分钟
- ✅ 视频（30 分钟）处理时间 < 10 分钟
- ✅ 并发处理 3 个任务不崩溃

### 8.4 用户体验
- ✅ 上传操作简单（拖拽或 URL）
- ✅ 处理进度实时可见
- ✅ 失败有明确错误提示
- ✅ 结果可预览和编辑

---

## 9. 与原 PRD 的整合

### 9.1 修改原任务清单

在 `langgraph_langchain_openwebui_integration_spec.md` 的任务清单中，插入新步骤：

**原清单**：
1. 初始化 `agent-core` repo
2. 实现 KB ingestion
3. 实现 Retriever
...

**修改后**：
1. 初始化 `agent-core` repo
2. **实现 Content Processing Pipeline**（新增）
   - 2.1 实现 Extractors（PDF/Audio/Video）
   - 2.2 实现 VideoDownloader（yt-dlp）
   - 2.3 实现 Transcriber（Whisper）
   - 2.4 实现 Structurer（LLM 驱动）
   - 2.5 实现分层存储
   - 2.6 实现 HTTP API（异步处理）
3. **实现 Open WebUI 知识库管理界面**（新增）
   - 3.1 后端路由（转发到 agent-core）
   - 3.2 前端页面（上传/进度/列表/详情）
4. 实现 KB ingestion（简化为对接 Content Pipeline 的输出）
5. 实现 Retriever
...

### 9.2 Skills Reference 的使用

当 Skills 执行时，可以参考对应的 Reference 文档：

```python
# skills/first_principles_analysis/executor.py

class FirstPrinciplesSkill:
    def execute(self, user_query: str, context: dict):
        # 1. 加载 Skills Reference
        references = self._load_references()

        # 2. 构建 prompt（包含 reference）
        prompt = f"""
你是第一性原理分析专家。

参考资料：
{references}

用户问题：
{user_query}

请按照第一性原理四步法分析...
"""

        # 3. 调用 LLM
        # 4. 返回结构化结果

    def _load_references(self):
        """加载所有关联的 reference 文档"""
        refs_dir = "./kb_storage/references/first_principles/"
        all_refs = []
        for md_file in Path(refs_dir).glob("*.md"):
            all_refs.append(md_file.read_text())
        return "\n\n---\n\n".join(all_refs)
```

---

## 10. 开放问题（待讨论）

### 10.1 LLM 选择
- **本地模型**（Ollama）：
  - 优点：完全私有，无成本
  - 缺点：结构化能力较弱（尤其是 7B/13B 模型）
- **远程模型**（GPT-4/Claude）：
  - 优点：结构化能力强，准确度高
  - 缺点：有成本，需要网络

**建议**: MVP 用远程模型（保证质量），后续优化 prompt 适配本地模型

### 10.2 转录语言
- 目前主要是中文，Whisper 对中文支持良好
- 如果有英文内容，需要自动语言检测

### 10.3 视频网站支持
- yt-dlp 理论上支持 1000+ 网站
- 但国内网站（B站/抖音）可能需要额外配置（cookies）
- 是否需要用户提供登录凭证？

### 10.4 存储成本
- 视频文件较大，是否只保留音频？
- 是否需要定期清理未使用的语料？

---

## 11. 后续演进方向

### 11.1 增强功能
- **增量更新**：新增内容时不全量重建
- **自动分类**：LLM 自动判断 content_category
- **多语言支持**：自动检测并处理英文/日文内容
- **说话人分离**：视频转录时区分不同说话人
- **OCR 支持**：处理扫描版 PDF、图片

### 11.2 智能化
- **内容推荐**：根据用户问题推荐相关语料
- **自动标签**：AI 自动生成主题标签
- **质量评分**：自动评估语料的质量和可信度
- **去重检测**：检测重复或相似的内容

### 11.3 协作功能
- **共享知识库**：团队共享语料库
- **批注功能**：在 Markdown 上添加个人笔记
- **版本管理**：语料的更新历史

---

## 12. 总结

本方案在原 LangGraph/LangChain + Open WebUI 架构基础上，新增了 **Content Processing Pipeline**，实现了：

1. ✅ **多格式支持**：PDF、Text、音频、视频
2. ✅ **智能理解**：不只是切片，而是提取概念、方法论、案例、引用
3. ✅ **双格式输出**：JSON（机器）+ Markdown（人类）
4. ✅ **UI 集成**：拖拽上传、实时进度、结果预览
5. ✅ **分层存储**：原始文件、结构化数据、Skills Reference、向量索引

**核心优势**：
- 将原始语料转化为结构化、可检索、可引用的知识资产
- 为 Skills 提供高质量的方法论参考文档
- 用户体验友好（拖拽上传、一键处理、可视化结果）

**实现路径**：
- Phase 0: 基础框架（1 周）
- Phase 1: 核心 Pipeline（2-3 周）
- Phase 2: API 与异步（1-2 周）
- Phase 3: UI 集成（2-3 周）
- Phase 4: 增强优化（2 周）

**总计**: 8-11 周达到 MVP

---

**下一步行动**：
1. Review 本方案，确认技术选型和实现路径
2. 开始 Phase 0：搭建基础框架
3. 测试第一个语料处理（PDF 或视频）
4. 逐步迭代，持续验证

---

> **文档版本**: v1.0
> **创建时间**: 2025-01-15
> **维护者**: Agent-Core Team
> **相关文档**: `langgraph_langchain_openwebui_integration_spec.md`
