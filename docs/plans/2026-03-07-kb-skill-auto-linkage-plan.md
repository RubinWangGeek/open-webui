# KB-Skill 自动联动 实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 上传语料后自动创建对应 Skill（description + system_prompt + trigger_words），用户可手动编辑，即使 Skill 匹配失败也始终做全库检索兜底。

**Architecture:** 新增 SkillConfig 持久化层（JSON 文件），DynamicSkill 实现 BaseSkill 接口，Pipeline 末尾自动调 LLM 生成 Skill 配置，Graph 路由改为始终走 retrieve。

**Tech Stack:** Python 3.11, Pydantic, FastAPI, LangChain, Svelte (Open WebUI frontend)

**设计文档:** `docs/plans/2026-03-07-kb-skill-auto-linkage-design.md`

---

## Phase 1: 基础数据层

### Task 1: SkillConfig 数据模型 + 管理器

**Files:**
- Create: `core/skill_config.py`
- Test: `tests/test_skill_config.py`

**Step 1: Write the failing test**

```python
# tests/test_skill_config.py
"""SkillConfig 数据模型 + SkillConfigManager 测试"""

import json
from pathlib import Path

import pytest

from core.skill_config import SkillConfig, SkillConfigManager


class TestSkillConfig:
    """SkillConfig 数据模型测试"""

    def test_create_skill_config(self):
        cfg = SkillConfig(
            skill_id="sawi_personality",
            display_name="赛维人格分析",
            description="基于赛维九型人格理论，分析人的行为模式",
            system_prompt="你是赛维人格分析专家。",
            trigger_words=["赛维", "九型人格"],
            category_filter="sawi_personality",
        )
        assert cfg.skill_id == "sawi_personality"
        assert cfg.auto_generated is True
        assert cfg.enabled is True

    def test_defaults(self):
        cfg = SkillConfig(
            skill_id="test",
            display_name="Test",
            description="Test skill",
            system_prompt="Test prompt",
        )
        assert cfg.trigger_words == []
        assert cfg.category_filter == "test"  # 默认等于 skill_id
        assert cfg.auto_generated is True
        assert cfg.enabled is True


class TestSkillConfigManager:
    """SkillConfigManager 持久化测试"""

    @pytest.fixture(autouse=True)
    def setup(self, tmp_path):
        self.config_path = tmp_path / "skills.json"
        SkillConfigManager.reset_instance()
        self.manager = SkillConfigManager(config_path=self.config_path)

    def test_empty_on_init(self):
        assert self.manager.list_skills() == []

    def test_add_and_get(self):
        cfg = SkillConfig(
            skill_id="test_skill",
            display_name="Test",
            description="A test skill",
            system_prompt="Do the test",
            trigger_words=["test"],
        )
        self.manager.add_skill(cfg)
        result = self.manager.get_skill("test_skill")
        assert result is not None
        assert result.display_name == "Test"

    def test_add_persists_to_json(self):
        cfg = SkillConfig(
            skill_id="test_skill",
            display_name="Test",
            description="A test skill",
            system_prompt="Do the test",
        )
        self.manager.add_skill(cfg)

        # 从文件重新加载
        data = json.loads(self.config_path.read_text("utf-8"))
        assert len(data["skills"]) == 1
        assert data["skills"][0]["skill_id"] == "test_skill"

    def test_update_skill(self):
        cfg = SkillConfig(
            skill_id="test_skill",
            display_name="Test",
            description="Old description",
            system_prompt="Old prompt",
        )
        self.manager.add_skill(cfg)

        updated = SkillConfig(
            skill_id="test_skill",
            display_name="Test Updated",
            description="New description",
            system_prompt="New prompt",
        )
        self.manager.update_skill(updated)
        result = self.manager.get_skill("test_skill")
        assert result.display_name == "Test Updated"
        assert result.description == "New description"

    def test_delete_skill(self):
        cfg = SkillConfig(
            skill_id="test_skill",
            display_name="Test",
            description="A test skill",
            system_prompt="Do the test",
        )
        self.manager.add_skill(cfg)
        self.manager.delete_skill("test_skill")
        assert self.manager.get_skill("test_skill") is None

    def test_has_skill(self):
        assert not self.manager.has_skill("test_skill")
        cfg = SkillConfig(
            skill_id="test_skill",
            display_name="Test",
            description="A test skill",
            system_prompt="Do the test",
        )
        self.manager.add_skill(cfg)
        assert self.manager.has_skill("test_skill")

    def test_list_enabled_only(self):
        self.manager.add_skill(SkillConfig(
            skill_id="enabled_one",
            display_name="Enabled",
            description="d",
            system_prompt="p",
            enabled=True,
        ))
        self.manager.add_skill(SkillConfig(
            skill_id="disabled_one",
            display_name="Disabled",
            description="d",
            system_prompt="p",
            enabled=False,
        ))
        enabled = self.manager.list_enabled_skills()
        assert len(enabled) == 1
        assert enabled[0].skill_id == "enabled_one"
```

**Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_skill_config.py -v`
Expected: FAIL with "ModuleNotFoundError: No module named 'core.skill_config'"

**Step 3: Write minimal implementation**

```python
# core/skill_config.py
"""运行时 Skill 配置管理 — JSON 持久化，支持动态 Skill 增删改查"""

import json
from pathlib import Path

from pydantic import BaseModel, Field

from core.config import settings
from core.logging import logger


class SkillConfig(BaseModel):
    """单个 Skill 的配置"""

    skill_id: str = Field(description="技能唯一标识，等于 category 值")
    display_name: str = Field(description="显示名称")
    description: str = Field(description="技能描述（用于意图分类 prompt）")
    system_prompt: str = Field(description="注入 LLM 的 system prompt")
    trigger_words: list[str] = Field(default_factory=list, description="触发词列表")
    category_filter: str = Field(default="", description="知识库 category 过滤条件")
    auto_generated: bool = Field(default=True, description="是否自动生成")
    enabled: bool = Field(default=True, description="是否启用")

    def model_post_init(self, __context) -> None:
        """category_filter 默认等于 skill_id"""
        if not self.category_filter:
            self.category_filter = self.skill_id


class SkillConfigManager:
    """Skill 配置管理器 — 读写 JSON 文件，提供单例访问"""

    _instance: "SkillConfigManager | None" = None

    def __init__(self, config_path: Path | None = None):
        self._config_path = config_path or (
            Path(settings.KB_STORAGE_DIR) / "config" / "skills.json"
        )
        self._skills: dict[str, SkillConfig] = {}
        self._load()

    @classmethod
    def get_instance(cls) -> "SkillConfigManager":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    @classmethod
    def reset_instance(cls) -> None:
        cls._instance = None

    def _load(self) -> None:
        if self._config_path.exists():
            try:
                data = json.loads(self._config_path.read_text("utf-8"))
                for item in data.get("skills", []):
                    cfg = SkillConfig(**item)
                    self._skills[cfg.skill_id] = cfg
                logger.info("Skill 配置已加载: %d 个技能", len(self._skills))
            except Exception as e:
                logger.warning("加载 Skill 配置失败: %s", e)

    def _save(self) -> None:
        self._config_path.parent.mkdir(parents=True, exist_ok=True)
        data = {"skills": [s.model_dump() for s in self._skills.values()]}
        self._config_path.write_text(
            json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
        )

    def get_skill(self, skill_id: str) -> SkillConfig | None:
        return self._skills.get(skill_id)

    def has_skill(self, skill_id: str) -> bool:
        return skill_id in self._skills

    def list_skills(self) -> list[SkillConfig]:
        return list(self._skills.values())

    def list_enabled_skills(self) -> list[SkillConfig]:
        return [s for s in self._skills.values() if s.enabled]

    def add_skill(self, cfg: SkillConfig) -> None:
        self._skills[cfg.skill_id] = cfg
        self._save()
        logger.info("Skill 已添加: %s (%s)", cfg.skill_id, cfg.display_name)

    def update_skill(self, cfg: SkillConfig) -> None:
        self._skills[cfg.skill_id] = cfg
        self._save()
        logger.info("Skill 已更新: %s", cfg.skill_id)

    def delete_skill(self, skill_id: str) -> None:
        if skill_id in self._skills:
            del self._skills[skill_id]
            self._save()
            logger.info("Skill 已删除: %s", skill_id)
```

**Step 4: Run test to verify it passes**

Run: `.venv/bin/python -m pytest tests/test_skill_config.py -v`
Expected: ALL PASS

**Step 5: Commit**

```bash
cd /Users/em/Dev/AITools/openWeb/agent-core
git add core/skill_config.py tests/test_skill_config.py
git commit -m "feat: add SkillConfig data model and manager with JSON persistence"
```

---

### Task 2: DynamicSkill 类

**Files:**
- Create: `skills/dynamic.py`
- Modify: `tests/test_skills.py`

**Step 1: Write the failing test**

在 `tests/test_skills.py` 末尾追加：

```python
from core.skill_config import SkillConfig
from skills.dynamic import DynamicSkill


class TestDynamicSkill:
    """DynamicSkill 测试"""

    def test_implements_base_skill(self):
        cfg = SkillConfig(
            skill_id="sawi_personality",
            display_name="赛维人格分析",
            description="基于赛维九型人格理论",
            system_prompt="你是赛维人格分析专家。",
            trigger_words=["赛维", "九型人格"],
            category_filter="sawi_personality",
        )
        skill = DynamicSkill(cfg)
        assert skill.name == "sawi_personality"
        assert skill.display_name == "赛维人格分析"
        assert skill.description == "基于赛维九型人格理论"
        assert skill.system_prompt == "你是赛维人格分析专家。"
        assert skill.category_filter == "sawi_personality"
        assert isinstance(skill, BaseSkill)

    def test_trigger_words(self):
        cfg = SkillConfig(
            skill_id="test",
            display_name="Test",
            description="d",
            system_prompt="p",
            trigger_words=["hello", "world"],
        )
        skill = DynamicSkill(cfg)
        assert skill.trigger_words == ["hello", "world"]
```

**Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_skills.py::TestDynamicSkill -v`
Expected: FAIL with "ModuleNotFoundError: No module named 'skills.dynamic'"

**Step 3: Write minimal implementation**

```python
# skills/dynamic.py
"""动态技能 — 从 SkillConfig 创建的 BaseSkill 实现"""

from core.skill_config import SkillConfig
from skills.base import BaseSkill


class DynamicSkill(BaseSkill):
    """从 JSON 配置动态创建的技能"""

    def __init__(self, config: SkillConfig):
        self._config = config

    @property
    def name(self) -> str:
        return self._config.skill_id

    @property
    def display_name(self) -> str:
        return self._config.display_name

    @property
    def description(self) -> str:
        return self._config.description

    @property
    def system_prompt(self) -> str:
        return self._config.system_prompt

    @property
    def category_filter(self) -> str | None:
        return self._config.category_filter

    @property
    def trigger_words(self) -> list[str]:
        return self._config.trigger_words
```

**Step 4: Run test to verify it passes**

Run: `.venv/bin/python -m pytest tests/test_skills.py -v`
Expected: ALL PASS（包括原有测试 + 新 TestDynamicSkill）

**Step 5: Commit**

```bash
cd /Users/em/Dev/AITools/openWeb/agent-core
git add skills/dynamic.py tests/test_skills.py
git commit -m "feat: add DynamicSkill class implementing BaseSkill from config"
```

---

### Task 3: SkillRegistry 加载动态 Skill

**Files:**
- Modify: `skills/registry.py`
- Modify: `tests/test_skills.py`

**Step 1: Write the failing test**

在 `tests/test_skills.py` 的 `TestGetRegistry` 类中追加：

```python
import json
from pathlib import Path
from core.skill_config import SkillConfigManager

class TestRegistryLoadsDynamic:
    """Registry 从 skills.json 加载动态技能"""

    @pytest.fixture(autouse=True)
    def setup(self, tmp_path, monkeypatch):
        # 写入一个 skills.json
        skills_json = tmp_path / "skills.json"
        skills_json.write_text(json.dumps({"skills": [{
            "skill_id": "test_dynamic",
            "display_name": "测试动态",
            "description": "测试动态技能",
            "system_prompt": "你是测试专家。",
            "trigger_words": ["测试"],
            "category_filter": "test_dynamic",
            "auto_generated": True,
            "enabled": True,
        }]}, ensure_ascii=False), "utf-8")

        # 重置单例
        SkillConfigManager.reset_instance()
        SkillConfigManager(config_path=skills_json)
        SkillConfigManager._instance = SkillConfigManager(config_path=skills_json)

        # 重置 registry 单例
        import skills.registry as reg_mod
        reg_mod._registry = None

    def test_dynamic_skill_loaded_in_registry(self):
        from skills.registry import get_registry
        registry = get_registry()
        skill = registry.get("test_dynamic")
        assert skill is not None
        assert skill.display_name == "测试动态"
        assert skill.category_filter == "test_dynamic"

    def test_format_prompt_includes_dynamic_and_trigger_words(self):
        from skills.registry import get_registry
        registry = get_registry()
        prompt = registry.format_for_prompt()
        assert "test_dynamic" in prompt
        assert "测试动态" in prompt
```

**Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_skills.py::TestRegistryLoadsDynamic -v`
Expected: FAIL（registry 还不会加载 dynamic skills）

**Step 3: Modify registry.py**

修改 `skills/registry.py`：

1. `format_for_prompt()` 方法增加 trigger_words 输出
2. `_register_defaults()` 末尾加载动态 Skill

```python
# skills/registry.py — 完整替换

"""技能注册表

单例模式管理所有可用技能，供 Intake 节点列举、Execute 节点查询。
"""

from core.logging import logger
from skills.base import BaseSkill


class SkillRegistry:
    """技能注册表"""

    def __init__(self):
        self._skills: dict[str, BaseSkill] = {}

    def register(self, skill: BaseSkill) -> None:
        """注册技能。"""
        self._skills[skill.name] = skill
        logger.debug("注册技能: %s (%s)", skill.name, skill.display_name)

    def get(self, name: str) -> BaseSkill | None:
        """按名称获取技能。"""
        return self._skills.get(name)

    def list_skills(self) -> list[BaseSkill]:
        """列出所有已注册技能。"""
        return list(self._skills.values())

    def format_for_prompt(self) -> str:
        """生成供 LLM 意图分类使用的技能列表文本（含 trigger_words）。"""
        if not self._skills:
            return "（无可用技能）"

        lines = []
        for skill in self._skills.values():
            line = f"- {skill.name}: {skill.display_name} — {skill.description}"
            # DynamicSkill 有 trigger_words 属性
            trigger_words = getattr(skill, "trigger_words", [])
            if trigger_words:
                line += f"（触发词: {', '.join(trigger_words)}）"
            lines.append(line)
        return "\n".join(lines)


# --- 单例 ---

_registry: SkillRegistry | None = None


def _register_defaults(registry: SkillRegistry) -> None:
    """注册默认技能 + 动态技能。"""
    from skills.first_principles import FirstPrinciplesSkill
    from skills.generic_summary import GenericSummarySkill

    registry.register(FirstPrinciplesSkill())
    registry.register(GenericSummarySkill())

    # 加载动态技能
    try:
        from core.skill_config import SkillConfigManager
        from skills.dynamic import DynamicSkill

        manager = SkillConfigManager.get_instance()
        for cfg in manager.list_enabled_skills():
            if not registry.get(cfg.skill_id):
                registry.register(DynamicSkill(cfg))
                logger.info("动态技能已加载: %s", cfg.skill_id)
    except Exception as e:
        logger.warning("加载动态技能失败: %s", e)


def get_registry() -> SkillRegistry:
    """获取全局 SkillRegistry 单例。"""
    global _registry
    if _registry is None:
        _registry = SkillRegistry()
        _register_defaults(_registry)
    return _registry
```

**Step 4: Run ALL tests to verify no regression**

Run: `.venv/bin/python -m pytest tests/test_skills.py -v`
Expected: ALL PASS

**Step 5: Commit**

```bash
cd /Users/em/Dev/AITools/openWeb/agent-core
git add skills/registry.py tests/test_skills.py
git commit -m "feat: registry loads dynamic skills from SkillConfigManager"
```

---

## Phase 2: Skill 生成器

### Task 4: LLM Skill 生成器

**Files:**
- Create: `skills/generator.py`
- Create: `tests/test_skill_generator.py`

**Step 1: Write the failing test**

```python
# tests/test_skill_generator.py
"""Skill 生成器测试（使用 mock LLM）"""

import json
from unittest.mock import MagicMock, patch

import pytest

from skills.generator import SkillGenerator


class TestSkillGenerator:
    """SkillGenerator 测试"""

    def test_generate_returns_skill_config(self):
        """验证从 LLM 响应中解析出 SkillConfig"""
        mock_response = MagicMock()
        mock_response.content = json.dumps({
            "display_name": "赛维人格分析",
            "description": "基于赛维九型人格理论，分析行为模式",
            "system_prompt": "你是赛维人格分析专家。请从以下维度分析...",
            "trigger_words": ["赛维", "九型人格", "人格类型"],
        }, ensure_ascii=False)

        with patch("skills.generator.build_chat_llm") as mock_llm:
            mock_llm.return_value.invoke.return_value = mock_response
            generator = SkillGenerator()
            cfg = generator.generate(
                category="sawi_personality",
                sample_text="赛维人格密码课程文档...",
            )

        assert cfg.skill_id == "sawi_personality"
        assert cfg.display_name == "赛维人格分析"
        assert "赛维" in cfg.trigger_words
        assert cfg.auto_generated is True
        assert cfg.category_filter == "sawi_personality"

    def test_generate_handles_llm_failure(self):
        """LLM 调用失败时返回基本配置"""
        with patch("skills.generator.build_chat_llm") as mock_llm:
            mock_llm.return_value.invoke.side_effect = Exception("API error")
            generator = SkillGenerator()
            cfg = generator.generate(
                category="sawi_personality",
                sample_text="一些内容...",
            )

        assert cfg.skill_id == "sawi_personality"
        assert cfg.display_name == "sawi_personality"  # fallback 到 category
        assert cfg.auto_generated is True
```

**Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_skill_generator.py -v`
Expected: FAIL with "ModuleNotFoundError: No module named 'skills.generator'"

**Step 3: Write implementation**

```python
# skills/generator.py
"""Skill 生成器 — 使用 LLM 从语料内容生成 Skill 配置"""

import json

from langchain_core.messages import HumanMessage, SystemMessage

from agent.llm import build_chat_llm
from core.logging import logger
from core.skill_config import SkillConfig

GENERATOR_PROMPT = """\
你是一个技能配置生成器。根据以下语料内容样本，生成对应的技能配置。

语料分类: {category}

请输出 JSON（不要输出其他内容）：
{{
    "display_name": "技能的中文显示名称（简短，如'赛维人格分析'）",
    "description": "技能描述，说明这个技能做什么（一句话）",
    "system_prompt": "注入 LLM 的 system prompt，引导 LLM 使用这个方法论/框架来分析问题（详细，包含分析维度和步骤）",
    "trigger_words": ["触发词1", "触发词2", "..."]
}}

trigger_words 要求：
- 包含该领域的核心关键词
- 包含用户可能会用到的口语化表达
- 5-10 个触发词

system_prompt 要求：
- 明确角色定位
- 列出分析维度/步骤
- 要求引用参考资料
"""


class SkillGenerator:
    """从语料样本生成 Skill 配置"""

    def generate(self, category: str, sample_text: str) -> SkillConfig:
        """调用 LLM 生成 Skill 配置。

        Args:
            category: 内容分类（将作为 skill_id）
            sample_text: 语料样本文本（取前 2000 字）

        Returns:
            SkillConfig: 生成的配置
        """
        try:
            llm = build_chat_llm(temperature=0.3, max_tokens=2048)
            system_msg = SystemMessage(content=GENERATOR_PROMPT.format(
                category=category,
            ))
            user_msg = HumanMessage(content=f"语料样本（前 2000 字）:\n\n{sample_text[:2000]}")

            response = llm.invoke([system_msg, user_msg])
            result_text = response.content.strip()

            # 解析 JSON
            if "```json" in result_text:
                result_text = result_text.split("```json")[1].split("```")[0]
            elif "```" in result_text:
                result_text = result_text.split("```")[1].split("```")[0]

            data = json.loads(result_text.strip())

            return SkillConfig(
                skill_id=category,
                display_name=data.get("display_name", category),
                description=data.get("description", f"{category} 领域分析"),
                system_prompt=data.get("system_prompt", f"你是 {category} 领域专家。"),
                trigger_words=data.get("trigger_words", []),
                category_filter=category,
                auto_generated=True,
            )

        except Exception as e:
            logger.warning("Skill 生成失败 (category=%s): %s", category, e)
            return SkillConfig(
                skill_id=category,
                display_name=category,
                description=f"{category} 领域分析",
                system_prompt=f"你是 {category} 领域专家。请根据参考资料回答用户的问题。",
                trigger_words=[],
                category_filter=category,
                auto_generated=True,
            )
```

**Step 4: Run test to verify it passes**

Run: `.venv/bin/python -m pytest tests/test_skill_generator.py -v`
Expected: ALL PASS

**Step 5: Commit**

```bash
cd /Users/em/Dev/AITools/openWeb/agent-core
git add skills/generator.py tests/test_skill_generator.py
git commit -m "feat: add SkillGenerator for LLM-based skill config generation"
```

---

### Task 5: Pipeline 末尾自动生成 Skill

**Files:**
- Modify: `content_pipeline/pipeline.py` (在 Step 6 Embed 之后加入 Skill 生成)
- Modify: `tests/test_pipeline.py` (加一个集成测试)

**Step 1: Write the failing test**

在 `tests/test_pipeline.py` 末尾追加：

```python
class TestPipelineSkillGeneration:
    """Pipeline 自动生成 Skill 测试"""

    def test_process_triggers_skill_generation(self, tmp_path, monkeypatch):
        """处理完成后，如果对应 category 无 Skill，则自动生成"""
        from core.skill_config import SkillConfigManager

        # 重置 SkillConfigManager 单例，指向临时文件
        skills_json = tmp_path / "skills.json"
        SkillConfigManager.reset_instance()
        SkillConfigManager._instance = SkillConfigManager(config_path=skills_json)

        # 验证初始状态无 Skill
        assert not SkillConfigManager.get_instance().has_skill("sawi_personality")

        # mock SkillGenerator
        from unittest.mock import patch, MagicMock
        from core.skill_config import SkillConfig

        mock_cfg = SkillConfig(
            skill_id="sawi_personality",
            display_name="赛维人格分析",
            description="desc",
            system_prompt="prompt",
            trigger_words=["赛维"],
        )

        with patch("content_pipeline.pipeline.SkillGenerator") as MockGen:
            MockGen.return_value.generate.return_value = mock_cfg

            # 创建 pipeline 并处理（使用 mock 的各组件）
            # 这里只测试 _maybe_generate_skill 方法
            from content_pipeline.pipeline import ContentPipeline
            pipeline = ContentPipeline()
            pipeline._maybe_generate_skill("sawi_personality", "sample text here")

        # 验证 Skill 已生成
        assert SkillConfigManager.get_instance().has_skill("sawi_personality")
```

**Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_pipeline.py::TestPipelineSkillGeneration -v`
Expected: FAIL with "AttributeError: 'ContentPipeline' object has no attribute '_maybe_generate_skill'"

**Step 3: Modify pipeline.py**

在 `content_pipeline/pipeline.py` 中添加：

1. 文件顶部 import 区域添加:
```python
from core.skill_config import SkillConfigManager
from skills.generator import SkillGenerator
```

2. `ContentPipeline` 类中，在 `process()` 方法的 `_report(ProcessingStatus.COMPLETED, ...)` **之前**（约第 152 行前），添加:
```python
            # 7. Auto-generate Skill（如果该 category 还没有对应 Skill）
            self._maybe_generate_skill(cat_str, extracted.text)
```

3. 在 `ContentPipeline` 类中添加新方法:
```python
    def _maybe_generate_skill(self, category: str, sample_text: str) -> None:
        """如果该 category 还没有对应 Skill，自动生成一个。"""
        if category == "generic":
            return  # generic 不需要专属 Skill

        try:
            manager = SkillConfigManager.get_instance()
            if manager.has_skill(category):
                logger.info("Skill '%s' 已存在，跳过生成", category)
                return

            generator = SkillGenerator()
            cfg = generator.generate(category=category, sample_text=sample_text)
            manager.add_skill(cfg)
            logger.info("自动生成 Skill: %s (%s)", cfg.skill_id, cfg.display_name)
        except Exception as e:
            logger.warning("自动生成 Skill 失败 (category=%s): %s", category, e)
```

**Step 4: Run test to verify it passes**

Run: `.venv/bin/python -m pytest tests/test_pipeline.py::TestPipelineSkillGeneration -v`
Expected: PASS

然后运行全量测试确认无回归:
Run: `.venv/bin/python -m pytest tests/ -v`
Expected: ALL PASS

**Step 5: Commit**

```bash
cd /Users/em/Dev/AITools/openWeb/agent-core
git add content_pipeline/pipeline.py tests/test_pipeline.py
git commit -m "feat: pipeline auto-generates Skill for new categories"
```

---

## Phase 3: 始终检索 + 路由修正

### Task 6: Graph 路由改为始终走 retrieve

**Files:**
- Modify: `agent/graph.py`
- Modify: `tests/test_agent_graph.py`

**Step 1: Write the failing test**

在 `tests/test_agent_graph.py` 中找到或添加路由测试:

```python
class TestRouteAfterIntake:
    """Intake 后路由逻辑测试"""

    def test_always_routes_to_retrieve(self):
        """所有 intent 都应路由到 retrieve（始终检索兜底）"""
        from agent.graph import _route_after_intake

        assert _route_after_intake({"intent": "skill_request"}) == "retrieve"
        assert _route_after_intake({"intent": "knowledge_query"}) == "retrieve"
        assert _route_after_intake({"intent": "general_chat"}) == "retrieve"
        assert _route_after_intake({}) == "retrieve"
```

**Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_agent_graph.py::TestRouteAfterIntake -v`
Expected: FAIL（当前 general_chat 路由到 "execute"）

**Step 3: Modify graph.py**

将 `_route_after_intake` 函数简化为：

```python
def _route_after_intake(state: AgentState) -> str:
    """Intake 后路由：始终走 retrieve，确保知识库检索兜底。"""
    return "retrieve"
```

**Step 4: Run test to verify it passes**

Run: `.venv/bin/python -m pytest tests/test_agent_graph.py -v`
Expected: ALL PASS

**Step 5: Commit**

```bash
cd /Users/em/Dev/AITools/openWeb/agent-core
git add agent/graph.py tests/test_agent_graph.py
git commit -m "fix: always route to retrieve after intake for knowledge fallback"
```

---

### Task 7: Intake prompt 加入 trigger_words

**Files:**
- Modify: `agent/nodes/intake.py`（已部分修改，需要确认 trigger_words 信息传递正确）

**说明:** `intake.py` 在之前的 session 中已经被修改过（加了 `kb_topics` 和更好的分类规则）。本次需要确认这些修改是正确的，且 `format_for_prompt()` 已经包含 trigger_words（Task 3 中 registry.py 已改）。

**Step 1: 验证当前状态**

Run: `.venv/bin/python -m pytest tests/test_agent_graph.py -v`
Expected: ALL PASS（intake.py 的修改应兼容现有测试）

**Step 2: 无需额外代码修改**

registry.py 的 `format_for_prompt()` 已包含 trigger_words，intake.py 调用 `registry.format_for_prompt()` 即可获取含触发词的技能列表。intake.py 之前已加入的 `kb_topics` 改动也是正确的。

**Step 3: 运行全量测试**

Run: `.venv/bin/python -m pytest tests/ -v`
Expected: ALL PASS

**Step 4: Commit（如果 intake.py 有未提交的改动）**

```bash
cd /Users/em/Dev/AITools/openWeb/agent-core
git add agent/nodes/intake.py
git commit -m "feat: intake prompt includes kb topics for better classification"
```

---

### Task 8: Retrieve 从 Skill 对象读 category_filter

**Files:**
- Modify: `agent/nodes/retrieve.py`

**Step 1: 确认当前行为**

当前 `retrieve.py:25` 直接用 `category = matched_skill`，这在动态 Skill 中也是正确的（因为 skill_id == category_filter）。但更准确的做法是从 Skill 对象读 `category_filter`。

**Step 2: Modify retrieve.py**

将第 22-25 行替换：

```python
    # 如果有匹配的技能，读取其 category_filter
    category = None
    if matched_skill:
        try:
            from skills.registry import get_registry
            skill = get_registry().get(matched_skill)
            category = skill.category_filter if skill else matched_skill
        except Exception:
            category = matched_skill
```

**Step 3: Run all tests**

Run: `.venv/bin/python -m pytest tests/ -v`
Expected: ALL PASS

**Step 4: Commit**

```bash
cd /Users/em/Dev/AITools/openWeb/agent-core
git add agent/nodes/retrieve.py
git commit -m "refac: retrieve reads category_filter from Skill object"
```

---

## Phase 4: API + 前端

### Task 9: Skill CRUD API 端点

**Files:**
- Modify: `api/routes/settings.py`
- Modify: `apps/api.py`（无需修改，settings_router 已注册）

**Step 1: Write the failing test**

在 `tests/test_api.py` 中追加（或新建 `tests/test_skill_api.py`）：

```python
# tests/test_skill_api.py
"""Skill API 端点测试"""

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from apps.api import app
from core.skill_config import SkillConfigManager


@pytest.fixture(autouse=True)
def reset_skill_config(tmp_path):
    skills_json = tmp_path / "skills.json"
    SkillConfigManager.reset_instance()
    SkillConfigManager._instance = SkillConfigManager(config_path=skills_json)
    yield
    SkillConfigManager.reset_instance()


client = TestClient(app)


class TestSkillAPI:
    """Skill CRUD API 测试"""

    def test_list_skills_empty(self):
        res = client.get("/v1/settings/skills")
        assert res.status_code == 200
        assert res.json() == {"skills": []}

    def test_create_skill(self):
        res = client.post("/v1/settings/skills", json={
            "skill_id": "test_skill",
            "display_name": "Test Skill",
            "description": "A test skill",
            "system_prompt": "You are a test expert.",
            "trigger_words": ["test"],
        })
        assert res.status_code == 200
        assert res.json()["status"] == "ok"

        # 验证已创建
        res = client.get("/v1/settings/skills")
        skills = res.json()["skills"]
        assert len(skills) == 1
        assert skills[0]["skill_id"] == "test_skill"

    def test_update_skill(self):
        # 先创建
        client.post("/v1/settings/skills", json={
            "skill_id": "test_skill",
            "display_name": "Old Name",
            "description": "Old",
            "system_prompt": "Old",
        })
        # 再更新
        res = client.put("/v1/settings/skills/test_skill", json={
            "skill_id": "test_skill",
            "display_name": "New Name",
            "description": "New",
            "system_prompt": "New",
            "trigger_words": ["new"],
        })
        assert res.status_code == 200

        result = client.get("/v1/settings/skills")
        assert result.json()["skills"][0]["display_name"] == "New Name"

    def test_delete_skill(self):
        client.post("/v1/settings/skills", json={
            "skill_id": "test_skill",
            "display_name": "Test",
            "description": "d",
            "system_prompt": "p",
        })
        res = client.delete("/v1/settings/skills/test_skill")
        assert res.status_code == 200

        result = client.get("/v1/settings/skills")
        assert len(result.json()["skills"]) == 0
```

**Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_skill_api.py -v`
Expected: FAIL with 404（路由不存在）

**Step 3: Add Skill endpoints to settings.py**

在 `api/routes/settings.py` 末尾追加：

```python
from core.skill_config import SkillConfig, SkillConfigManager


# === Skill Settings ===

@router.get("/skills")
async def list_skills():
    """列出所有 Skill 配置"""
    manager = SkillConfigManager.get_instance()
    return {"skills": [s.model_dump() for s in manager.list_skills()]}


@router.post("/skills")
async def create_skill(config: SkillConfig):
    """创建新 Skill"""
    manager = SkillConfigManager.get_instance()
    if manager.has_skill(config.skill_id):
        return {"status": "error", "error": f"Skill '{config.skill_id}' already exists"}
    manager.add_skill(config)
    return {"status": "ok", "skill_id": config.skill_id}


@router.put("/skills/{skill_id}")
async def update_skill(skill_id: str, config: SkillConfig):
    """更新 Skill 配置"""
    manager = SkillConfigManager.get_instance()
    if not manager.has_skill(skill_id):
        return {"status": "error", "error": f"Skill '{skill_id}' not found"}
    manager.update_skill(config)
    return {"status": "ok", "skill_id": skill_id}


@router.delete("/skills/{skill_id}")
async def delete_skill(skill_id: str):
    """删除 Skill"""
    manager = SkillConfigManager.get_instance()
    manager.delete_skill(skill_id)
    return {"status": "ok", "skill_id": skill_id}
```

**Step 4: Run test to verify it passes**

Run: `.venv/bin/python -m pytest tests/test_skill_api.py -v`
Expected: ALL PASS

全量回归:
Run: `.venv/bin/python -m pytest tests/ -v`
Expected: ALL PASS

**Step 5: Commit**

```bash
cd /Users/em/Dev/AITools/openWeb/agent-core
git add api/routes/settings.py tests/test_skill_api.py
git commit -m "feat: add Skill CRUD API endpoints"
```

---

### Task 10: 前端 API 客户端

**Files:**
- Modify: `src/lib/apis/agentcore/index.ts`

**Step 1: 在 `index.ts` 的 `// === LLM Settings ===` 注释之前，追加：**

```typescript
// === Skill Settings ===

export const getSkills = async () => {
	let error = null;

	const res = await fetch(`${AGENT_CORE_URL}/v1/settings/skills`, {
		method: 'GET',
		headers: { Accept: 'application/json' }
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			error = err.detail || err.message || 'Failed to get skills';
			console.error(err);
			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};

export const createSkill = async (skill: {
	skill_id: string;
	display_name: string;
	description: string;
	system_prompt: string;
	trigger_words: string[];
	category_filter?: string;
	enabled?: boolean;
}) => {
	let error = null;

	const res = await fetch(`${AGENT_CORE_URL}/v1/settings/skills`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(skill)
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			error = err.detail || err.message || 'Failed to create skill';
			console.error(err);
			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};

export const updateSkill = async (
	skillId: string,
	skill: {
		skill_id: string;
		display_name: string;
		description: string;
		system_prompt: string;
		trigger_words: string[];
		category_filter?: string;
		enabled?: boolean;
	}
) => {
	let error = null;

	const res = await fetch(`${AGENT_CORE_URL}/v1/settings/skills/${skillId}`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(skill)
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			error = err.detail || err.message || 'Failed to update skill';
			console.error(err);
			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};

export const deleteSkill = async (skillId: string) => {
	let error = null;

	const res = await fetch(`${AGENT_CORE_URL}/v1/settings/skills/${skillId}`, {
		method: 'DELETE',
		headers: { Accept: 'application/json' }
	})
		.then(async (res) => {
			if (!res.ok) throw await res.json();
			return res.json();
		})
		.catch((err) => {
			error = err.detail || err.message || 'Failed to delete skill';
			console.error(err);
			return null;
		});

	if (error) {
		throw error;
	}

	return res;
};
```

**Step 2: Commit**

```bash
cd /Users/em/Dev/AITools/openWeb/open-webui
git add src/lib/apis/agentcore/index.ts
git commit -m "feat: add Skill CRUD API client functions"
```

---

### Task 11: Settings UI 增加 Skills 管理区块

**Files:**
- Modify: `src/lib/components/admin/Knowledge/AgentSettings.svelte`

**Step 1: 在 AgentSettings.svelte 中添加 Skills 管理区块**

在现有 `<!-- Retrieval Settings -->` 区块**之前**，插入 Skills 管理 section。

需要修改的内容：

1. **script 区域追加 import 和 state:**

```javascript
import { getSkills, createSkill, updateSkill, deleteSkill } from '$lib/apis/agentcore';

// Skills state
let skills = [];
let editingSkillId = '';
```

2. **loadSettings() 函数末尾追加:**

```javascript
// 加载 Skills
try {
    const skillsData = await getSkills();
    if (skillsData) {
        skills = skillsData.skills || [];
    }
} catch (err) {
    console.error('Failed to load skills:', err);
}
```

3. **追加 Skills 相关函数:**

```javascript
async function handleSaveSkill(skill) {
    try {
        if (editingSkillId) {
            await updateSkill(skill.skill_id, skill);
            toast.success(`Skill "${skill.display_name}" updated`);
        } else {
            await createSkill(skill);
            toast.success(`Skill "${skill.display_name}" created`);
        }
        editingSkillId = '';
        // 重新加载
        const data = await getSkills();
        skills = data?.skills || [];
    } catch (err) {
        toast.error('Failed to save skill: ' + err);
    }
}

async function handleDeleteSkill(skillId) {
    try {
        await deleteSkill(skillId);
        toast.success('Skill deleted');
        const data = await getSkills();
        skills = data?.skills || [];
    } catch (err) {
        toast.error('Failed to delete skill: ' + err);
    }
}

async function handleToggleSkill(skill) {
    skill.enabled = !skill.enabled;
    await handleSaveSkill(skill);
}
```

4. **在 `<!-- Retrieval Settings -->` 之前添加 HTML:**

```svelte
<!-- Skills Management -->
<div class="border-t border-gray-200 dark:border-gray-700 pt-4">
    <div class="flex items-center justify-between mb-3">
        <label class="text-sm font-medium text-gray-700 dark:text-gray-300">
            {$i18n.t('Skills')} ({skills.length})
        </label>
    </div>

    {#if skills.length === 0}
        <div class="text-sm text-gray-400 py-4 text-center border border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
            {$i18n.t('No skills configured. Upload content with a category to auto-generate.')}
        </div>
    {/if}

    <div class="flex flex-col gap-3">
        {#each skills as skill}
            <div class="border rounded-lg p-3 {skill.enabled
                ? 'border-gray-300 dark:border-gray-600'
                : 'border-gray-200 dark:border-gray-700 opacity-60'}">
                <div class="flex items-center justify-between mb-2">
                    <div class="flex items-center gap-2">
                        <span class="font-medium text-sm">{skill.display_name}</span>
                        {#if skill.auto_generated}
                            <span class="text-xs px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                                Auto
                            </span>
                        {/if}
                        <span class="text-xs text-gray-400">{skill.skill_id}</span>
                    </div>
                    <div class="flex items-center gap-1">
                        <button
                            class="px-2 py-1 text-xs rounded {skill.enabled
                                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}"
                            on:click={() => handleToggleSkill(skill)}
                        >
                            {skill.enabled ? 'Enabled' : 'Disabled'}
                        </button>
                        <button
                            class="px-2 py-1 text-xs rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                            on:click={() => handleDeleteSkill(skill.skill_id)}
                        >
                            Delete
                        </button>
                    </div>
                </div>

                <div class="text-xs text-gray-500 mb-2">{skill.description}</div>

                <!-- Editable fields -->
                <details class="text-sm">
                    <summary class="cursor-pointer text-xs text-blue-500 hover:text-blue-600 mb-2">
                        Edit details
                    </summary>
                    <div class="flex flex-col gap-2 mt-2">
                        <div>
                            <label class="text-xs text-gray-500">Display Name</label>
                            <input
                                type="text"
                                bind:value={skill.display_name}
                                class="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-sm"
                            />
                        </div>
                        <div>
                            <label class="text-xs text-gray-500">Description</label>
                            <input
                                type="text"
                                bind:value={skill.description}
                                class="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-sm"
                            />
                        </div>
                        <div>
                            <label class="text-xs text-gray-500">Trigger Words (comma separated)</label>
                            <input
                                type="text"
                                value={skill.trigger_words?.join(', ') || ''}
                                on:change={(e) => { skill.trigger_words = e.target.value.split(',').map(s => s.trim()).filter(Boolean); }}
                                class="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-sm"
                            />
                        </div>
                        <div>
                            <label class="text-xs text-gray-500">System Prompt</label>
                            <textarea
                                bind:value={skill.system_prompt}
                                rows="4"
                                class="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-sm"
                            />
                        </div>
                        <div class="flex justify-end">
                            <button
                                class="px-3 py-1 text-xs rounded-lg bg-blue-500 text-white hover:bg-blue-600"
                                on:click={() => handleSaveSkill(skill)}
                            >
                                Save Changes
                            </button>
                        </div>
                    </div>
                </details>
            </div>
        {/each}
    </div>
</div>
```

**Step 2: Commit**

```bash
cd /Users/em/Dev/AITools/openWeb/open-webui
git add src/lib/components/admin/Knowledge/AgentSettings.svelte
git commit -m "feat: add Skills management UI in AgentSettings"
```

---

## Phase 5: 集成验证

### Task 12: 后端全量测试 + 重启

**Step 1: 运行全量测试**

```bash
cd /Users/em/Dev/AITools/openWeb/agent-core
.venv/bin/python -m pytest tests/ -v
```
Expected: ALL PASS（99+ tests）

**Step 2: 重启 agent-core**

```bash
lsof -i :8000 -t | xargs kill 2>/dev/null; sleep 1
cd /Users/em/Dev/AITools/openWeb/agent-core
PATH="/opt/homebrew/bin:$PATH" nohup .venv/bin/python -m uvicorn apps.api:app --port 8000 > /tmp/agent-core.log 2>&1 &
sleep 3
curl -s http://localhost:8000/health | python3 -c "import sys,json; print(json.load(sys.stdin))"
```
Expected: `{'status': 'ok', 'version': '0.1.0', 'app': 'agent-core'}`

**Step 3: 验证 Skill API**

```bash
# 列出 Skills（应为空）
curl -s http://localhost:8000/v1/settings/skills | python3 -m json.tool

# 手动创建一个测试 Skill
curl -s -X POST http://localhost:8000/v1/settings/skills \
  -H "Content-Type: application/json" \
  -d '{"skill_id":"sawi_personality","display_name":"赛维人格分析","description":"基于赛维九型人格理论","system_prompt":"你是赛维人格分析专家。","trigger_words":["赛维","九型人格","人格类型"]}'

# 验证 skills.json 已生成
cat kb_storage/config/skills.json | python3 -m json.tool
```

**Step 4: 测试始终检索行为**

```bash
# 用赛维问题测试 — 应该走 retrieve 路径
curl -s -X POST http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"agent-core","stream":false,"messages":[{"role":"user","content":"根据赛维来说他是什么人"}]}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['choices'][0]['message']['content'][:500])"
```

检查日志确认走了 retrieve:
```bash
grep -E "意图分类|检索到" /tmp/agent-core.log | tail -5
```

---

### Task 13: 前端 Docker 重建

**Step 1: 重建 Open WebUI Docker**

```bash
cd /Users/em/Dev/AITools/openWeb/open-webui
./scripts/rebuild.sh
```

**Step 2: 浏览器验证**

1. 打开 `http://localhost:3000`
2. Admin → Knowledge → Settings
3. 确认 Skills 区块可见
4. 确认已生成的 sawi_personality Skill 显示正确
5. 编辑 trigger_words，Save，刷新确认持久化
6. 切换到聊天，测试赛维人格问题

---

## 验证检查清单

- [ ] 上传赛维语料后，skills.json 自动出现 sawi_personality Skill
- [ ] Settings UI 能看到并编辑该 Skill（description, system_prompt, trigger_words）
- [ ] 用户问"根据赛维来说他是什么人" → 匹配 sawi_personality → 检索赛维语料 → 专属 prompt 回答
- [ ] 用户问不相关问题 → 未匹配 → 仍然全库检索兜底
- [ ] 99+ tests 无回归
- [ ] Docker 重建成功，前端 UI 正常显示
