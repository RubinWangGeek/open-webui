# 个人知识库 Agent 系统 — 详细技术设计文档

> **项目代号**: Agent-Core + Open WebUI
> **版本**: v2.0
> **最后更新**: 2026-03-04
> **定位**: 基于 Open WebUI 做 UI，自建 agent-core 后端，打造"个人知识库 + 方法论 Skills"的本地 AI Agent 系统

---

## 目录

1. [项目概述](#1-项目概述)
2. [总体架构](#2-总体架构)
3. [模块一：agent-core 基础框架](#3-模块一agent-core-基础框架)
4. [模块二：Content Processing Pipeline](#4-模块二content-processing-pipeline)
5. [模块三：知识库存储层](#5-模块三知识库存储层)
6. [模块四：Skills 体系](#6-模块四skills-体系)
7. [模块五：LangGraph Agent 编排](#7-模块五langgraph-agent-编排)
8. [模块六：RAG 检索系统](#8-模块六rag-检索系统)
9. [模块七：HTTP API 层](#9-模块七http-api-层)
10. [模块八：Open WebUI 集成](#10-模块八open-webui-集成)
11. [数据模型总览](#11-数据模型总览)
12. [部署方案](#12-部署方案)
13. [附录：技术选型对比表](#13-附录技术选型对比表)

---

## 1. 项目概述

### 1.1 目标

构建一个**本地可运行**的个人 AI Agent 系统，核心能力：

| 能力 | 说明 |
|------|------|
| **知识库构建** | 从 PDF/音频/视频等多格式语料中，自动提取、结构化、向量化，形成可检索的个人知识库 |
| **方法论 Skills** | 将第一性原理、博弈论、赛维人格等方法论固化为可复用、可测试的 Skills |
| **智能对话** | 用户提问后，Agent 自动选择 Skill、检索知识库证据、输出带引用的结构化回答 |
| **追问补齐** | 信息不足时主动追问用户，而不是硬编回答 |
| **可追溯** | 每次回答都带 citations，结论可追溯到知识库原文 |

### 1.2 系统边界

```
用户 ←→ Open WebUI (浏览器) ←→ agent-core (本地 FastAPI 服务)
                                     ├── LangGraph (Agent 编排)
                                     ├── LangChain (工具/模型集成)
                                     ├── Chroma/pgvector (向量库)
                                     ├── Whisper (音频转录)
                                     └── yt-dlp (视频下载)
```

**不在 scope 内**：多用户协作、公网部署、移动端 App。

---

## 2. 总体架构

> **TODO: 在此处插入 [总体系统架构图] — 文件: `diagrams/01_system_architecture.drawio`**

### 2.1 三层架构详解

#### 第一层：UI 层（Open WebUI）

| 职责 | 具体内容 |
|------|----------|
| 聊天界面 | 对话输入、消息展示、流式输出、引用展示 |
| 知识库管理（新增） | 拖拽上传、URL 输入、处理进度、语料列表、详情预览 |
| 模型管理 | 切换模型（Ollama 本地 / agent-core / 远程 API） |
| 用户管理 | 注册登录、权限控制（原有能力） |

**技术栈**: SvelteKit + TailwindCSS，前端代码位于 `open-webui/src/`

#### 第二层：桥接层（Pipelines，可选）

| 职责 | 具体内容 |
|------|----------|
| 路由分发 | 普通聊天 → LLM，技能/Agent 模式 → agent-core |
| 协议适配 | 将 Open WebUI 请求格式适配到 agent-core 接口 |
| 轻量鉴权 | 转发时附带 `X-API-Key` |

**原则**: Pipelines 内不放核心逻辑。如果 agent-core 直接暴露 OpenAI-compatible API，Pipelines 可以不用。

#### 第三层：核心层（agent-core）

| 子模块 | 职责 |
|--------|------|
| Content Pipeline | 多格式语料的提取、转录、结构化、向量化 |
| KB Storage | 原始文件/结构化 JSON/Markdown Reference/向量索引的分层存储 |
| Skills | 方法论 Skill 定义、加载、执行、测试 |
| Agent (LangGraph) | 意图理解 → Skill 路由 → 检索 → 执行 → 自检 → 输出 |
| RAG Retriever | 向量检索 + 关键词混合检索 + Citation 生成 |
| API | FastAPI 提供 HTTP 接口，兼容 OpenAI Chat Completions 格式 |

### 2.2 数据流总览

```
用户在 Open WebUI 输入问题
  │
  ▼
Open WebUI 发送 POST /v1/chat/completions 到 agent-core
  │
  ▼
agent-core LangGraph Agent 启动
  │
  ├─ Intake: 理解用户意图
  ├─ Route: 选择合适的 Skill(s)
  ├─ AskBack: (如果信息不足) 返回追问
  ├─ Retrieve: 从向量库检索相关知识 + citations
  ├─ Execute: 执行 Skill，注入检索结果
  ├─ SelfCheck: 检查输出质量（引用完整性/结构合规）
  └─ Finalize: 汇总输出 Markdown + citations
  │
  ▼
返回 OpenAI-compatible 响应给 Open WebUI
  │
  ▼
Open WebUI 展示回答 + 引用列表
```

---

## 3. 模块一：agent-core 基础框架

### 3.1 项目结构

```
agent-core/
├── pyproject.toml              # 项目配置（uv/poetry）
├── .env.example                # 环境变量模板
├── README.md
│
├── apps/
│   ├── api.py                  # FastAPI 主入口
│   └── cli.py                  # 命令行工具（调试/手动处理）
│
├── core/
│   ├── __init__.py
│   ├── config.py               # 配置管理（pydantic-settings）
│   ├── logging.py              # 统一日志
│   └── models.py               # 全局公用 Pydantic 模型
│
├── content_pipeline/           # 模块二：内容处理
│   ├── ...
│
├── kb/                         # 模块三：知识库存储
│   ├── ...
│
├── skills/                     # 模块四：Skills 定义
│   ├── ...
│
├── agent/                      # 模块五：LangGraph Agent
│   ├── ...
│
├── tests/                      # 测试
│   ├── conftest.py
│   ├── test_pipeline.py
│   ├── test_skills.py
│   ├── test_agent.py
│   └── test_api.py
│
└── docker/
    ├── Dockerfile
    └── docker-compose.yml
```

### 3.2 配置管理 `core/config.py`

使用 `pydantic-settings` 统一管理所有配置，支持 `.env` 文件和环境变量：

```python
from pydantic_settings import BaseSettings
from pathlib import Path

class Settings(BaseSettings):
    """全局配置 - 所有路径和密钥集中管理"""

    # === 基础 ===
    APP_NAME: str = "agent-core"
    DEBUG: bool = False
    HOST: str = "127.0.0.1"       # 默认只监听本地
    PORT: int = 8000
    API_KEY: str = ""             # 简单鉴权（可选）

    # === LLM ===
    LLM_PROVIDER: str = "openai"  # openai | ollama
    LLM_MODEL: str = "gpt-4o"
    LLM_BASE_URL: str = "https://api.openai.com/v1"
    LLM_API_KEY: str = ""
    LLM_TEMPERATURE: float = 0.3

    # === Ollama（本地模型） ===
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "qwen2.5:7b"

    # === 向量库 ===
    VECTOR_DB: str = "chroma"     # chroma | pgvector
    CHROMA_PERSIST_DIR: str = "./kb_storage/vector/chroma"
    PG_CONNECTION_STRING: str = ""

    # === 嵌入模型 ===
    EMBEDDING_MODEL: str = "BAAI/bge-small-zh-v1.5"

    # === 存储路径 ===
    KB_STORAGE_DIR: Path = Path("./kb_storage")
    RAW_DIR: Path = Path("./kb_storage/raw")
    STRUCTURED_DIR: Path = Path("./kb_storage/structured")
    REFERENCES_DIR: Path = Path("./kb_storage/references")

    # === Whisper 转录 ===
    WHISPER_MODEL_SIZE: str = "medium"  # tiny|base|small|medium|large
    WHISPER_DEVICE: str = "cpu"         # cpu | cuda
    WHISPER_LANGUAGE: str = "zh"

    # === Celery 异步任务 ===
    CELERY_BROKER_URL: str = "redis://localhost:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/1"

    # === Agent ===
    AGENT_MAX_SELFCHECK_LOOPS: int = 2
    AGENT_MAX_ASKBACK_ROUNDS: int = 3
    RETRIEVAL_TOP_K: int = 5

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

settings = Settings()
```

### 3.3 日志系统 `core/logging.py`

```python
import logging
import sys
from core.config import settings

def setup_logging() -> logging.Logger:
    logger = logging.getLogger(settings.APP_NAME)
    logger.setLevel(logging.DEBUG if settings.DEBUG else logging.INFO)

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter(
        "[%(asctime)s] %(levelname)s %(name)s.%(funcName)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    ))
    logger.addHandler(handler)
    return logger

logger = setup_logging()
```

### 3.4 FastAPI 主入口 `apps/api.py`

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from core.config import settings

app = FastAPI(
    title="Agent Core API",
    version="1.0.0",
    docs_url="/docs" if settings.DEBUG else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Open WebUI
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"status": "ok", "version": "1.0.0"}

# --- 路由注册（后续模块添加） ---
# from api.routes import content_router, chat_router, kb_router
# app.include_router(content_router, prefix="/v1/content")
# app.include_router(chat_router, prefix="/v1")
# app.include_router(kb_router, prefix="/v1/kb")
```

### 3.5 依赖清单

```toml
# pyproject.toml [project.dependencies]
[project]
dependencies = [
    # === 框架 ===
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.30.0",
    "pydantic>=2.0",
    "pydantic-settings>=2.0",

    # === LLM 集成 ===
    "langchain>=0.3.0",
    "langchain-openai>=0.2.0",
    "langchain-community>=0.3.0",
    "langgraph>=0.2.0",

    # === 内容处理 ===
    "pdfplumber>=0.11.0",
    "yt-dlp>=2024.0",
    "faster-whisper>=1.0.0",

    # === 向量库 & 嵌入 ===
    "chromadb>=0.5.0",
    "sentence-transformers>=3.0.0",

    # === 异步任务 ===
    "celery[redis]>=5.4.0",

    # === 工具 ===
    "python-dotenv>=1.0.0",
    "pyyaml>=6.0",
    "rich>=13.0",              # CLI 美化
    "httpx>=0.27.0",           # HTTP 客户端
]

[project.optional-dependencies]
dev = [
    "pytest>=8.0",
    "pytest-asyncio>=0.24.0",
    "pytest-cov>=5.0",
    "ruff>=0.6.0",
]
```

---

## 4. 模块二：Content Processing Pipeline

### 4.1 模块职责

将多格式原始语料（PDF / 纯文本 / 音频 / 视频 URL）转化为：
- **结构化 JSON**（核心概念、方法论步骤、案例、关键引用、总结）
- **Markdown Reference**（人类可读的知识文档）
- **向量索引**（可供 RAG 检索的 embedding chunks）

### 4.2 处理流程

> **TODO: 在此处插入 [Content Pipeline 处理流程图] — 文件: `diagrams/02_content_pipeline_flow.drawio`**

文字描述（6 步）：

```
输入源（文件/URL）
  │
  ▼
Step 1: EXTRACT（提取原始文本）
  ├── PDF → PDFExtractor（pdfplumber）
  ├── Text → TextExtractor（直接读取）
  ├── Audio → AudioExtractor → WhisperTranscriber
  └── Video → VideoDownloader(yt-dlp) → 提取音轨 → WhisperTranscriber
  │
  ▼
Step 2: STRUCTURE（LLM 结构化理解）
  ├── GenericProcessor（通用内容）
  ├── FirstPrinciplesProcessor（第一性原理专用）
  ├── GameTheoryProcessor（博弈论专用）
  └── ... 更多 Processor
  │
  ▼
Step 3: ENRICH（元数据增强）
  └── 生成 source_id、主题标签、关联 Skills、可信度评级
  │
  ▼
Step 4: CHUNK（文本切片）
  └── 按 500 字 / 50 字 overlap 切片，保留 source 引用关系
  │
  ▼
Step 5: EMBED（向量化）
  └── BAAI/bge-small-zh-v1.5 生成 embedding
  │
  ▼
Step 6: STORE（分层存储）
  ├── raw/ — 原始文件
  ├── structured/ — JSON
  ├── references/ — Markdown
  └── vector/ — Chroma/pgvector
```

### 4.3 目录结构

```
content_pipeline/
├── __init__.py
├── pipeline.py                 # ContentPipeline 主编排类
├── models.py                   # Pipeline 专用 Pydantic 模型
├── config.py                   # Pipeline 配置
│
├── extractors/                 # Step 1: 内容提取器
│   ├── __init__.py
│   ├── base.py                 # BaseExtractor 抽象基类
│   ├── pdf.py                  # PDFExtractor
│   ├── text.py                 # TextExtractor
│   ├── audio.py                # AudioExtractor
│   └── video.py                # VideoExtractor
│
├── downloader/                 # 视频下载
│   ├── __init__.py
│   └── video_downloader.py     # VideoDownloader (yt-dlp)
│
├── transcriber/                # 音频转录
│   ├── __init__.py
│   └── whisper_transcriber.py  # WhisperTranscriber (faster-whisper)
│
├── structurer/                 # Step 2: LLM 结构化
│   ├── __init__.py
│   ├── llm_structurer.py       # LLMStructurer 主调度
│   └── processors/             # 各领域专用处理器
│       ├── __init__.py
│       ├── base.py             # BaseProcessor 抽象基类
│       ├── generic.py          # GenericProcessor
│       ├── first_principles.py # FirstPrinciplesProcessor
│       └── game_theory.py      # GameTheoryProcessor
│
└── enricher/                   # Step 3: 元数据增强
    ├── __init__.py
    └── metadata_enricher.py    # MetadataEnricher
```

### 4.4 核心类设计

> **TODO: 在此处插入 [Content Pipeline 类图] — 文件: `diagrams/05_class_diagrams.drawio` (Sheet: ContentPipeline)**

#### 4.4.1 BaseExtractor — 提取器抽象基类

```python
# content_pipeline/extractors/base.py
from abc import ABC, abstractmethod
from content_pipeline.models import ExtractedContent

class BaseExtractor(ABC):
    """所有提取器的基类，保证统一的输入输出接口"""

    @abstractmethod
    async def extract(self, source: str | bytes) -> ExtractedContent:
        """
        从源数据中提取文本内容

        Args:
            source: 文件路径、URL 或原始字节

        Returns:
            ExtractedContent:
                text: str          — 提取的纯文本
                metadata: dict     — 来源元数据（页数/时长/作者等）
                raw_path: str      — 原始文件的存储路径
        """
        pass

    def validate_source(self, source: str) -> bool:
        """校验输入源是否合法（子类可覆写）"""
        return True
```

#### 4.4.2 PDFExtractor

```python
# content_pipeline/extractors/pdf.py
import pdfplumber
from pathlib import Path
from .base import BaseExtractor
from content_pipeline.models import ExtractedContent

class PDFExtractor(BaseExtractor):

    async def extract(self, source: str | bytes) -> ExtractedContent:
        pdf_path = Path(source)
        pages_text = []
        metadata = {}

        with pdfplumber.open(pdf_path) as pdf:
            metadata = {
                "page_count": len(pdf.pages),
                "title": pdf.metadata.get("Title", pdf_path.stem),
                "author": pdf.metadata.get("Author"),
                "creator": pdf.metadata.get("Creator"),
            }
            for i, page in enumerate(pdf.pages):
                text = page.extract_text()
                if text:
                    pages_text.append(f"[Page {i+1}]\n{text}")

        full_text = "\n\n".join(pages_text)

        return ExtractedContent(
            text=full_text,
            metadata=metadata,
            raw_path=str(pdf_path),
        )
```

#### 4.4.3 VideoDownloader

```python
# content_pipeline/downloader/video_downloader.py
import yt_dlp
from pathlib import Path
from content_pipeline.models import DownloadResult
from core.config import settings

class VideoDownloader:
    """基于 yt-dlp 的通用视频下载器，支持 1000+ 网站"""

    def __init__(self, output_dir: str | None = None):
        self.output_dir = Path(output_dir or settings.RAW_DIR / "video")
        self.output_dir.mkdir(parents=True, exist_ok=True)

    async def download(
        self,
        url: str,
        audio_only: bool = True
    ) -> DownloadResult:
        """
        下载视频（默认只下载音频轨，节省空间）

        Args:
            url: 视频 URL（YouTube/B站/抖音/通用）
            audio_only: 是否只提取音频

        Returns:
            DownloadResult:
                file_path: str    — 下载文件路径
                metadata: dict    — 标题/作者/时长/平台
        """
        ydl_opts = {
            "outtmpl": str(self.output_dir / "%(id)s.%(ext)s"),
            "quiet": True,
            "no_warnings": True,
        }

        if audio_only:
            ydl_opts.update({
                "format": "bestaudio/best",
                "postprocessors": [{
                    "key": "FFmpegExtractAudio",
                    "preferredcodec": "mp3",
                    "preferredquality": "192",
                }],
            })

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            file_path = ydl.prepare_filename(info)
            if audio_only:
                file_path = str(Path(file_path).with_suffix(".mp3"))

        return DownloadResult(
            file_path=file_path,
            metadata={
                "title": info.get("title"),
                "author": info.get("uploader"),
                "duration": info.get("duration"),
                "platform": info.get("extractor"),
                "url": url,
                "thumbnail": info.get("thumbnail"),
            }
        )
```

#### 4.4.4 WhisperTranscriber

```python
# content_pipeline/transcriber/whisper_transcriber.py
from faster_whisper import WhisperModel
from content_pipeline.models import TranscriptResult, TranscriptSegment
from core.config import settings

class WhisperTranscriber:
    """基于 faster-whisper 的本地音频转录"""

    def __init__(self):
        self._model: WhisperModel | None = None

    @property
    def model(self) -> WhisperModel:
        """懒加载模型（首次调用时加载，节省启动时间）"""
        if self._model is None:
            self._model = WhisperModel(
                settings.WHISPER_MODEL_SIZE,
                device=settings.WHISPER_DEVICE,
                compute_type="int8" if settings.WHISPER_DEVICE == "cpu" else "float16",
            )
        return self._model

    async def transcribe(
        self,
        audio_path: str,
        language: str | None = None,
    ) -> TranscriptResult:
        """
        转录音频文件

        Args:
            audio_path: 音频文件路径
            language: 指定语言（None 则自动检测）

        Returns:
            TranscriptResult:
                text: str                      — 完整转录文本
                segments: list[TranscriptSegment] — 带时间戳的分段
                language: str                  — 检测到的语言
                confidence: float              — 整体置信度
        """
        segments_iter, info = self.model.transcribe(
            audio_path,
            language=language or settings.WHISPER_LANGUAGE,
            beam_size=5,
            vad_filter=True,          # 过滤静音段
            vad_parameters=dict(
                min_silence_duration_ms=500,
            ),
        )

        segments = []
        full_text_parts = []

        for seg in segments_iter:
            segments.append(TranscriptSegment(
                start=seg.start,
                end=seg.end,
                text=seg.text.strip(),
                confidence=seg.avg_logprob,
            ))
            full_text_parts.append(seg.text.strip())

        avg_confidence = (
            sum(s.confidence for s in segments) / len(segments)
            if segments else 0.0
        )

        return TranscriptResult(
            text="\n".join(full_text_parts),
            segments=segments,
            language=info.language,
            confidence=avg_confidence,
        )
```

#### 4.4.5 LLMStructurer — LLM 结构化调度器

```python
# content_pipeline/structurer/llm_structurer.py
from content_pipeline.models import StructuredContent
from content_pipeline.structurer.processors.generic import GenericProcessor
from content_pipeline.structurer.processors.first_principles import FirstPrinciplesProcessor
from content_pipeline.structurer.processors.game_theory import GameTheoryProcessor
from content_pipeline.structurer.processors.base import BaseProcessor

class LLMStructurer:
    """
    LLM 结构化调度器
    根据 content_category 选择对应的 Processor 处理原始文本
    """

    def __init__(self):
        self._processors: dict[str, BaseProcessor] = {
            "generic": GenericProcessor(),
            "first_principles": FirstPrinciplesProcessor(),
            "game_theory": GameTheoryProcessor(),
        }

    def register_processor(self, category: str, processor: BaseProcessor):
        """动态注册新的 Processor"""
        self._processors[category] = processor

    async def structure(
        self,
        raw_text: str,
        content_category: str,
        source_metadata: dict,
    ) -> StructuredContent:
        """
        对原始文本进行结构化分析

        流程:
        1. 根据 content_category 选择 Processor
        2. 如果文本过长(>8000字)，分段处理后合并
        3. 调用 LLM 分析
        4. 解析 JSON 响应
        5. 校验输出 schema
        """
        processor = self._processors.get(
            content_category,
            self._processors["generic"]
        )

        # 长文本分段处理
        if len(raw_text) > 8000:
            return await self._process_long_text(processor, raw_text, source_metadata)

        return await processor.process(raw_text, source_metadata)

    async def _process_long_text(
        self,
        processor: BaseProcessor,
        text: str,
        metadata: dict,
    ) -> StructuredContent:
        """
        长文本处理策略：
        1. 将文本按 6000 字切分（保留 500 字 overlap）
        2. 每段独立分析
        3. 合并结果（去重 concepts、合并 examples）
        """
        # 实现细节见后文
        ...
```

#### 4.4.6 BaseProcessor — 处理器基类

```python
# content_pipeline/structurer/processors/base.py
from abc import ABC, abstractmethod
from langchain_openai import ChatOpenAI
from langchain.prompts import ChatPromptTemplate
from content_pipeline.models import StructuredContent
from core.config import settings
import json

class BaseProcessor(ABC):
    """所有内容处理器的基类"""

    def __init__(self):
        self.llm = ChatOpenAI(
            model=settings.LLM_MODEL,
            base_url=settings.LLM_BASE_URL,
            api_key=settings.LLM_API_KEY,
            temperature=settings.LLM_TEMPERATURE,
        )

    @property
    @abstractmethod
    def analysis_prompt(self) -> str:
        """子类必须实现：返回分析用的 prompt 模板"""
        pass

    async def process(
        self,
        text: str,
        source_metadata: dict,
    ) -> StructuredContent:
        """
        标准处理流程：
        1. 构建 prompt
        2. 调用 LLM
        3. 解析 JSON
        4. 校验并返回 StructuredContent
        """
        prompt = ChatPromptTemplate.from_template(self.analysis_prompt)
        chain = prompt | self.llm

        response = await chain.ainvoke({
            "content": text,
            "source_info": json.dumps(source_metadata, ensure_ascii=False),
        })

        # 从 LLM 响应中提取 JSON
        structured_data = self._parse_json(response.content)

        # 转为 Pydantic 模型（自动校验 schema）
        return StructuredContent(**structured_data)

    def _parse_json(self, text: str) -> dict:
        """
        从 LLM 响应中提取 JSON
        兼容三种格式：
        1. 纯 JSON
        2. ```json ... ``` 包裹
        3. 混合文本中的 JSON 块
        """
        # 尝试直接解析
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass

        # 尝试提取 ```json ... ```
        import re
        match = re.search(r'```(?:json)?\s*\n(.*?)\n```', text, re.DOTALL)
        if match:
            return json.loads(match.group(1))

        # 尝试提取 { ... } 块
        match = re.search(r'\{.*\}', text, re.DOTALL)
        if match:
            return json.loads(match.group(0))

        raise ValueError(f"无法从 LLM 响应中解析 JSON: {text[:200]}...")
```

#### 4.4.7 FirstPrinciplesProcessor — 第一性原理专用处理器

```python
# content_pipeline/structurer/processors/first_principles.py
from .base import BaseProcessor

class FirstPrinciplesProcessor(BaseProcessor):

    @property
    def analysis_prompt(self) -> str:
        return """你是一个专门分析"第一性原理"思维方法论的专家。

请分析以下内容，提取结构化信息。

## 提取要求

1. **核心概念**（concepts，3-5 个）
   - name: 概念名称
   - definition: 定义（50字以内）
   - source_chunk_id: 在原文中的大致位置描述

2. **方法论**（methodology，如果有明确的步骤方法）
   - name: 方法论名称
   - steps: 步骤列表，每步包含 step_number、description、example
   - source_chunk_id: 来源位置

3. **典型案例**（examples，1-3 个）
   - title: 案例标题
   - background: 背景（100字以内）
   - application: 第一性原理如何应用
   - outcome: 结果/启示
   - source_chunk_id: 来源位置

4. **关键引用**（key_quotes，3-5 条原文金句）
   - text: 引用原文
   - importance: 为什么重要（30字以内）
   - source_chunk_id: 来源位置
   - timestamp: 时间戳（仅音视频内容有）

5. **总结**（summary，200字以内）

## 来源信息
{source_info}

## 输出格式
严格以 JSON 格式输出，schema 如下：
```json
{{
  "concepts": [
    {{"name": "...", "definition": "...", "source_chunk_id": "..."}}
  ],
  "methodology": {{
    "name": "...",
    "steps": [
      {{"step_number": 1, "description": "...", "example": "..."}}
    ],
    "source_chunk_id": "..."
  }},
  "examples": [
    {{"title": "...", "background": "...", "application": "...", "outcome": "...", "source_chunk_id": "..."}}
  ],
  "key_quotes": [
    {{"text": "...", "importance": "...", "source_chunk_id": "...", "timestamp": null}}
  ],
  "summary": "..."
}}
```

---
待分析内容：
{content}
---"""
```

#### 4.4.8 ContentPipeline — 主编排类

```python
# content_pipeline/pipeline.py
from content_pipeline.models import (
    SourceType, ProcessingResult, ProcessingProgress, ExtractedContent
)
from content_pipeline.extractors.pdf import PDFExtractor
from content_pipeline.extractors.text import TextExtractor
from content_pipeline.extractors.audio import AudioExtractor
from content_pipeline.extractors.video import VideoExtractor
from content_pipeline.structurer.llm_structurer import LLMStructurer
from content_pipeline.enricher.metadata_enricher import MetadataEnricher
from kb.chunking import TextChunker
from kb.embeddings import EmbeddingGenerator
from kb.storage import ContentStore
from core.logging import logger
import time

class ContentPipeline:
    """
    内容处理主编排 — 串联 6 个步骤
    """

    def __init__(self):
        self.extractors = {
            SourceType.PDF: PDFExtractor(),
            SourceType.TEXT: TextExtractor(),
            SourceType.AUDIO: AudioExtractor(),
            SourceType.VIDEO: VideoExtractor(),
        }
        self.structurer = LLMStructurer()
        self.enricher = MetadataEnricher()
        self.chunker = TextChunker()
        self.embedder = EmbeddingGenerator()
        self.storage = ContentStore()

        # 进度跟踪（task_id -> ProcessingProgress）
        self._progress: dict[str, ProcessingProgress] = {}

    async def process(
        self,
        source: str,
        source_type: SourceType,
        content_category: str = "generic",
        task_id: str | None = None,
    ) -> ProcessingResult:
        """
        完整处理流程

        Args:
            source: 文件路径或 URL
            source_type: pdf | text | audio | video
            content_category: first_principles | game_theory | generic
            task_id: 任务 ID（用于进度跟踪）
        """
        start_time = time.time()
        task_id = task_id or f"task_{int(time.time())}"

        try:
            # Step 1: EXTRACT
            self._update_progress(task_id, "extracting", 10, "正在提取内容...")
            extractor = self.extractors[source_type]
            extracted = await extractor.extract(source)
            logger.info(f"[{task_id}] 提取完成，文本长度: {len(extracted.text)}")

            # Step 2: STRUCTURE
            self._update_progress(task_id, "structuring", 30, "正在进行 LLM 结构化分析...")
            structured = await self.structurer.structure(
                extracted.text, content_category, extracted.metadata
            )
            logger.info(f"[{task_id}] 结构化完成，概念数: {len(structured.concepts)}")

            # Step 3: ENRICH
            self._update_progress(task_id, "enriching", 50, "正在生成元数据...")
            metadata = self.enricher.enrich(structured, extracted.metadata)

            # Step 4: CHUNK
            self._update_progress(task_id, "chunking", 60, "正在切片...")
            chunks = self.chunker.chunk(
                extracted.text,
                source_id=metadata.source_id,
            )
            logger.info(f"[{task_id}] 切片完成，chunks 数: {len(chunks)}")

            # Step 5: EMBED
            self._update_progress(task_id, "embedding", 75, "正在向量化...")
            embeddings = self.embedder.embed([c.text for c in chunks])

            # Step 6: STORE
            self._update_progress(task_id, "storing", 90, "正在存储...")
            store_result = self.storage.store(
                source_id=metadata.source_id,
                raw_content=extracted,
                structured_content=structured,
                chunks=chunks,
                embeddings=embeddings,
                metadata=metadata,
            )

            self._update_progress(task_id, "completed", 100, "处理完成")

            return ProcessingResult(
                task_id=task_id,
                source_id=metadata.source_id,
                status="completed",
                structured_content=structured,
                metadata=metadata,
                markdown_path=store_result.markdown_path,
                json_path=store_result.json_path,
                chunks_count=len(chunks),
                processing_time=time.time() - start_time,
            )

        except Exception as e:
            logger.error(f"[{task_id}] 处理失败: {e}")
            self._update_progress(task_id, "failed", 0, f"处理失败: {str(e)}")
            raise

    def get_progress(self, task_id: str) -> ProcessingProgress | None:
        return self._progress.get(task_id)

    def _update_progress(self, task_id: str, status: str, percent: int, message: str):
        self._progress[task_id] = ProcessingProgress(
            task_id=task_id,
            status=status,
            current_step=status,
            progress_percent=percent,
            message=message,
        )
```

---

## 5. 模块三：知识库存储层

### 5.1 存储架构

```
kb_storage/                         # settings.KB_STORAGE_DIR
├── raw/                            # 原始文件（不做任何加工）
│   ├── pdf/
│   │   └── src_fp_book_001.pdf
│   ├── audio/
│   │   └── src_podcast_001.mp3
│   ├── video/
│   │   └── src_youtube_001.mp3     # 只保留音频
│   └── transcripts/
│       └── src_youtube_001.txt     # 转录原文
│
├── structured/                     # 结构化 JSON
│   └── src_fp_book_001.json        # StructuredContent 序列化
│
├── references/                     # Skills Reference Markdown
│   ├── first_principles/
│   │   └── src_fp_book_001.md
│   ├── game_theory/
│   │   └── src_game_book_001.md
│   └── generic/
│       └── src_podcast_001.md
│
└── vector/                         # 向量数据库持久化
    └── chroma/                     # Chroma 数据目录
```

### 5.2 目录结构

```
kb/
├── __init__.py
├── chunking.py          # TextChunker: 文本切片
├── embeddings.py        # EmbeddingGenerator: 向量生成
├── vector_store.py      # ChromaVectorStore / PgVectorStore
├── storage.py           # ContentStore: 分层存储编排
├── retriever.py         # KnowledgeRetriever: 检索（模块六详述）
└── markdown_renderer.py # Markdown Reference 生成器
```

### 5.3 核心类

#### 5.3.1 TextChunker — 文本切片

```python
# kb/chunking.py
from dataclasses import dataclass

@dataclass
class Chunk:
    chunk_id: str        # 格式: {source_id}#c{序号}
    text: str
    source_id: str
    chunk_index: int
    start_char: int      # 在原文中的起始位置
    end_char: int
    metadata: dict       # 附加元数据

class TextChunker:
    """
    文本切片器

    策略：
    - 按固定窗口切片，保留 overlap 确保上下文连贯
    - 尽量在句号/换行处断开，避免切在句子中间
    """

    def __init__(
        self,
        chunk_size: int = 500,
        overlap: int = 50,
    ):
        self.chunk_size = chunk_size
        self.overlap = overlap

    def chunk(
        self,
        text: str,
        source_id: str,
        extra_metadata: dict | None = None,
    ) -> list[Chunk]:
        """
        切片逻辑：
        1. 按 chunk_size 步进
        2. 每个窗口向前/后扩展到最近的句号或换行
        3. 保留 overlap 字符的重叠
        4. 生成 chunk_id = {source_id}#c{index}
        """
        chunks = []
        start = 0
        index = 0

        while start < len(text):
            end = min(start + self.chunk_size, len(text))

            # 尝试在句号/换行处断开
            if end < len(text):
                for sep in ["\n\n", "\n", "。", ".", "！", "？"]:
                    last_sep = text.rfind(sep, start, end)
                    if last_sep > start + self.chunk_size // 2:
                        end = last_sep + len(sep)
                        break

            chunk_text = text[start:end].strip()
            if chunk_text:
                chunks.append(Chunk(
                    chunk_id=f"{source_id}#c{index:03d}",
                    text=chunk_text,
                    source_id=source_id,
                    chunk_index=index,
                    start_char=start,
                    end_char=end,
                    metadata=extra_metadata or {},
                ))
                index += 1

            start = end - self.overlap

        return chunks
```

#### 5.3.2 EmbeddingGenerator — 向量生成

```python
# kb/embeddings.py
from sentence_transformers import SentenceTransformer
from core.config import settings

class EmbeddingGenerator:
    """嵌入向量生成器（懒加载模型）"""

    def __init__(self):
        self._model: SentenceTransformer | None = None

    @property
    def model(self) -> SentenceTransformer:
        if self._model is None:
            self._model = SentenceTransformer(settings.EMBEDDING_MODEL)
        return self._model

    def embed(self, texts: list[str]) -> list[list[float]]:
        """批量生成嵌入向量"""
        embeddings = self.model.encode(
            texts,
            normalize_embeddings=True,  # L2 归一化，便于余弦相似度
            batch_size=32,
            show_progress_bar=False,
        )
        return embeddings.tolist()

    def embed_query(self, query: str) -> list[float]:
        """单条 query 嵌入"""
        return self.embed([query])[0]
```

#### 5.3.3 ChromaVectorStore

```python
# kb/vector_store.py
import chromadb
from kb.chunking import Chunk
from core.config import settings

class ChromaVectorStore:
    """Chroma 向量数据库封装"""

    COLLECTION_NAME = "knowledge_base"

    def __init__(self):
        self.client = chromadb.PersistentClient(
            path=settings.CHROMA_PERSIST_DIR
        )
        self.collection = self.client.get_or_create_collection(
            name=self.COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"},  # 余弦相似度
        )

    def add_chunks(
        self,
        chunks: list[Chunk],
        embeddings: list[list[float]],
    ):
        """批量添加 chunks 到向量库"""
        self.collection.add(
            ids=[c.chunk_id for c in chunks],
            embeddings=embeddings,
            documents=[c.text for c in chunks],
            metadatas=[{
                "source_id": c.source_id,
                "chunk_index": c.chunk_index,
                **c.metadata,
            } for c in chunks],
        )

    def query(
        self,
        query_embedding: list[float],
        top_k: int = 5,
        where: dict | None = None,
    ) -> dict:
        """向量相似度查询"""
        kwargs = {
            "query_embeddings": [query_embedding],
            "n_results": top_k,
            "include": ["documents", "metadatas", "distances"],
        }
        if where:
            kwargs["where"] = where
        return self.collection.query(**kwargs)

    def delete_by_source(self, source_id: str):
        """删除某个 source 的所有 chunks"""
        self.collection.delete(where={"source_id": source_id})

    def count(self) -> int:
        return self.collection.count()
```

#### 5.3.4 ContentStore — 分层存储编排

```python
# kb/storage.py
import json
from pathlib import Path
from content_pipeline.models import (
    ExtractedContent, StructuredContent, EnrichedMetadata
)
from kb.chunking import Chunk
from kb.vector_store import ChromaVectorStore
from kb.markdown_renderer import MarkdownRenderer
from core.config import settings
from dataclasses import dataclass

@dataclass
class StoreResult:
    source_id: str
    raw_path: str
    json_path: str
    markdown_path: str

class ContentStore:
    """分层存储管理器"""

    def __init__(self):
        self.vector_store = ChromaVectorStore()
        self.renderer = MarkdownRenderer()

        # 确保目录存在
        for d in [settings.RAW_DIR, settings.STRUCTURED_DIR, settings.REFERENCES_DIR]:
            d.mkdir(parents=True, exist_ok=True)

    def store(
        self,
        source_id: str,
        raw_content: ExtractedContent,
        structured_content: StructuredContent,
        chunks: list[Chunk],
        embeddings: list[list[float]],
        metadata: EnrichedMetadata,
    ) -> StoreResult:

        # 1. 存储结构化 JSON
        json_path = settings.STRUCTURED_DIR / f"{source_id}.json"
        json_path.write_text(
            json.dumps(structured_content.model_dump(), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        # 2. 生成并存储 Markdown Reference
        md_content = self.renderer.render(structured_content, metadata)
        category_dir = settings.REFERENCES_DIR / metadata.content_category
        category_dir.mkdir(parents=True, exist_ok=True)
        md_path = category_dir / f"{source_id}.md"
        md_path.write_text(md_content, encoding="utf-8")

        # 3. 存储向量
        self.vector_store.add_chunks(chunks, embeddings)

        return StoreResult(
            source_id=source_id,
            raw_path=raw_content.raw_path,
            json_path=str(json_path),
            markdown_path=str(md_path),
        )
```

#### 5.3.5 MarkdownRenderer — Markdown Reference 生成

```python
# kb/markdown_renderer.py
from content_pipeline.models import StructuredContent, EnrichedMetadata

class MarkdownRenderer:
    """将结构化内容渲染为人类可读的 Markdown 文档"""

    def render(
        self,
        content: StructuredContent,
        metadata: EnrichedMetadata,
    ) -> str:
        parts = []

        # 标题 & 元信息
        parts.append(f"# {metadata.title}\n")
        parts.append(f"| 字段 | 值 |")
        parts.append(f"|------|------|")
        parts.append(f"| **来源类型** | {metadata.source_type} |")
        if metadata.author:
            parts.append(f"| **作者** | {metadata.author} |")
        parts.append(f"| **主题** | {', '.join(metadata.topics)} |")
        parts.append(f"| **关联技能** | {', '.join(metadata.applicable_skills)} |")
        parts.append(f"| **可信度** | {metadata.credibility} |")
        parts.append(f"| **语言** | {metadata.language} |")
        parts.append(f"| **Source ID** | `{metadata.source_id}` |")
        parts.append("")

        # 总结
        parts.append(f"## 总结\n")
        parts.append(f"{content.summary}\n")

        # 核心概念
        if content.concepts:
            parts.append(f"## 核心概念\n")
            for i, c in enumerate(content.concepts, 1):
                parts.append(f"### {i}. {c.name}")
                parts.append(f"**定义**: {c.definition}")
                parts.append(f"**引用位置**: `[{c.source_chunk_id}]`\n")

        # 方法论
        if content.methodology:
            parts.append(f"## 方法论: {content.methodology.name}\n")
            for step in content.methodology.steps:
                parts.append(f"{step.step_number}. **{step.description}**")
                if step.example:
                    parts.append(f"   > 示例: {step.example}")
            parts.append("")

        # 典型案例
        if content.examples:
            parts.append(f"## 典型案例\n")
            for ex in content.examples:
                parts.append(f"### {ex.title}")
                parts.append(f"- **背景**: {ex.background}")
                parts.append(f"- **应用**: {ex.application}")
                parts.append(f"- **结果**: {ex.outcome}")
                parts.append(f"- **引用**: `[{ex.source_chunk_id}]`\n")

        # 关键引用
        if content.key_quotes:
            parts.append(f"## 关键引用\n")
            for q in content.key_quotes:
                ts = f" [{q.timestamp}]" if q.timestamp else ""
                parts.append(f'- > "{q.text}"{ts}')
                parts.append(f"  — {q.importance} `[{q.source_chunk_id}]`\n")

        return "\n".join(parts)
```

---

## 6. 模块四：Skills 体系

### 6.1 设计理念

**Skill = 方法论的代码化封装**。每个 Skill 是一个独立、可测试、可复用的单元。

核心原则：
- **声明式定义**：用 YAML + JSON Schema 描述 Skill 的输入/输出/策略
- **Prompt 固定**：每个 Skill 有固定的 prompt 模板，保证输出结构稳定
- **可测试**：每个 Skill 至少有 1-3 个回归测试用例
- **可独立运行**：Skill 不依赖 Agent，可单独调用

### 6.2 Skill 目录结构

```
skills/
├── __init__.py
├── registry.py                      # SkillRegistry: 扫描/加载所有 Skills
├── executor.py                      # SkillExecutor: 执行 Skill
├── models.py                        # Skill 相关 Pydantic 模型
│
├── first_principles_analysis/       # Skill 1: 第一性原理分析
│   ├── manifest.yaml                # Skill 声明
│   ├── prompt.md                    # Prompt 模板
│   ├── schema.json                  # 输出 JSON Schema
│   └── tests/
│       ├── test_case_01.json        # 测试用例
│       └── test_case_02.json
│
├── game_theory_analysis/            # Skill 2: 博弈论分析
│   ├── manifest.yaml
│   ├── prompt.md
│   ├── schema.json
│   └── tests/
│
├── summary_with_citations/          # Skill 3: 结构化总结
│   ├── ...
│
├── decision_memo/                   # Skill 4: 决策备忘录
│   ├── ...
│
├── work_retrospective/              # Skill 5: 工作复盘
│   ├── ...
│
├── negotiation_strategy/            # Skill 6: 谈判策略
│   ├── ...
│
├── action_plan/                     # Skill 7: 行动计划
│   ├── ...
│
└── sawei_personality_profile/       # Skill 8: 赛维人格画像
    ├── ...
```

### 6.3 manifest.yaml 规范（以 first_principles_analysis 为例）

```yaml
# skills/first_principles_analysis/manifest.yaml

skill_id: first_principles_analysis
version: "1.0.0"
name: "第一性原理分析"
purpose: "用第一性原理方法拆解和分析问题，找到本质原因和最优解决路径"
category: "thinking_framework"

# === 输入定义 ===
inputs:
  - name: problem
    type: string
    required: true
    description: "需要分析的问题或决策"
  - name: context
    type: string
    required: false
    description: "问题的背景信息"
  - name: constraints
    type: array
    required: false
    description: "已知约束条件"

# === 输出定义 ===
outputs:
  - name: analysis
    type: object
    schema_ref: schema.json

# === 检索策略 ===
retrieval_policy:
  enabled: true
  category: first_principles    # 从该类别的知识库检索
  top_k: 5
  min_score: 0.6                # 最低相似度阈值

# === 质量检查 ===
quality_checks:
  check_citations: true         # 结论必须有引用支撑
  check_structure: true         # 输出必须符合 schema
  min_concepts: 2               # 至少 2 个核心拆解点
  max_selfcheck_loops: 2        # 自检最多循环 2 次

# === 引用说明 ===
reference_dirs:
  - "kb_storage/references/first_principles/"
```

### 6.4 prompt.md 规范

```markdown
<!-- skills/first_principles_analysis/prompt.md -->

# System Prompt

你是一位第一性原理分析专家。你的任务是运用第一性原理思维方法，帮助用户拆解问题、
找到本质、设计解决路径。

## 分析框架（四步法）

### Step 1: 拆解目标
将问题分解为最基本的组成要素，去除所有假设和类比。

### Step 2: 识别约束
找出真正的物理/逻辑约束（不可突破的）和假定约束（可以挑战的）。

### Step 3: 分析变量
识别关键变量和它们之间的因果关系。

### Step 4: 设计路径
基于基本要素，从零开始设计最优解决路径。

## 参考知识库
{references}

## 用户问题
{problem}

## 背景信息
{context}

## 已知约束
{constraints}

## 输出要求
请严格按以下 JSON 格式输出：
{output_schema}
```

### 6.5 核心类

> **TODO: 在此处插入 [Skills 体系类图] — 文件: `diagrams/05_class_diagrams.drawio` (Sheet: Skills)**

#### 6.5.1 SkillRegistry — Skill 注册中心

```python
# skills/registry.py
import yaml
from pathlib import Path
from skills.models import SkillManifest

class SkillRegistry:
    """
    Skill 注册中心
    启动时扫描 skills/ 目录，加载所有 Skill 定义
    """

    def __init__(self, skills_dir: str = "skills"):
        self.skills_dir = Path(skills_dir)
        self._skills: dict[str, SkillManifest] = {}
        self._load_all()

    def _load_all(self):
        """扫描 skills/ 下所有子目录，加载 manifest.yaml"""
        for skill_dir in self.skills_dir.iterdir():
            manifest_path = skill_dir / "manifest.yaml"
            if skill_dir.is_dir() and manifest_path.exists():
                with open(manifest_path, "r", encoding="utf-8") as f:
                    data = yaml.safe_load(f)
                manifest = SkillManifest(**data, base_dir=str(skill_dir))
                self._skills[manifest.skill_id] = manifest

    def list_skills(self) -> list[SkillManifest]:
        """返回所有已注册的 Skill"""
        return list(self._skills.values())

    def get_skill(self, skill_id: str) -> SkillManifest | None:
        return self._skills.get(skill_id)

    def get_skill_ids(self) -> list[str]:
        return list(self._skills.keys())

    def get_skills_summary(self) -> str:
        """生成 Skill 列表摘要（给 LLM 路由用）"""
        lines = []
        for s in self._skills.values():
            lines.append(f"- {s.skill_id}: {s.purpose}")
        return "\n".join(lines)
```

#### 6.5.2 SkillExecutor — Skill 执行器

```python
# skills/executor.py
import json
from pathlib import Path
from langchain_openai import ChatOpenAI
from langchain.prompts import ChatPromptTemplate
from skills.registry import SkillRegistry
from skills.models import SkillManifest, SkillOutput
from kb.retriever import KnowledgeRetriever
from core.config import settings
from core.logging import logger

class SkillExecutor:
    """
    Skill 执行器
    负责：加载 Skill → 加载 Reference → 检索知识 → 构建 Prompt → 调用 LLM → 校验输出
    """

    def __init__(self, registry: SkillRegistry, retriever: KnowledgeRetriever):
        self.registry = registry
        self.retriever = retriever
        self.llm = ChatOpenAI(
            model=settings.LLM_MODEL,
            base_url=settings.LLM_BASE_URL,
            api_key=settings.LLM_API_KEY,
            temperature=settings.LLM_TEMPERATURE,
        )

    async def execute(
        self,
        skill_id: str,
        inputs: dict,
        retrieval_results: list | None = None,
    ) -> SkillOutput:
        """
        执行一个 Skill

        Args:
            skill_id: Skill 标识
            inputs: 用户输入（problem, context, constraints 等）
            retrieval_results: 预先检索的知识（如果有）
        """
        manifest = self.registry.get_skill(skill_id)
        if not manifest:
            raise ValueError(f"Skill not found: {skill_id}")

        # 1. 加载 prompt 模板
        prompt_template = self._load_prompt(manifest)

        # 2. 加载 Skills Reference（知识库中该 Skill 关联的 Markdown 文档）
        references = self._load_references(manifest)

        # 3. 加载输出 schema
        output_schema = self._load_schema(manifest)

        # 4. 组装 retrieval context
        retrieval_context = ""
        if retrieval_results:
            retrieval_context = "\n\n".join([
                f"[{r.chunk_id}] {r.text}" for r in retrieval_results
            ])

        # 5. 构建完整 prompt
        prompt = ChatPromptTemplate.from_template(prompt_template)
        chain = prompt | self.llm

        response = await chain.ainvoke({
            **inputs,
            "references": references,
            "retrieval_context": retrieval_context,
            "output_schema": json.dumps(output_schema, ensure_ascii=False, indent=2),
        })

        # 6. 解析输出
        result_data = self._parse_json(response.content)

        # 7. 校验 schema（可选 - 用 jsonschema 验证）
        # jsonschema.validate(result_data, output_schema)

        return SkillOutput(
            skill_id=skill_id,
            result=result_data,
            raw_response=response.content,
            citations=[],  # 从 retrieval_results 中提取
        )

    def _load_prompt(self, manifest: SkillManifest) -> str:
        prompt_path = Path(manifest.base_dir) / "prompt.md"
        return prompt_path.read_text(encoding="utf-8")

    def _load_schema(self, manifest: SkillManifest) -> dict:
        schema_path = Path(manifest.base_dir) / "schema.json"
        return json.loads(schema_path.read_text(encoding="utf-8"))

    def _load_references(self, manifest: SkillManifest) -> str:
        """加载关联的 Markdown Reference 文档"""
        refs = []
        for ref_dir in manifest.reference_dirs:
            ref_path = Path(ref_dir)
            if ref_path.exists():
                for md_file in ref_path.glob("*.md"):
                    refs.append(md_file.read_text(encoding="utf-8"))
        return "\n\n---\n\n".join(refs) if refs else "(暂无参考资料)"

    def _parse_json(self, text: str) -> dict:
        """同 BaseProcessor._parse_json"""
        import re
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            match = re.search(r'```(?:json)?\s*\n(.*?)\n```', text, re.DOTALL)
            if match:
                return json.loads(match.group(1))
            match = re.search(r'\{.*\}', text, re.DOTALL)
            if match:
                return json.loads(match.group(0))
            raise
```

### 6.6 八大 MVP Skills 概览

| Skill ID | 名称 | 用途 | 核心输出 |
|----------|------|------|----------|
| `first_principles_analysis` | 第一性原理分析 | 拆解问题找本质 | 基本要素、约束、变量、最优路径 |
| `game_theory_analysis` | 博弈论分析 | 分析参与者/策略/收益 | 参与者、策略空间、收益矩阵、建议策略 |
| `sawei_personality_profile` | 赛维人格画像 | 分析人格特征 | 人格维度、沟通建议、合作策略 |
| `work_retrospective` | 工作复盘 | 结构化复盘 | 事实、原因、改进、行动项 |
| `negotiation_strategy` | 谈判策略 | 谈判准备 | 底线、锚点、让步策略、话术 |
| `decision_memo` | 决策备忘录 | 决策分析 | 选项、取舍、风险、建议 |
| `action_plan` | 行动计划 | 任务规划 | 里程碑、Owner、风险、验收标准 |
| `summary_with_citations` | 结构化总结 | 带引用的总结 | 要点、论据、引用列表 |

---

## 7. 模块五：LangGraph Agent 编排

### 7.1 状态机设计

> **TODO: 在此处插入 [LangGraph Agent 状态机图] — 文件: `diagrams/03_langgraph_state_machine.drawio`**

Agent 核心流程是一个 **有条件分支和循环的状态图**：

```
START
  │
  ▼
[Intake] ── 理解用户意图，生成 intent
  │
  ▼
[Route] ── 根据 intent 选择 Skill(s)
  │
  ├── 需要追问 ──▶ [AskBack] ── 生成追问问题 → 返回用户
  │                                │
  │                   用户回复 ◀───┘
  │
  ▼
[Retrieve] ── 从知识库检索相关 evidence + citations
  │
  ▼
[Execute] ── 执行选定的 Skill(s)
  │
  ▼
[SelfCheck] ── 检查输出质量
  │
  ├── 不合格 (循环 < N 次) ──▶ 回到 [Execute]
  │
  ▼
[Finalize] ── 汇总输出 Markdown + JSON + citations
  │
  ▼
END
```

### 7.2 目录结构

```
agent/
├── __init__.py
├── graph.py           # build_agent_graph(): LangGraph StateGraph 定义
├── state.py           # AgentState: TypedDict 状态定义
├── nodes/             # 各节点实现
│   ├── __init__.py
│   ├── intake.py      # intake_node: 意图理解
│   ├── router.py      # route_node: Skill 路由
│   ├── askback.py     # askback_node: 追问生成
│   ├── retrieve.py    # retrieve_node: RAG 检索
│   ├── execute.py     # execute_node: Skill 执行
│   ├── selfcheck.py   # selfcheck_node: 质量自检
│   └── finalize.py    # finalize_node: 输出汇总
├── trace_store.py     # TraceStore: trace 落盘
└── prompts/           # 各节点用到的 prompt 模板
    ├── intake.md
    ├── router.md
    ├── askback.md
    └── selfcheck.md
```

### 7.3 AgentState — 状态定义

```python
# agent/state.py
from typing import TypedDict
from content_pipeline.models import StructuredContent

class Citation(TypedDict):
    source_id: str
    chunk_id: str
    quote_hint: str

class RetrievalResult(TypedDict):
    chunk_id: str
    text: str
    source_id: str
    score: float

class SkillOutput(TypedDict):
    skill_id: str
    result: dict
    raw_response: str
    citations: list[Citation]

class AgentState(TypedDict):
    """LangGraph 状态 — 贯穿整个对话流程"""

    # 请求标识
    thread_id: str                        # 会话 ID
    request_id: str                       # 本次请求 ID

    # 用户输入
    user_query: str                       # 用户原始问题
    messages: list[dict]                  # 完整对话历史

    # Intake 输出
    intent: str                           # 意图分类
    intent_detail: str                    # 意图详细描述

    # Route 输出
    skill_plan: list[str]                 # 选定的 Skill ID 列表
    needs_askback: bool                   # 是否需要追问
    askback_questions: list[str]          # 追问问题列表

    # Retrieve 输出
    retrieval_results: list[RetrievalResult]  # 检索结果

    # Execute 输出
    skill_outputs: list[SkillOutput]      # Skill 执行结果

    # SelfCheck 输出
    selfcheck_passed: bool                # 自检是否通过
    selfcheck_feedback: str               # 自检反馈
    selfcheck_count: int                  # 已自检次数

    # Finalize 输出
    final_markdown: str                   # 最终 Markdown 输出
    final_citations: list[Citation]       # 最终引用列表
    confidence: str                       # low | medium | high

    # 审计
    audit_log: list[dict]                 # 每步操作记录
```

### 7.4 Graph 构建

```python
# agent/graph.py
from langgraph.graph import StateGraph, END
from agent.state import AgentState
from agent.nodes.intake import intake_node
from agent.nodes.router import route_node
from agent.nodes.askback import askback_node
from agent.nodes.retrieve import retrieve_node
from agent.nodes.execute import execute_node
from agent.nodes.selfcheck import selfcheck_node
from agent.nodes.finalize import finalize_node
from core.config import settings

def should_askback(state: AgentState) -> str:
    """路由条件：是否需要追问"""
    if state.get("needs_askback"):
        return "askback"
    return "retrieve"

def should_retry(state: AgentState) -> str:
    """自检条件：是否需要重试"""
    if (
        not state.get("selfcheck_passed")
        and state.get("selfcheck_count", 0) < settings.AGENT_MAX_SELFCHECK_LOOPS
    ):
        return "execute"  # 重新执行
    return "finalize"

def build_agent_graph() -> StateGraph:
    """
    构建 LangGraph Agent 状态图

    流程:
    Intake → Route → [AskBack | Retrieve] → Execute → SelfCheck → [Execute | Finalize]
    """
    graph = StateGraph(AgentState)

    # 添加节点
    graph.add_node("intake", intake_node)
    graph.add_node("route", route_node)
    graph.add_node("askback", askback_node)
    graph.add_node("retrieve", retrieve_node)
    graph.add_node("execute", execute_node)
    graph.add_node("selfcheck", selfcheck_node)
    graph.add_node("finalize", finalize_node)

    # 添加边
    graph.set_entry_point("intake")
    graph.add_edge("intake", "route")

    # Route 后的条件分支
    graph.add_conditional_edges("route", should_askback, {
        "askback": "askback",
        "retrieve": "retrieve",
    })

    graph.add_edge("askback", END)          # 追问后中断，等用户回复
    graph.add_edge("retrieve", "execute")

    # SelfCheck 后的条件分支
    graph.add_conditional_edges("selfcheck", should_retry, {
        "execute": "execute",
        "finalize": "finalize",
    })

    graph.add_edge("execute", "selfcheck")
    graph.add_edge("finalize", END)

    return graph.compile()

# 全局实例
agent_graph = build_agent_graph()
```

### 7.5 各节点实现

#### 7.5.1 Intake Node — 意图理解

```python
# agent/nodes/intake.py
from langchain_openai import ChatOpenAI
from agent.state import AgentState
from core.config import settings

INTAKE_PROMPT = """你是一个意图理解模块。分析用户的问题，输出：

1. intent: 意图分类，以下之一：
   - skill_request: 需要使用特定方法论/技能分析
   - knowledge_query: 查询知识库中的信息
   - general_chat: 普通闲聊
   - unclear: 意图不明确

2. intent_detail: 一句话描述用户想要什么

用户消息：{user_query}

以 JSON 格式输出：
{{"intent": "...", "intent_detail": "..."}}"""

async def intake_node(state: AgentState) -> dict:
    llm = ChatOpenAI(
        model=settings.LLM_MODEL,
        base_url=settings.LLM_BASE_URL,
        api_key=settings.LLM_API_KEY,
    )
    response = await llm.ainvoke(
        INTAKE_PROMPT.format(user_query=state["user_query"])
    )
    result = _parse_json(response.content)

    return {
        "intent": result.get("intent", "general_chat"),
        "intent_detail": result.get("intent_detail", ""),
        "audit_log": state.get("audit_log", []) + [{
            "node": "intake",
            "intent": result.get("intent"),
        }],
    }
```

#### 7.5.2 Route Node — Skill 路由

```python
# agent/nodes/router.py
from langchain_openai import ChatOpenAI
from agent.state import AgentState
from skills.registry import SkillRegistry
from core.config import settings

registry = SkillRegistry()

ROUTE_PROMPT = """你是一个 Skill 路由器。根据用户意图，选择最合适的 Skill(s)。

可用 Skills:
{skills_summary}

用户意图: {intent_detail}
用户原始问题: {user_query}

请决定:
1. skill_plan: 选择哪些 Skill（ID 列表，可多选，按优先级排序）
2. needs_askback: 是否需要追问用户补充信息（true/false）
3. askback_questions: 如果需要追问，列出问题

以 JSON 格式输出:
{{
  "skill_plan": ["skill_id_1"],
  "needs_askback": false,
  "askback_questions": []
}}"""

async def route_node(state: AgentState) -> dict:
    llm = ChatOpenAI(
        model=settings.LLM_MODEL,
        base_url=settings.LLM_BASE_URL,
        api_key=settings.LLM_API_KEY,
    )
    response = await llm.ainvoke(
        ROUTE_PROMPT.format(
            skills_summary=registry.get_skills_summary(),
            intent_detail=state.get("intent_detail", ""),
            user_query=state["user_query"],
        )
    )
    result = _parse_json(response.content)

    return {
        "skill_plan": result.get("skill_plan", []),
        "needs_askback": result.get("needs_askback", False),
        "askback_questions": result.get("askback_questions", []),
    }
```

#### 7.5.3 SelfCheck Node — 质量自检

```python
# agent/nodes/selfcheck.py
from langchain_openai import ChatOpenAI
from agent.state import AgentState
from core.config import settings

SELFCHECK_PROMPT = """你是一个输出质量审核员。检查以下 Agent 输出是否合格。

## 检查项
1. **引用完整性**: 结论是否都有知识库引用支撑？（不能空口无凭）
2. **结构合规性**: 输出是否符合要求的 JSON schema？
3. **逻辑一致性**: 分析过程是否自洽？
4. **答非所问**: 是否回答了用户的实际问题？

## 用户原始问题
{user_query}

## Agent 输出
{skill_output}

## 判定
以 JSON 格式输出:
{{
  "passed": true/false,
  "feedback": "具体反馈（如果不合格，说明哪里不行、如何改进）"
}}"""

async def selfcheck_node(state: AgentState) -> dict:
    llm = ChatOpenAI(
        model=settings.LLM_MODEL,
        base_url=settings.LLM_BASE_URL,
        api_key=settings.LLM_API_KEY,
    )

    # 取最新的 skill output
    latest_output = state.get("skill_outputs", [{}])[-1]

    response = await llm.ainvoke(
        SELFCHECK_PROMPT.format(
            user_query=state["user_query"],
            skill_output=str(latest_output),
        )
    )
    result = _parse_json(response.content)

    return {
        "selfcheck_passed": result.get("passed", True),
        "selfcheck_feedback": result.get("feedback", ""),
        "selfcheck_count": state.get("selfcheck_count", 0) + 1,
    }
```

### 7.6 TraceStore — 审计落盘

```python
# agent/trace_store.py
import json
from datetime import datetime
from pathlib import Path
from agent.state import AgentState

class TraceStore:
    """Agent 执行 trace 持久化（JSONL 格式）"""

    def __init__(self, trace_dir: str = "./traces"):
        self.trace_dir = Path(trace_dir)
        self.trace_dir.mkdir(parents=True, exist_ok=True)

    def save(self, state: AgentState):
        trace_file = self.trace_dir / f"{datetime.now():%Y-%m-%d}.jsonl"
        record = {
            "timestamp": datetime.now().isoformat(),
            "thread_id": state.get("thread_id"),
            "request_id": state.get("request_id"),
            "user_query": state.get("user_query"),
            "intent": state.get("intent"),
            "skill_plan": state.get("skill_plan"),
            "selfcheck_passed": state.get("selfcheck_passed"),
            "selfcheck_count": state.get("selfcheck_count"),
            "confidence": state.get("confidence"),
            "citations_count": len(state.get("final_citations", [])),
            "audit_log": state.get("audit_log"),
        }
        with open(trace_file, "a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
```

---

## 8. 模块六：RAG 检索系统

### 8.1 检索流程

```
用户 Query
  │
  ▼
Query Embedding (bge-small-zh-v1.5)
  │
  ▼
向量相似度检索 (Chroma)
  ├── where filter: content_category（可选）
  └── top_k: 5（可配置）
  │
  ▼
结果排序 & 过滤 (min_score 阈值)
  │
  ▼
生成 Citations
  ├── source_id
  ├── chunk_id
  └── quote_hint（chunk 文本摘要）
  │
  ▼
返回 list[RetrievalResult]
```

### 8.2 KnowledgeRetriever

```python
# kb/retriever.py
from dataclasses import dataclass
from kb.vector_store import ChromaVectorStore
from kb.embeddings import EmbeddingGenerator
from core.config import settings

@dataclass
class RetrievalResult:
    chunk_id: str
    text: str
    source_id: str
    score: float          # 相似度得分 (0-1, 越高越相关)
    metadata: dict

@dataclass
class Citation:
    source_id: str
    chunk_id: str
    quote_hint: str       # chunk 文本的前 80 字

class KnowledgeRetriever:
    """知识库检索器"""

    def __init__(self):
        self.vector_store = ChromaVectorStore()
        self.embedder = EmbeddingGenerator()

    def retrieve(
        self,
        query: str,
        category: str | None = None,
        top_k: int | None = None,
        min_score: float = 0.5,
    ) -> list[RetrievalResult]:
        """
        检索最相关的知识 chunks

        Args:
            query: 用户查询文本
            category: 限定检索的内容类别（first_principles 等）
            top_k: 返回条数
            min_score: 最低相似度阈值
        """
        top_k = top_k or settings.RETRIEVAL_TOP_K

        # 1. 生成 query embedding
        query_embedding = self.embedder.embed_query(query)

        # 2. 构建 filter
        where = None
        if category:
            where = {"content_category": category}

        # 3. 查询 Chroma
        raw_results = self.vector_store.query(
            query_embedding=query_embedding,
            top_k=top_k,
            where=where,
        )

        # 4. 转换 & 过滤
        results = []
        for i in range(len(raw_results["ids"][0])):
            distance = raw_results["distances"][0][i]
            score = 1 - distance  # Chroma cosine distance → similarity

            if score >= min_score:
                results.append(RetrievalResult(
                    chunk_id=raw_results["ids"][0][i],
                    text=raw_results["documents"][0][i],
                    source_id=raw_results["metadatas"][0][i].get("source_id", ""),
                    score=score,
                    metadata=raw_results["metadatas"][0][i],
                ))

        # 按 score 降序排列
        results.sort(key=lambda r: r.score, reverse=True)
        return results

    def retrieve_with_citations(
        self,
        query: str,
        category: str | None = None,
        top_k: int | None = None,
    ) -> tuple[list[RetrievalResult], list[Citation]]:
        """检索并自动生成 citations"""
        results = self.retrieve(query, category, top_k)

        citations = [
            Citation(
                source_id=r.source_id,
                chunk_id=r.chunk_id,
                quote_hint=r.text[:80] + "..." if len(r.text) > 80 else r.text,
            )
            for r in results
        ]

        return results, citations
```

---

## 9. 模块七：HTTP API 层

### 9.1 API 路由总览

> **TODO: 在此处插入 [API 交互时序图] — 文件: `diagrams/04_api_sequence.drawio`**

| 路径 | 方法 | 用途 | 同步/异步 |
|------|------|------|-----------|
| `/health` | GET | 健康检查 | 同步 |
| `/v1/chat/completions` | POST | OpenAI-compatible 聊天（Agent 入口） | 同步/SSE |
| `/v1/content/process` | POST | 上传语料，启动处理 | 异步(返回 task_id) |
| `/v1/content/progress/{task_id}` | GET | 查询处理进度 | 同步 |
| `/v1/content/result/{task_id}` | GET | 获取处理结果 | 同步 |
| `/v1/kb/sources` | GET | 列出所有知识库语料 | 同步 |
| `/v1/kb/sources/{source_id}` | GET | 获取单个语料详情 | 同步 |
| `/v1/kb/sources/{source_id}` | DELETE | 删除语料 | 同步 |
| `/v1/kb/sources/{source_id}/metadata` | PUT | 更新语料元数据 | 同步 |
| `/v1/skills` | GET | 列出所有可用 Skills | 同步 |

### 9.2 OpenAI-compatible Chat Completions

这是 Open WebUI 调用 agent-core 的核心接口。

#### 请求

```json
POST /v1/chat/completions
Content-Type: application/json

{
  "model": "agent-core",
  "messages": [
    {"role": "system", "content": "你是我的本地个人 Agent"},
    {"role": "user", "content": "用第一性原理分析如何降低创业成本"}
  ],
  "stream": false,
  "temperature": 0.3
}
```

#### 响应

```json
{
  "id": "chatcmpl-req_abc123",
  "object": "chat.completion",
  "created": 1709500000,
  "model": "agent-core",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "## 第一性原理分析：如何降低创业成本\n\n### Step 1: 拆解目标\n创业成本 = 人力成本 + 办公成本 + 营销成本 + ...\n\n### Step 2: 识别约束\n...\n\n## 依据\n- [fp_book_01#c012] 第一性原理四步法：拆解目标→约束→变量→路径\n- [fp_video_001#c045] \"Physics is the law, everything else is a recommendation\""
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 0,
    "completion_tokens": 0,
    "total_tokens": 0
  },
  "metadata": {
    "request_id": "req_abc123",
    "intent": "skill_request",
    "skills_used": ["first_principles_analysis"],
    "confidence": "high",
    "citations": [
      {
        "source_id": "fp_book_01",
        "chunk_id": "fp_book_01#c012",
        "quote_hint": "第一性原理四步法：拆解目标→约束→变量→路径"
      },
      {
        "source_id": "fp_video_001",
        "chunk_id": "fp_video_001#c045",
        "quote_hint": "Physics is the law, everything else is a recommendation"
      }
    ]
  }
}
```

#### 实现

```python
# apps/routes/chat.py
from fastapi import APIRouter, Request
from pydantic import BaseModel
from agent.graph import agent_graph
from agent.state import AgentState
import uuid, time

router = APIRouter()

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatCompletionRequest(BaseModel):
    model: str = "agent-core"
    messages: list[ChatMessage]
    stream: bool = False
    temperature: float = 0.3

class ChatCompletionResponse(BaseModel):
    id: str
    object: str = "chat.completion"
    created: int
    model: str
    choices: list[dict]
    usage: dict
    metadata: dict | None = None

@router.post("/chat/completions")
async def chat_completions(req: ChatCompletionRequest) -> ChatCompletionResponse:
    request_id = f"req_{uuid.uuid4().hex[:12]}"

    # 提取最后一条 user message
    user_query = ""
    for msg in reversed(req.messages):
        if msg.role == "user":
            user_query = msg.content
            break

    # 构建初始状态
    initial_state: AgentState = {
        "thread_id": f"thread_{uuid.uuid4().hex[:8]}",
        "request_id": request_id,
        "user_query": user_query,
        "messages": [m.model_dump() for m in req.messages],
        "intent": "",
        "intent_detail": "",
        "skill_plan": [],
        "needs_askback": False,
        "askback_questions": [],
        "retrieval_results": [],
        "skill_outputs": [],
        "selfcheck_passed": False,
        "selfcheck_feedback": "",
        "selfcheck_count": 0,
        "final_markdown": "",
        "final_citations": [],
        "confidence": "medium",
        "audit_log": [],
    }

    # 执行 Agent Graph
    final_state = await agent_graph.ainvoke(initial_state)

    # 组装响应
    return ChatCompletionResponse(
        id=f"chatcmpl-{request_id}",
        created=int(time.time()),
        model="agent-core",
        choices=[{
            "index": 0,
            "message": {
                "role": "assistant",
                "content": final_state.get("final_markdown", ""),
            },
            "finish_reason": "stop",
        }],
        usage={"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
        metadata={
            "request_id": request_id,
            "intent": final_state.get("intent"),
            "skills_used": final_state.get("skill_plan"),
            "confidence": final_state.get("confidence"),
            "citations": final_state.get("final_citations", []),
        },
    )
```

### 9.3 Content Processing API

```python
# apps/routes/content.py
from fastapi import APIRouter, UploadFile, File, Form, BackgroundTasks
from content_pipeline.pipeline import ContentPipeline
from content_pipeline.models import SourceType, ProcessingProgress
import uuid

router = APIRouter()
pipeline = ContentPipeline()

@router.post("/process")
async def process_content(
    background_tasks: BackgroundTasks,
    file: UploadFile | None = File(None),
    url: str | None = Form(None),
    source_type: SourceType = Form(...),
    content_category: str = Form("generic"),
):
    """
    上传文件或 URL，启动异步处理

    两种输入方式：
    1. file: 上传文件（PDF/txt/音频）
    2. url: 视频 URL（YouTube/B站等）
    """
    task_id = f"task_{uuid.uuid4().hex[:12]}"

    if file:
        # 保存上传文件到临时位置
        source = await _save_upload(file, task_id)
    elif url:
        source = url
    else:
        return {"error": "Must provide either file or url"}

    # 异步执行处理（也可改为 Celery task）
    background_tasks.add_task(
        pipeline.process, source, source_type, content_category, task_id
    )

    return {"task_id": task_id, "status": "pending", "message": "处理已开始"}

@router.get("/progress/{task_id}")
async def get_progress(task_id: str) -> ProcessingProgress | dict:
    progress = pipeline.get_progress(task_id)
    if progress:
        return progress
    return {"task_id": task_id, "status": "unknown"}

@router.get("/result/{task_id}")
async def get_result(task_id: str):
    # 从存储中加载结果
    ...
```

---

## 10. 模块八：Open WebUI 集成

### 10.1 集成方式

**推荐方案（方式 A）**：agent-core 直接暴露 OpenAI-compatible API，Open WebUI 把 agent-core 当作一个"模型提供商"接入。

配置步骤：
1. 在 Open WebUI **Settings → Connections** 中添加一个 OpenAI-compatible 连接
2. Base URL: `http://localhost:8000/v1`（或 `http://host.docker.internal:8000/v1`）
3. API Key: 自定义密钥（如果启用鉴权）
4. 用户在聊天界面选择 "agent-core" 模型即可

### 10.2 前端扩展：知识库管理页面

#### 新增文件

```
open-webui/src/
├── routes/
│   └── admin/
│       └── knowledge-base/
│           └── +page.svelte              # 页面路由
│
├── lib/
│   ├── apis/
│   │   └── knowledge-base.ts            # API 调用封装
│   │
│   └── components/
│       └── admin/
│           └── KnowledgeBase/
│               ├── KnowledgeBaseManager.svelte  # 主页面容器
│               ├── UploadArea.svelte            # 拖拽上传 + URL 输入
│               ├── ProcessingQueue.svelte       # 处理任务队列
│               ├── SourceList.svelte            # 语料列表表格
│               └── SourceDetail.svelte          # 详情预览 Modal
```

#### 页面布局

```
┌─────────────────────────────────────────────────────────┐
│  知识库管理                                              │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─── 上传区域 ────────────────────────────────────┐    │
│  │  [拖拽文件到此处上传]  或  [输入视频 URL ____]  │    │
│  │                                                  │    │
│  │  类别: [▼ 第一性原理 / 博弈论 / 通用 ...]      │    │
│  │  [开始处理]                                      │    │
│  └──────────────────────────────────────────────────┘    │
│                                                         │
│  ┌─── 处理队列 ────────────────────────────────────┐    │
│  │  ████████░░ 60% - 正在分析内容结构...            │    │
│  │  ████████████ 100% - 完成 ✓                      │    │
│  └──────────────────────────────────────────────────┘    │
│                                                         │
│  ┌─── 语料列表 ────────────────────────────────────┐    │
│  │  [搜索___] [类型▼] [主题▼]                      │    │
│  │                                                  │    │
│  │  标题          │ 类型 │ 主题    │ 技能     │ 操作│    │
│  │  ─────────────┼──────┼────────┼─────────┼──── │    │
│  │  第一性原理... │ PDF  │ 思维   │ fp_...  │ 👁🗑│    │
│  │  马斯克访谈    │ 视频 │ 创新   │ fp_...  │ 👁🗑│    │
│  └──────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

#### API 调用封装

```typescript
// src/lib/apis/knowledge-base.ts

const AGENT_CORE_BASE = 'http://localhost:8000/v1';

export async function processContent(
  file: File | null,
  url: string | null,
  sourceType: string,
  category: string,
): Promise<{ task_id: string }> {
  const formData = new FormData();
  if (file) formData.append('file', file);
  if (url) formData.append('url', url);
  formData.append('source_type', sourceType);
  formData.append('content_category', category);

  const res = await fetch(`${AGENT_CORE_BASE}/content/process`, {
    method: 'POST',
    body: formData,
  });
  return res.json();
}

export async function getProgress(taskId: string): Promise<{
  status: string;
  progress_percent: number;
  message: string;
}> {
  const res = await fetch(`${AGENT_CORE_BASE}/content/progress/${taskId}`);
  return res.json();
}

export async function listSources(): Promise<any[]> {
  const res = await fetch(`${AGENT_CORE_BASE}/kb/sources`);
  return res.json();
}

export async function deleteSource(sourceId: string): Promise<void> {
  await fetch(`${AGENT_CORE_BASE}/kb/sources/${sourceId}`, {
    method: 'DELETE',
  });
}
```

### 10.3 聊天界面 Citations 展示

在 Open WebUI 的消息组件中增加 citations 展示区域：

```svelte
<!-- 在消息内容下方追加 -->
{#if message.metadata?.citations?.length}
  <div class="mt-3 border-t pt-2">
    <p class="text-sm font-semibold text-gray-500 mb-1">📚 依据：</p>
    {#each message.metadata.citations as citation}
      <div
        class="text-sm text-blue-600 hover:underline cursor-pointer mb-1"
        on:click={() => goto(`/admin/knowledge-base?source=${citation.source_id}`)}
      >
        [{citation.chunk_id}] {citation.quote_hint}
      </div>
    {/each}
  </div>
{/if}
```

---

## 11. 数据模型总览

### 11.1 所有 Pydantic 模型汇总

```python
# content_pipeline/models.py
from pydantic import BaseModel
from enum import Enum
from datetime import datetime

# === 枚举 ===

class SourceType(str, Enum):
    PDF = "pdf"
    TEXT = "text"
    AUDIO = "audio"
    VIDEO = "video"

class ContentCategory(str, Enum):
    FIRST_PRINCIPLES = "first_principles"
    GAME_THEORY = "game_theory"
    SAWEI_PERSONALITY = "sawei_personality"
    WORK_RETROSPECTIVE = "work_retrospective"
    GENERIC = "generic"

# === 提取 ===

class ExtractedContent(BaseModel):
    text: str
    metadata: dict
    raw_path: str

class DownloadResult(BaseModel):
    file_path: str
    metadata: dict

class TranscriptSegment(BaseModel):
    start: float         # 秒
    end: float
    text: str
    confidence: float

class TranscriptResult(BaseModel):
    text: str
    segments: list[TranscriptSegment]
    language: str
    confidence: float

# === 结构化 ===

class Concept(BaseModel):
    name: str
    definition: str
    source_chunk_id: str

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
    timestamp: str | None = None

class StructuredContent(BaseModel):
    concepts: list[Concept]
    methodology: Methodology | None = None
    examples: list[Example]
    key_quotes: list[Quote]
    summary: str

# === 元数据 ===

class EnrichedMetadata(BaseModel):
    source_id: str
    source_type: SourceType
    source_url: str | None = None
    title: str
    author: str | None = None
    created_at: datetime
    topics: list[str]
    applicable_skills: list[str]
    credibility: str           # high | medium | low
    language: str
    content_category: str

# === 处理结果 ===

class ProcessingProgress(BaseModel):
    task_id: str
    status: str                # pending | extracting | structuring | embedding | completed | failed
    current_step: str
    progress_percent: int
    message: str

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

### 11.2 数据库 Schema（PostgreSQL，生产升级用）

```sql
-- 语料元数据表
CREATE TABLE sources (
    source_id       VARCHAR(64) PRIMARY KEY,
    source_type     VARCHAR(20) NOT NULL,
    source_url      TEXT,
    title           VARCHAR(500) NOT NULL,
    author          VARCHAR(200),
    content_category VARCHAR(50),
    language        VARCHAR(10) DEFAULT 'zh',
    credibility     VARCHAR(20) DEFAULT 'medium',
    raw_path        TEXT,
    json_path       TEXT,
    markdown_path   TEXT,
    chunks_count    INT DEFAULT 0,
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);

-- 多对多：语料 ↔ 主题标签
CREATE TABLE source_topics (
    source_id VARCHAR(64) REFERENCES sources(source_id) ON DELETE CASCADE,
    topic     VARCHAR(100),
    PRIMARY KEY (source_id, topic)
);

-- 多对多：语料 ↔ 关联技能
CREATE TABLE source_skills (
    source_id VARCHAR(64) REFERENCES sources(source_id) ON DELETE CASCADE,
    skill_id  VARCHAR(100),
    PRIMARY KEY (source_id, skill_id)
);

-- 异步处理任务
CREATE TABLE processing_tasks (
    task_id          VARCHAR(64) PRIMARY KEY,
    source_id        VARCHAR(64),
    status           VARCHAR(20) DEFAULT 'pending',
    progress_percent INT DEFAULT 0,
    current_step     VARCHAR(100),
    error_message    TEXT,
    started_at       TIMESTAMP DEFAULT NOW(),
    completed_at     TIMESTAMP
);
```

---

## 12. 部署方案

### 12.1 本地开发部署

```bash
# 1. 启动 Ollama（可选，如果用本地模型）
ollama serve

# 2. 启动 Redis（异步任务队列）
docker run -d -p 6379:6379 --name redis redis:7-alpine

# 3. 启动 agent-core
cd agent-core
cp .env.example .env        # 编辑配置
uv run uvicorn apps.api:app --host 127.0.0.1 --port 8000 --reload

# 4. 启动 Celery worker（异步处理用）
uv run celery -A core.celery_app worker --loglevel=info

# 5. 启动 Open WebUI
docker run -d -p 3000:8080 \
  --add-host=host.docker.internal:host-gateway \
  -v open-webui:/app/backend/data \
  --name open-webui \
  ghcr.io/open-webui/open-webui:main
```

### 12.2 Docker Compose 一键部署

```yaml
# docker/docker-compose.yml
version: '3.8'

services:
  open-webui:
    image: ghcr.io/open-webui/open-webui:main
    ports:
      - "3000:8080"
    volumes:
      - open-webui-data:/app/backend/data
    environment:
      - OPENAI_API_BASE_URLS=http://agent-core:8000/v1
    depends_on:
      - agent-core
    restart: unless-stopped

  agent-core:
    build:
      context: ../
      dockerfile: docker/Dockerfile
    ports:
      - "8000:8000"
    volumes:
      - kb-storage:/app/kb_storage
      - traces:/app/traces
    environment:
      - LLM_PROVIDER=${LLM_PROVIDER:-openai}
      - LLM_API_KEY=${LLM_API_KEY}
      - LLM_MODEL=${LLM_MODEL:-gpt-4o}
      - CELERY_BROKER_URL=redis://redis:6379/0
      - CHROMA_PERSIST_DIR=/app/kb_storage/vector/chroma
    depends_on:
      - redis
    restart: unless-stopped

  celery-worker:
    build:
      context: ../
      dockerfile: docker/Dockerfile
    command: celery -A core.celery_app worker --loglevel=info --concurrency=2
    volumes:
      - kb-storage:/app/kb_storage
    environment:
      - LLM_API_KEY=${LLM_API_KEY}
      - CELERY_BROKER_URL=redis://redis:6379/0
    depends_on:
      - redis
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    restart: unless-stopped

  # 可选：Ollama 本地模型
  # ollama:
  #   image: ollama/ollama
  #   ports:
  #     - "11434:11434"
  #   volumes:
  #     - ollama-data:/root/.ollama

volumes:
  open-webui-data:
  kb-storage:
  traces:
  redis-data:
```

### 12.3 Dockerfile

```dockerfile
# docker/Dockerfile
FROM python:3.11-slim

WORKDIR /app

# 系统依赖（ffmpeg for whisper/yt-dlp）
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Python 依赖
COPY pyproject.toml .
RUN pip install --no-cache-dir .

# 应用代码
COPY . .

# 创建存储目录
RUN mkdir -p /app/kb_storage/raw /app/kb_storage/structured \
    /app/kb_storage/references /app/kb_storage/vector /app/traces

EXPOSE 8000

CMD ["uvicorn", "apps.api:app", "--host", "0.0.0.0", "--port", "8000"]
```

---

## 13. 附录：技术选型对比表

### 向量数据库

| 选项 | 优势 | 劣势 | 适用阶段 |
|------|------|------|----------|
| **Chroma** | 零配置、嵌入式、Python 原生 | 单机性能有上限 | MVP / 本地开发 |
| **pgvector** | 与 PostgreSQL 统一、支持混合查询 | 需维护数据库 | 生产环境 |
| Qdrant | 高性能、丰富过滤 | 额外服务依赖 | 大规模场景 |

### LLM

| 选项 | 优势 | 劣势 | 适用场景 |
|------|------|------|----------|
| **GPT-4o / Claude** | 结构化能力强、准确率高 | 需网络、有成本 | 结构化分析、Skill 执行 |
| **Ollama (Qwen 7B/13B)** | 完全本地、无成本 | 结构化能力弱 | 简单聊天、意图理解 |
| DeepSeek | 中文能力强、性价比高 | 需网络 | 中文内容处理 |

### 音频转录

| 选项 | 优势 | 劣势 | 适用场景 |
|------|------|------|----------|
| **faster-whisper** | 本地运行、快速、免费 | CPU 上中等速度 | MVP / 本地 |
| Deepgram | 准确率高、说话人分离 | 付费 API | 生产优化 |
| Azure Speech | 中文优秀 | 付费 API | 高质量需求 |

### 异步任务

| 选项 | 优势 | 劣势 | 适用场景 |
|------|------|------|----------|
| **FastAPI BackgroundTasks** | 零依赖、简单 | 单进程、无重试 | MVP 快速验证 |
| **Celery + Redis** | 成熟、分布式、可重试 | 多一个 Redis 依赖 | 生产环境 |
| arq | 轻量、asyncio 原生 | 社区较小 | 轻量场景 |

---

> **文档结束**
>
> 配套图表文件列表：
> - `diagrams/01_system_architecture.drawio` — 总体系统架构图
> - `diagrams/02_content_pipeline_flow.drawio` — Content Pipeline 处理流程图
> - `diagrams/03_langgraph_state_machine.drawio` — LangGraph Agent 状态机图
> - `diagrams/04_api_sequence.drawio` — API 交互时序图
> - `diagrams/05_class_diagrams.drawio` — 类图（Content Pipeline / Skills / Storage）
