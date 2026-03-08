# Stage 4A 性能优化设计

> 日期：2026-03-08
> 状态：已批准，待实施
> 方案：B（LangGraph astream_events 全 async 改造）

## 背景

与 Gemini 对比测试发现三个性能瓶颈：

| 优先级 | 问题 | 影响 |
|--------|------|------|
| P0 | 单 worker 阻塞 — 同步 `graph.invoke()` 阻塞 FastAPI 事件循环 | 一个请求卡住时整个系统不可用 |
| P0 | 伪流式 — 先等完整回答再切成 6 字符块发 SSE | 用户等 10-15 秒才看到输出 |
| P1 | 两次串行 LLM 调用 — Intake（意图分类）+ Execute（生成回答） | 每次请求多花 3-8 秒 |

## 方案概述

三项优化统一实施：

1. **Intake 改规则引擎**：用 trigger_words 关键词匹配替代 LLM 意图分类
2. **全 async 改造**：4 个节点全部改 `async def`，graph 用异步 API
3. **真流式 astream_events**：用 LangGraph `astream_events()` 逐 token 发 SSE

## 详细设计

### 1. Intake 规则引擎（P1）

**替换逻辑**：
```
用户消息 →
  1. 遍历所有 skill 的 trigger_words，命中 → intent=skill_request
  2. 简单闲聊检测（你好/早上好/谢谢/再见...） → intent=general_chat
  3. 其余全部 → intent=knowledge_query（RAG 兜底）
```

**取舍**：自然语言理解能力下降，但 trigger_words 可持续补充。确定性 > 灵活性。

### 2. 全 Async 改造（P0-1）

| 节点 | 当前 | 改造后 |
|------|------|--------|
| `intake_node` | `def` + `llm.invoke()` | `async def` + 纯规则匹配 |
| `retrieve_node` | `def` + 同步 embed + chroma | `async def` + `asyncio.to_thread()` 包裹 |
| `execute_node` | `def` + `llm.invoke()` | `async def` + `await llm.ainvoke()` |
| `finalize_node` | `def` + 字符串拼接 | `async def` + 字符串拼接 |

`build_chat_llm()` 增加 `streaming=True`，让 `ainvoke()` 底层走流式 HTTP。

### 3. 真流式 astream_events（P0-2）

**chat 路由核心逻辑**：

```python
async for event in graph.astream_events(initial_state, version="v2"):
    if event["event"] == "on_chat_model_stream":
        token = event["data"]["chunk"].content
        yield sse_content_chunk(token)
    elif event["event"] == "on_chain_end" and event["name"] == "finalize":
        citation_text = event["data"]["output"].get("citation_text", "")
        if citation_text:
            yield sse_content_chunk("\n\n" + citation_text)
```

**finalize 节点配合**：增加 `citation_text` 独立输出字段。

**非流式模式**：`stream=False` 时用 `await graph.ainvoke()`，返回完整 JSON。

## 改动文件

| 文件 | 改动 |
|------|------|
| `agent/nodes/intake.py` | LLM → 规则引擎，改 async |
| `agent/nodes/retrieve.py` | 改 async + `asyncio.to_thread()` |
| `agent/nodes/execute.py` | 改 async + `await llm.ainvoke()`，`streaming=True` |
| `agent/nodes/finalize.py` | 改 async，增加 `citation_text` 输出 |
| `agent/state.py` | 增加 `citation_text` 字段 |
| `agent/graph.py` | 节点已 async，调用方式不变 |
| `agent/llm.py` | `build_chat_llm()` 加 `streaming=True` |
| `api/routes/chat.py` | 重写：流式用 `astream_events`，非流式用 `ainvoke` |

## 预期效果

| 指标 | 优化前 | 优化后 |
|------|--------|--------|
| 首 token 延迟 | ~10-15s | ~2-3s |
| 并发能力 | 1 请求阻塞全部 | 多请求并行 |
| LLM 调用次数 | 2 次/请求 | 1 次/请求 |
| 体感速度 | 等很久一次性出来 | 立刻逐字出现 |

## 测试计划

1. 单元测试：规则引擎的 intent 分类覆盖
2. 集成测试：async 图完整运行（intake → retrieve → execute → finalize）
3. 流式测试：验证 SSE chunk 格式符合 OpenAI 规范
4. 回归测试：现有 99 个测试全部通过
5. 手动测试：在 Open WebUI 中对比优化前后的响应速度
