# Stage 4A Performance Optimization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate fake streaming, async-block, and redundant LLM calls — achieving true token-level SSE streaming with ~2-3s first-token latency (down from ~10-15s).

**Architecture:** Replace LLM-based intent classification with rule-based trigger-word matching; convert all 4 LangGraph nodes to async; use `graph.astream_events(version="v2")` to stream LLM tokens as SSE in real-time.

**Tech Stack:** LangGraph 1.0.10 (async + astream_events v2), LangChain ChatOpenAI (streaming=True), FastAPI async SSE.

**Design doc:** `docs/plans/2026-03-08-stage4a-performance-optimization-design.md`

---

### Task 1: Rule-Based Intake Node

Replace the LLM-based intent classifier with deterministic trigger-word matching. This eliminates one LLM round-trip (~3-8s) per request.

**Files:**
- Modify: `agent/nodes/intake.py` (full rewrite)
- Modify: `tests/test_agent_graph.py` (TestIntakeNode class)

**Context:**
- Trigger words are defined in `kb_storage/config/skills.json` via `SkillConfigManager`
- The hardcoded skills (FirstPrinciplesSkill, GenericSummarySkill) don't have trigger_words; their dynamic counterparts in skills.json do
- SkillConfigManager reads from disk each time (no restart needed)

**Step 1: Write failing tests for rule-based intake**

Replace the entire `TestIntakeNode` class in `tests/test_agent_graph.py`. Remove all `@patch("agent.nodes.intake.build_chat_llm")` since intake no longer calls LLM.

```python
class TestIntakeNode:
    """Rule-based intake: trigger_words matching, no LLM call."""

    @patch("agent.nodes.intake._get_trigger_map")
    def test_skill_request_by_trigger_word(self, mock_trigger_map):
        """Trigger word 命中 → skill_request"""
        mock_trigger_map.return_value = {
            "赛维": "sawi_personality",
            "九型人格": "sawi_personality",
            "第一性原理": "first_principles",
        }
        state = {"messages": [{"role": "user", "content": "帮我用赛维分析一下这个人"}]}
        result = intake_node(state)

        assert result["user_query"] == "帮我用赛维分析一下这个人"
        assert result["intent"] == "skill_request"
        assert result["matched_skill"] == "sawi_personality"

    @patch("agent.nodes.intake._get_trigger_map")
    def test_knowledge_query_default(self, mock_trigger_map):
        """No trigger word, not chitchat → knowledge_query"""
        mock_trigger_map.return_value = {"赛维": "sawi_personality"}
        state = {"messages": [{"role": "user", "content": "如何提高工作效率"}]}
        result = intake_node(state)

        assert result["intent"] == "knowledge_query"
        assert result["matched_skill"] == ""

    @patch("agent.nodes.intake._get_trigger_map")
    def test_general_chat_greeting(self, mock_trigger_map):
        """Chitchat → general_chat"""
        mock_trigger_map.return_value = {}
        state = {"messages": [{"role": "user", "content": "你好"}]}
        result = intake_node(state)

        assert result["intent"] == "general_chat"
        assert result["matched_skill"] == ""

    def test_empty_messages(self):
        result = intake_node({"messages": []})
        assert result["user_query"] == ""
        assert result["intent"] == "general_chat"

    @patch("agent.nodes.intake._get_trigger_map")
    def test_first_trigger_word_wins(self, mock_trigger_map):
        """Multiple skills' trigger words in query → first match wins"""
        mock_trigger_map.return_value = {
            "第一性原理": "first_principles",
            "赛维": "sawi_personality",
        }
        state = {"messages": [{"role": "user", "content": "用第一性原理分析赛维理论"}]}
        result = intake_node(state)

        assert result["intent"] == "skill_request"
        assert result["matched_skill"] == "first_principles"
```

Note: we import `intake_node` at the top of the file (already imported). The `_get_trigger_map` is a module-level helper we'll create in intake.py.

**Step 2: Run tests to verify they fail**

Run: `cd /Users/em/Dev/AITools/openWeb/agent-core && .venv/bin/python -m pytest tests/test_agent_graph.py::TestIntakeNode -v`
Expected: FAIL (intake_node still uses LLM, `_get_trigger_map` doesn't exist)

**Step 3: Implement rule-based intake_node**

Rewrite `agent/nodes/intake.py`:

```python
"""Intake node — rule-based intent classification + skill matching

Uses trigger_words from SkillConfigManager for deterministic skill matching.
No LLM call — eliminates ~3-8s latency per request.
"""

from agent.state import AgentState
from core.logging import logger

# Chitchat patterns (simple substring matching)
_CHITCHAT_PATTERNS = [
    "你好", "您好", "早上好", "下午好", "晚上好", "嗨",
    "谢谢", "感谢", "再见", "拜拜", "晚安",
    "hello", "hi", "hey", "thanks", "bye",
]


def _get_trigger_map() -> dict[str, str]:
    """Build {trigger_word: skill_id} map from SkillConfigManager.

    Reads skills.json on each call (no restart needed for config changes).
    """
    try:
        from core.skill_config import SkillConfigManager
        manager = SkillConfigManager.get_instance()
        trigger_map: dict[str, str] = {}
        for cfg in manager.list_enabled_skills():
            for word in cfg.trigger_words:
                trigger_map[word] = cfg.skill_id
        return trigger_map
    except Exception:
        return {}


def _is_chitchat(query: str) -> bool:
    """Check if query is pure chitchat (greetings, thanks, etc.)."""
    q = query.strip()
    # Short messages that exactly match or only contain chitchat
    if len(q) <= 10:
        for pattern in _CHITCHAT_PATTERNS:
            if pattern in q:
                return True
    return False


async def intake_node(state: AgentState) -> dict:
    """Classify intent via trigger-word matching. Zero LLM calls."""
    messages = state.get("messages", [])
    user_query = ""
    for msg in reversed(messages):
        if msg.get("role") == "user":
            user_query = msg.get("content", "")
            break

    if not user_query:
        return {
            "user_query": "",
            "intent": "general_chat",
            "matched_skill": "",
        }

    # 1. Check trigger words → skill_request
    trigger_map = _get_trigger_map()
    for word, skill_id in trigger_map.items():
        if word in user_query:
            logger.info("Trigger word matched: '%s' → skill=%s", word, skill_id)
            return {
                "user_query": user_query,
                "intent": "skill_request",
                "matched_skill": skill_id,
            }

    # 2. Check chitchat → general_chat
    if _is_chitchat(user_query):
        logger.info("Chitchat detected: '%s'", user_query[:30])
        return {
            "user_query": user_query,
            "intent": "general_chat",
            "matched_skill": "",
        }

    # 3. Default → knowledge_query (RAG fallback)
    logger.info("Default knowledge_query: '%s'", user_query[:30])
    return {
        "user_query": user_query,
        "intent": "knowledge_query",
        "matched_skill": "",
    }
```

**Step 4: Run tests to verify they pass**

Run: `cd /Users/em/Dev/AITools/openWeb/agent-core && .venv/bin/python -m pytest tests/test_agent_graph.py::TestIntakeNode -v`
Expected: All 5 tests PASS

Note: since intake_node is now `async def`, the tests need `@pytest.mark.asyncio` and `await`. Update the tests accordingly:
- Add `import pytest` at top if not present
- Add `@pytest.mark.asyncio` and `async def` to each test method
- Change `result = intake_node(state)` to `result = await intake_node(state)`

**Step 5: Run all agent graph tests**

Run: `cd /Users/em/Dev/AITools/openWeb/agent-core && .venv/bin/python -m pytest tests/test_agent_graph.py -v`
Expected: All tests in the file pass (routing tests unchanged, node tests updated)

**Step 6: Commit**

```bash
cd /Users/em/Dev/AITools/openWeb/agent-core
git add agent/nodes/intake.py tests/test_agent_graph.py
git commit -m "feat: replace LLM intake with rule-based trigger-word matching

Eliminates one LLM round-trip (~3-8s) per request by using
deterministic trigger_words from skills.json config."
```

---

### Task 2: Async State + LLM Streaming Setup

Update shared infrastructure: add `citation_text` to state, add `streaming` param to LLM builder.

**Files:**
- Modify: `agent/state.py` (add citation_text field)
- Modify: `agent/llm.py` (add streaming param)

**Step 1: Update agent/state.py**

Add `citation_text` field to `AgentState`:

```python
class AgentState(TypedDict, total=False):
    """Agent graph state"""

    # Input
    messages: list[dict]
    user_query: str

    # Intake
    intent: str
    matched_skill: str

    # Retrieve
    retrieval_results: list[RetrievalResult]
    context_text: str

    # Execute
    answer: str
    citations: list[Citation]

    # Finalize
    response_text: str
    citation_text: str  # NEW: citation block only (for streaming mode)
```

**Step 2: Update agent/llm.py**

Add `streaming` parameter to `build_chat_llm()`:

```python
def build_chat_llm(
    temperature: float | None = None,
    max_tokens: int = 8192,
    streaming: bool = False,
) -> ChatOpenAI:
    """Build ChatOpenAI instance.

    Args:
        streaming: If True, ainvoke() uses streaming HTTP under the hood,
                   enabling astream_events to capture per-token callbacks.
    """
    manager = LLMSettingsManager.get_instance()
    active = manager.get_active_model()

    if temperature is not None:
        temp = temperature
    elif active:
        temp = manager.settings.temperature
    else:
        temp = settings.LLM_TEMPERATURE

    if active:
        return ChatOpenAI(
            model=active.model_id,
            base_url=active.api_base,
            api_key=active.api_key,
            temperature=temp,
            max_tokens=max_tokens,
            streaming=streaming,
        )

    if settings.LLM_PROVIDER == "ollama":
        return ChatOpenAI(
            model=settings.OLLAMA_MODEL,
            base_url=f"{settings.OLLAMA_BASE_URL}/v1",
            api_key="ollama",
            temperature=temp,
            streaming=streaming,
        )
    else:
        return ChatOpenAI(
            model=settings.LLM_MODEL,
            base_url=settings.LLM_BASE_URL,
            api_key=settings.LLM_API_KEY,
            temperature=temp,
            max_tokens=max_tokens,
            streaming=streaming,
        )
```

**Step 3: Run existing tests (sanity check)**

Run: `cd /Users/em/Dev/AITools/openWeb/agent-core && .venv/bin/python -m pytest tests/test_agent_graph.py tests/test_chat_api.py -v`
Expected: PASS (no behavior change yet, just added params)

**Step 4: Commit**

```bash
cd /Users/em/Dev/AITools/openWeb/agent-core
git add agent/state.py agent/llm.py
git commit -m "feat: add citation_text state field and streaming param to LLM builder"
```

---

### Task 3: Async Retrieve Node

Convert retrieve_node to async. Wrap sync I/O (embedding + ChromaDB) in `asyncio.to_thread()`.

**Files:**
- Modify: `agent/nodes/retrieve.py`
- Modify: `tests/test_agent_graph.py` (TestRetrieveNode class)

**Step 1: Write failing test for async retrieve**

Update `TestRetrieveNode` in `tests/test_agent_graph.py`:

```python
class TestRetrieveNode:
    @pytest.mark.asyncio
    @patch("agent.nodes.retrieve.get_retriever")
    async def test_retrieves_context(self, mock_get_retriever):
        mock_retriever = MagicMock()
        results = [
            RetrievalResult(
                chunk_id="src_001_c01",
                source_id="src_001",
                text="测试内容",
                score=0.9,
                metadata={"title": "测试"},
            )
        ]
        mock_retriever.search.return_value = results
        mock_retriever.format_context.return_value = "[参考1] 测试内容"
        mock_get_retriever.return_value = mock_retriever

        state = {"user_query": "测试查询", "matched_skill": ""}
        result = await retrieve_node(state)

        assert len(result["retrieval_results"]) == 1
        assert "测试内容" in result["context_text"]

    @pytest.mark.asyncio
    async def test_empty_query(self):
        result = await retrieve_node({"user_query": "", "matched_skill": ""})
        assert result["retrieval_results"] == []
        assert result["context_text"] == ""
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/em/Dev/AITools/openWeb/agent-core && .venv/bin/python -m pytest tests/test_agent_graph.py::TestRetrieveNode -v`
Expected: FAIL (retrieve_node is still sync `def`, cannot `await`)

**Step 3: Implement async retrieve_node**

Rewrite `agent/nodes/retrieve.py`:

```python
"""Retrieve node — knowledge base search

Calls KnowledgeRetriever to query ChromaDB. Uses asyncio.to_thread()
to avoid blocking the event loop (ChromaDB client is synchronous).
"""

import asyncio

from agent.retriever import get_retriever
from agent.state import AgentState
from core.logging import logger


def _sync_search(user_query: str, category: str | None) -> tuple[list, str]:
    """Synchronous search logic (runs in thread pool)."""
    retriever = get_retriever()

    results = retriever.search(query=user_query, category=category)

    # Fallback to full search if category filter yields too few results
    if len(results) < 2 and category:
        logger.info("Category '%s' too few results, falling back to full search", category)
        results = retriever.search(query=user_query)

    context_text = retriever.format_context(results)
    return results, context_text


async def retrieve_node(state: AgentState) -> dict:
    """Search knowledge base, generate context text."""
    user_query = state.get("user_query", "")
    matched_skill = state.get("matched_skill", "")

    if not user_query:
        return {"retrieval_results": [], "context_text": ""}

    # Resolve category filter from skill
    category = None
    if matched_skill:
        try:
            from skills.registry import get_registry
            skill = get_registry().get(matched_skill)
            category = skill.category_filter if skill else matched_skill
        except Exception:
            category = matched_skill

    try:
        results, context_text = await asyncio.to_thread(
            _sync_search, user_query, category
        )
    except Exception as e:
        logger.error("Knowledge base search failed: %s", e)
        results = []
        context_text = ""

    return {
        "retrieval_results": results,
        "context_text": context_text,
    }
```

**Step 4: Run tests to verify they pass**

Run: `cd /Users/em/Dev/AITools/openWeb/agent-core && .venv/bin/python -m pytest tests/test_agent_graph.py::TestRetrieveNode -v`
Expected: PASS

**Step 5: Commit**

```bash
cd /Users/em/Dev/AITools/openWeb/agent-core
git add agent/nodes/retrieve.py tests/test_agent_graph.py
git commit -m "feat: convert retrieve_node to async with asyncio.to_thread"
```

---

### Task 4: Async Execute Node

Convert execute_node to async. Use `await llm.ainvoke()` with `streaming=True`.

**Files:**
- Modify: `agent/nodes/execute.py`
- Modify: `tests/test_agent_graph.py` (TestExecuteNode class)

**Step 1: Write failing test for async execute**

Update `TestExecuteNode` in `tests/test_agent_graph.py`. Mock `ainvoke` instead of `invoke`:

```python
class TestExecuteNode:
    @pytest.mark.asyncio
    @patch("agent.nodes.execute.build_chat_llm")
    async def test_generates_answer(self, mock_build_llm):
        mock_llm = MagicMock()
        mock_response = MagicMock()
        mock_response.content = "这是回答"
        # Mock ainvoke (async) — use AsyncMock
        from unittest.mock import AsyncMock
        mock_llm.ainvoke = AsyncMock(return_value=mock_response)
        mock_build_llm.return_value = mock_llm

        state = {
            "user_query": "你好",
            "context_text": "",
            "matched_skill": "",
            "intent": "general_chat",
            "retrieval_results": [],
        }
        result = await execute_node(state)

        assert result["answer"] == "这是回答"
        assert result["citations"] == []

    @pytest.mark.asyncio
    @patch("agent.nodes.execute.build_chat_llm")
    async def test_extracts_citations(self, mock_build_llm):
        mock_llm = MagicMock()
        mock_response = MagicMock()
        mock_response.content = "根据 [参考1] 的内容，答案是..."
        from unittest.mock import AsyncMock
        mock_llm.ainvoke = AsyncMock(return_value=mock_response)
        mock_build_llm.return_value = mock_llm

        retrieval_results = [
            RetrievalResult(
                chunk_id="src_001_c01",
                source_id="src_001",
                text="参考文本",
                score=0.9,
                metadata={},
            )
        ]

        state = {
            "user_query": "问题",
            "context_text": "[参考1] 参考文本",
            "matched_skill": "",
            "intent": "knowledge_query",
            "retrieval_results": retrieval_results,
        }
        result = await execute_node(state)

        assert len(result["citations"]) == 1
        assert result["citations"][0].source_id == "src_001"
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/em/Dev/AITools/openWeb/agent-core && .venv/bin/python -m pytest tests/test_agent_graph.py::TestExecuteNode -v`
Expected: FAIL (execute_node still sync)

**Step 3: Implement async execute_node**

Rewrite `agent/nodes/execute.py`:

```python
"""Execute node — LLM answer generation

Injects retrieval context + skill prompt, calls LLM to generate answer.
Uses ainvoke() with streaming=True so astream_events can capture tokens.
"""

from langchain_core.messages import HumanMessage, SystemMessage

from agent.llm import build_chat_llm
from agent.state import AgentState
from core.logging import logger
from core.models import Citation


DEFAULT_SYSTEM_PROMPT = """\
你是一个智能知识助手。请根据提供的参考资料回答用户的问题。
如果参考资料中没有相关信息，请基于你自己的知识回答，但要说明这不是来自知识库。
回答时请引用参考资料的编号（如 [参考1]）。"""

NO_CONTEXT_SYSTEM_PROMPT = """\
你是一个智能助手。请用专业、友好的方式回答用户的问题。"""


async def execute_node(state: AgentState) -> dict:
    """Inject context and skill prompt, call LLM to generate answer."""
    user_query = state.get("user_query", "")
    context_text = state.get("context_text", "")
    matched_skill = state.get("matched_skill", "")
    intent = state.get("intent", "general_chat")
    retrieval_results = state.get("retrieval_results", [])

    system_prompt = _build_system_prompt(matched_skill, context_text, intent)

    if context_text:
        user_content = f"参考资料：\n\n{context_text}\n\n---\n\n用户问题：{user_query}"
    else:
        user_content = user_query

    llm = build_chat_llm(streaming=True)
    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=user_content),
    ]

    try:
        response = await llm.ainvoke(messages)
        answer = response.content
    except Exception as e:
        logger.error("LLM generation failed: %s", e)
        answer = f"抱歉，生成回答时出现错误：{e}"

    citations = _extract_citations(answer, retrieval_results)

    return {
        "answer": answer,
        "citations": citations,
    }


def _build_system_prompt(matched_skill: str, context_text: str, intent: str) -> str:
    """Build system prompt based on skill and context."""
    if matched_skill:
        try:
            from skills.registry import get_registry
            registry = get_registry()
            skill = registry.get(matched_skill)
            if skill:
                base_prompt = skill.system_prompt
                if context_text:
                    return f"{base_prompt}\n\n请参考以下资料回答，并引用参考编号。"
                return base_prompt
        except Exception:
            pass

    if context_text:
        return DEFAULT_SYSTEM_PROMPT
    return NO_CONTEXT_SYSTEM_PROMPT


def _extract_citations(answer: str, retrieval_results: list) -> list[Citation]:
    """Extract cited references from the answer text."""
    citations = []
    for i, result in enumerate(retrieval_results, 1):
        ref_marker = f"[参考{i}]"
        if ref_marker in answer:
            source_title = result.metadata.get("source_title", "") if hasattr(result, "metadata") else ""
            citations.append(Citation(
                source_id=result.source_id,
                chunk_id=result.chunk_id,
                source_title=source_title,
                quote_hint=result.text[:100],
                score=result.score,
            ))
    return citations
```

**Step 4: Run tests to verify they pass**

Run: `cd /Users/em/Dev/AITools/openWeb/agent-core && .venv/bin/python -m pytest tests/test_agent_graph.py::TestExecuteNode -v`
Expected: PASS

**Step 5: Commit**

```bash
cd /Users/em/Dev/AITools/openWeb/agent-core
git add agent/nodes/execute.py tests/test_agent_graph.py
git commit -m "feat: convert execute_node to async with streaming=True"
```

---

### Task 5: Async Finalize Node + citation_text

Convert finalize_node to async. Add separate `citation_text` output for streaming mode.

**Files:**
- Modify: `agent/nodes/finalize.py`
- Modify: `tests/test_agent_graph.py` (TestFinalizeNode class)

**Step 1: Write failing test for async finalize with citation_text**

Update `TestFinalizeNode` in `tests/test_agent_graph.py`:

```python
class TestFinalizeNode:
    @pytest.mark.asyncio
    async def test_no_citations(self):
        state = {"answer": "简单回答", "citations": []}
        result = await finalize_node(state)
        assert result["response_text"] == "简单回答"
        assert result["citation_text"] == ""

    @pytest.mark.asyncio
    async def test_with_citations(self):
        citations = [
            Citation(
                source_id="src_001",
                chunk_id="src_001_c01",
                quote_hint="引用内容",
                score=0.9,
            )
        ]
        state = {"answer": "带引用的回答", "citations": citations}
        result = await finalize_node(state)

        assert "带引用的回答" in result["response_text"]
        assert "参考来源" in result["response_text"]
        assert "src_001" in result["response_text"]
        # citation_text should contain ONLY the citation block
        assert "参考来源" in result["citation_text"]
        assert "带引用的回答" not in result["citation_text"]
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/em/Dev/AITools/openWeb/agent-core && .venv/bin/python -m pytest tests/test_agent_graph.py::TestFinalizeNode -v`
Expected: FAIL

**Step 3: Implement async finalize_node**

Rewrite `agent/nodes/finalize.py`:

```python
"""Finalize node — format final output

Combines answer + citations into response_text.
Outputs citation_text separately for streaming mode.
"""

from agent.state import AgentState
from core.models import Citation


async def finalize_node(state: AgentState) -> dict:
    """Format answer, append citation sources list."""
    answer = state.get("answer", "")
    citations = state.get("citations", [])

    if not citations:
        return {"response_text": answer, "citation_text": ""}

    citation_text = _format_citations(citations)
    response_text = f"{answer}\n\n{citation_text}"

    return {"response_text": response_text, "citation_text": citation_text}


def _format_citations(citations: list[Citation]) -> str:
    """Format citation list."""
    lines = ["---", "**参考来源：**"]
    for i, c in enumerate(citations, 1):
        title = c.source_title or c.source_id
        lines.append(f"{i}. 《{title}》")
    return "\n".join(lines)
```

**Step 4: Run tests to verify they pass**

Run: `cd /Users/em/Dev/AITools/openWeb/agent-core && .venv/bin/python -m pytest tests/test_agent_graph.py::TestFinalizeNode -v`
Expected: PASS

**Step 5: Commit**

```bash
cd /Users/em/Dev/AITools/openWeb/agent-core
git add agent/nodes/finalize.py tests/test_agent_graph.py
git commit -m "feat: convert finalize_node to async, add citation_text output"
```

---

### Task 6: True Streaming Chat Route

Rewrite `api/routes/chat.py` to use `graph.astream_events()` for real-time SSE token streaming.

**Files:**
- Modify: `api/routes/chat.py` (full rewrite)
- Modify: `tests/test_chat_api.py` (update tests for async streaming)

**Step 1: Write failing test for true streaming**

Update `tests/test_chat_api.py`. The key change: mock at the graph level instead of `_run_agent`, since `_run_agent` no longer exists.

```python
"""Chat API endpoint tests"""

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


def _make_mock_graph(answer_text: str, citation_text: str = ""):
    """Create a mock graph that simulates astream_events and ainvoke."""
    mock_graph = MagicMock()

    # Mock ainvoke (non-stream mode)
    mock_graph.ainvoke = AsyncMock(return_value={
        "response_text": answer_text + ("\n\n" + citation_text if citation_text else ""),
    })

    # Mock astream_events (stream mode)
    async def fake_astream_events(initial_state, version="v2"):
        # Emit tokens one by one
        for char in answer_text:
            yield {
                "event": "on_chat_model_stream",
                "name": "ChatOpenAI",
                "data": {"chunk": MagicMock(content=char)},
            }
        # Emit finalize end event
        yield {
            "event": "on_chain_end",
            "name": "finalize",
            "data": {"output": {"citation_text": citation_text}},
        }

    mock_graph.astream_events = fake_astream_events
    return mock_graph


@pytest.fixture
def mock_graph_simple():
    """Mock graph returning simple answer without citations."""
    graph = _make_mock_graph("你好！我是助手。")
    with patch("api.routes.chat.build_agent_graph", return_value=graph):
        yield graph


@pytest.fixture
def mock_graph_with_citations():
    """Mock graph returning answer with citations."""
    graph = _make_mock_graph(
        "根据 [参考1] 的内容",
        "---\n**参考来源：**\n1. 《测试文档》",
    )
    with patch("api.routes.chat.build_agent_graph", return_value=graph):
        yield graph


@pytest.mark.asyncio
async def test_chat_non_stream(client, mock_graph_simple):
    """Non-stream mode should return complete JSON response."""
    resp = await client.post(
        "/v1/chat/completions",
        json={
            "model": "agent-core",
            "stream": False,
            "messages": [{"role": "user", "content": "你好"}],
        },
    )
    assert resp.status_code == 200
    data = resp.json()

    assert data["object"] == "chat.completion"
    assert data["model"] == "agent-core"
    assert len(data["choices"]) == 1
    assert data["choices"][0]["message"]["role"] == "assistant"
    assert "你好" in data["choices"][0]["message"]["content"]
    assert data["choices"][0]["finish_reason"] == "stop"
    assert data["id"].startswith("chatcmpl-")


@pytest.mark.asyncio
async def test_chat_stream_format(client, mock_graph_simple):
    """Stream mode should return valid SSE format."""
    resp = await client.post(
        "/v1/chat/completions",
        json={
            "model": "agent-core",
            "stream": True,
            "messages": [{"role": "user", "content": "你好"}],
        },
    )
    assert resp.status_code == 200
    assert "text/event-stream" in resp.headers["content-type"]

    lines = resp.text.strip().split("\n")
    data_lines = [l for l in lines if l.startswith("data: ")]

    # Must have: role chunk + content chunks + finish chunk + [DONE]
    assert len(data_lines) >= 3
    assert data_lines[-1] == "data: [DONE]"

    # First chunk should contain role
    first = json.loads(data_lines[0].removeprefix("data: "))
    assert first["object"] == "chat.completion.chunk"
    assert first["choices"][0]["delta"]["role"] == "assistant"

    # Second-to-last should have finish_reason: stop
    last_content = json.loads(data_lines[-2].removeprefix("data: "))
    assert last_content["choices"][0]["finish_reason"] == "stop"


@pytest.mark.asyncio
async def test_chat_stream_content(client, mock_graph_simple):
    """Stream content should reconstruct to full answer."""
    resp = await client.post(
        "/v1/chat/completions",
        json={
            "model": "agent-core",
            "stream": True,
            "messages": [{"role": "user", "content": "你好"}],
        },
    )
    data_lines = [l for l in resp.text.strip().split("\n") if l.startswith("data: ")]

    full_content = ""
    for dl in data_lines:
        if dl == "data: [DONE]":
            continue
        chunk = json.loads(dl.removeprefix("data: "))
        content = chunk["choices"][0]["delta"].get("content", "")
        full_content += content

    assert full_content == "你好！我是助手。"


@pytest.mark.asyncio
async def test_chat_stream_with_citations(client, mock_graph_with_citations):
    """Stream should include citations after answer tokens."""
    resp = await client.post(
        "/v1/chat/completions",
        json={
            "model": "agent-core",
            "stream": True,
            "messages": [{"role": "user", "content": "问题"}],
        },
    )
    data_lines = [l for l in resp.text.strip().split("\n") if l.startswith("data: ")]

    full_content = ""
    for dl in data_lines:
        if dl == "data: [DONE]":
            continue
        chunk = json.loads(dl.removeprefix("data: "))
        content = chunk["choices"][0]["delta"].get("content", "")
        full_content += content

    assert "参考1" in full_content
    assert "参考来源" in full_content
    assert "测试文档" in full_content


@pytest.mark.asyncio
async def test_chat_error_handling(client):
    """Agent error should return error message."""
    mock_graph = MagicMock()
    mock_graph.ainvoke = AsyncMock(side_effect=Exception("测试错误"))

    with patch("api.routes.chat.build_agent_graph", return_value=mock_graph):
        resp = await client.post(
            "/v1/chat/completions",
            json={
                "model": "agent-core",
                "stream": False,
                "messages": [{"role": "user", "content": "你好"}],
            },
        )
    assert resp.status_code == 200
    data = resp.json()
    assert "错误" in data["choices"][0]["message"]["content"]
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/em/Dev/AITools/openWeb/agent-core && .venv/bin/python -m pytest tests/test_chat_api.py -v`
Expected: FAIL (old chat.py still has `_run_agent`)

**Step 3: Implement new chat route**

Rewrite `api/routes/chat.py`:

```python
"""Chat API — OpenAI-compatible /v1/chat/completions

True streaming via LangGraph astream_events: tokens are sent as SSE
chunks the instant they're generated by the LLM.
"""

import json
import time
import uuid

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from agent.graph import build_agent_graph
from core.logging import logger

router = APIRouter()


# === Request/Response models ===


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatCompletionRequest(BaseModel):
    model: str = "agent-core"
    messages: list[ChatMessage]
    stream: bool = False
    temperature: float | None = None
    max_tokens: int | None = None


# === Helpers ===


def _generate_id() -> str:
    return f"chatcmpl-{uuid.uuid4().hex[:12]}"


def _sse_chunk(chat_id: str, created: int, model: str, delta: dict, finish_reason: str | None = None) -> str:
    """Build a single SSE data line."""
    chunk = {
        "id": chat_id,
        "object": "chat.completion.chunk",
        "created": created,
        "model": model,
        "choices": [
            {
                "index": 0,
                "delta": delta,
                "finish_reason": finish_reason,
            }
        ],
    }
    return f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"


def _build_non_stream_response(response_text: str, model: str) -> dict:
    """Build non-streaming OpenAI-compatible response."""
    return {
        "id": _generate_id(),
        "object": "chat.completion",
        "created": int(time.time()),
        "model": model,
        "choices": [
            {
                "index": 0,
                "message": {"role": "assistant", "content": response_text},
                "finish_reason": "stop",
            }
        ],
        "usage": {
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "total_tokens": 0,
        },
    }


async def _stream_agent(messages: list[dict], model: str):
    """Stream agent response via astream_events — true token-level SSE."""
    graph = build_agent_graph()
    initial_state = {"messages": messages}

    chat_id = _generate_id()
    created = int(time.time())

    # Role chunk
    yield _sse_chunk(chat_id, created, model, {"role": "assistant", "content": ""})

    # Stream tokens from LLM + citations from finalize
    async for event in graph.astream_events(initial_state, version="v2"):
        if event["event"] == "on_chat_model_stream":
            token = event["data"]["chunk"].content
            if token:
                yield _sse_chunk(chat_id, created, model, {"content": token})

        elif event["event"] == "on_chain_end" and event["name"] == "finalize":
            citation_text = event["data"]["output"].get("citation_text", "")
            if citation_text:
                yield _sse_chunk(chat_id, created, model, {"content": "\n\n" + citation_text})

    # Finish chunk
    yield _sse_chunk(chat_id, created, model, {}, finish_reason="stop")
    yield "data: [DONE]\n\n"


# === Route ===


@router.post("/chat/completions")
async def chat_completions(request: ChatCompletionRequest):
    """OpenAI-compatible chat completions endpoint."""
    logger.info(
        "Chat request: model=%s, stream=%s, messages=%d",
        request.model,
        request.stream,
        len(request.messages),
    )

    messages = [{"role": m.role, "content": m.content} for m in request.messages]

    if request.stream:
        return StreamingResponse(
            _stream_agent(messages, request.model),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )
    else:
        # Non-stream: use ainvoke for full response
        try:
            graph = build_agent_graph()
            result = await graph.ainvoke({"messages": messages})
            response_text = result.get("response_text", result.get("answer", ""))
        except Exception as e:
            logger.error("Agent execution failed: %s", e)
            response_text = f"抱歉，处理请求时出现错误：{e}"

        return _build_non_stream_response(response_text, request.model)
```

**Step 4: Run tests to verify they pass**

Run: `cd /Users/em/Dev/AITools/openWeb/agent-core && .venv/bin/python -m pytest tests/test_chat_api.py -v`
Expected: All 5 tests PASS

**Step 5: Commit**

```bash
cd /Users/em/Dev/AITools/openWeb/agent-core
git add api/routes/chat.py tests/test_chat_api.py
git commit -m "feat: true SSE streaming via LangGraph astream_events

Replace fake streaming (complete-then-chunk) with real token-level
streaming. Users see output as it's generated by the LLM."
```

---

### Task 7: Integration & Regression Testing

Run full test suite, fix any failures, verify the complete pipeline.

**Files:**
- Possibly fix: any test file with failures

**Step 1: Run full test suite**

Run: `cd /Users/em/Dev/AITools/openWeb/agent-core && .venv/bin/python -m pytest tests/ -v`
Expected: All tests pass (target: 99+ tests)

**Step 2: Check for async-related import issues**

Common issues to watch for:
- Tests that call sync node functions directly (need `await` now)
- Tests that mock `llm.invoke()` instead of `llm.ainvoke()`
- `graph.invoke()` calls in other test files that need `await graph.ainvoke()`

Inspect and fix any failures.

**Step 3: Run full suite again after fixes**

Run: `cd /Users/em/Dev/AITools/openWeb/agent-core && .venv/bin/python -m pytest tests/ -v`
Expected: All tests PASS

**Step 4: Commit**

```bash
cd /Users/em/Dev/AITools/openWeb/agent-core
git add -u
git commit -m "fix: update remaining tests for async node signatures"
```

---

### Task 8: Manual Verification

Restart agent-core and test in Open WebUI.

**Step 1: Restart agent-core**

```bash
# Find and kill old process
lsof -i :8000 -P -n
kill <PID>

# Start with new code
cd /Users/em/Dev/AITools/openWeb/agent-core
.venv/bin/python -m uvicorn apps.api:app --port 8000 &

# Verify
curl -sf http://localhost:8000/docs > /dev/null && echo "OK"
```

**Step 2: Test non-stream via curl**

```bash
curl -X POST http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"agent-core","stream":false,"messages":[{"role":"user","content":"你好"}]}'
```

Expected: JSON response with assistant answer.

**Step 3: Test stream via curl**

```bash
curl -X POST http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"agent-core","stream":true,"messages":[{"role":"user","content":"用赛维分析一下梅诗博"}]}' \
  --no-buffer
```

Expected: SSE chunks appear incrementally (not all at once).

**Step 4: Test in Open WebUI**

Open http://localhost:3000, select agent-core model, send a message. Verify:
- Tokens appear incrementally (true streaming)
- Response includes citations
- No errors in browser console

**Step 5: Final commit (if any fixes needed)**

```bash
cd /Users/em/Dev/AITools/openWeb/agent-core
git add -u
git commit -m "fix: adjustments from manual verification"
```
