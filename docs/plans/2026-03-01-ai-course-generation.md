# AI 自动生成马术障碍赛路线设计图 - 实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**目标：** 为马术障碍赛路线设计器添加AI自然语言生成功能，用户输入设计需求描述，AI自动生成符合FEI规则的路线设计方案

**架构：** 采用LLM（意图解析）+ 规则引擎（布局生成）的混合架构。LLM负责理解用户自然语言输入并转换为结构化参数，规则引擎负责基于马术比赛规则生成具体的障碍物布局和骑乘路径。计费系统采用按次付费模式。

**技术栈：**
- 前端：Vue 3 + TypeScript + Element Plus
- 后端：Django REST Framework + Python
- LLM：支持多提供商（OpenAI / Anthropic / Azure OpenAI）
- 缓存：Redis（已集成，用于 Channels）
- 计费：集成现有会员订单系统

---

## 阶段一：数据模型与后端基础设施

### Task 1: 创建AI配额数据模型

**文件：**
- Modify: `BackEnd/user/models.py` (添加新模型)
- Create: `BackEnd/user/migrations/0017_aigenerationquota.py` (通过 makemigrations 自动生成)
- Create: `BackEnd/user/migrations/0018_aigenerationhistory.py` (通过 makemigrations 自动生成)
- Modify: `BackEnd/user/tests.py` (添加测试)

**设计要点：**
- 关联 `UserProfile` 而非直接关联 `User`（与现有会员系统保持一致）
- 支持免费配额 + 购买配额分离
- 记录 token 消耗（用于成本控制）

```python
# BackEnd/user/models.py 添加

class AIGenerationQuota(models.Model):
    """AI生成配额"""
    user_profile = models.OneToOneField(
        'user.UserProfile',
        on_delete=models.CASCADE,
        related_name='ai_quota',
        verbose_name='用户资料'
    )
    free_quota = models.PositiveIntegerField(default=3, verbose_name='免费配额')
    purchased_quota = models.PositiveIntegerField(default=0, verbose_name='购买配额')
    used_quota = models.PositiveIntegerField(default=0, verbose_name='已使用')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='创建时间')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='更新时间')

    @property
    def remaining_quota(self):
        return self.free_quota + self.purchased_quota - self.used_quota

    def __str__(self):
        return f"{self.user_profile.user.username} - 剩余{self.remaining_quota}次"

    class Meta:
        verbose_name = 'AI生成配额'
        verbose_name_plural = 'AI生成配额'


class AIGenerationHistory(models.Model):
    """AI生成历史记录"""
    user_profile = models.ForeignKey(
        'user.UserProfile',
        on_delete=models.CASCADE,
        related_name='ai_histories',
        verbose_name='用户资料'
    )
    prompt = models.TextField(verbose_name='用户输入')
    result = models.JSONField(null=True, blank=True, verbose_name='生成结果')
    token_used = models.PositiveIntegerField(default=0, verbose_name='消耗token数')
    cost = models.DecimalField(max_digits=10, decimal_places=2, default=0, verbose_name='成本')
    status = models.CharField(max_length=20, choices=[
        ('pending', '处理中'),
        ('success', '成功'),
        ('failed', '失败'),
    ], default='pending', verbose_name='状态')
    error_message = models.TextField(blank=True, null=True, verbose_name='错误信息')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='创建时间')

    def __str__(self):
        return f"{self.user_profile.user.username} - {self.created_at}"

    class Meta:
        verbose_name = 'AI生成历史'
        verbose_name_plural = 'AI生成历史'
        ordering = ['-created_at']
```

**Step 1: 编写测试**

```python
# BackEnd/user/tests.py 添加

from django.test import TestCase
from django.contrib.auth.models import User
from user.models import UserProfile, AIGenerationQuota, AIGenerationHistory


class AIGenerationQuotaTest(TestCase):
    """AI生成配额测试"""
    
    def setUp(self):
        self.user = User.objects.create_user('testuser', 'test@example.com', 'password123')
        self.profile, _ = UserProfile.objects.get_or_create(user=self.user)
    
    def test_ai_generation_quota_creation(self):
        """测试AI生成配额模型创建"""
        quota = AIGenerationQuota.objects.create(
            user_profile=self.profile, 
            free_quota=10, 
            purchased_quota=10
        )
        self.assertEqual(quota.remaining_quota, 20)

    def test_ai_generation_quota_deduction(self):
        """测试配额扣减"""
        quota = AIGenerationQuota.objects.create(
            user_profile=self.profile, 
            free_quota=10, 
            used_quota=3
        )
        self.assertEqual(quota.remaining_quota, 7)

    def test_ai_generation_history_creation(self):
        """测试历史记录创建"""
        history = AIGenerationHistory.objects.create(
            user_profile=self.profile,
            prompt='测试提示词',
            status='success'
        )
        self.assertEqual(history.status, 'success')
```

**Step 2: 运行测试验证失败**

```bash
cd BackEnd
uv run python manage.py test user.tests.AIGenerationQuotaTest
# 预期：FAIL - 模型不存在
```

**Step 3: 创建模型并迁移**

```bash
cd BackEnd
uv run python manage.py makemigrations user
uv run python manage.py migrate user
```

**Step 4: 运行测试验证通过**

```bash
cd BackEnd
uv run python manage.py test user.tests.AIGenerationQuotaTest
# 预期：PASS
```

**Step 5: 提交**

```bash
git add BackEnd/user/models.py BackEnd/user/tests.py BackEnd/user/migrations/
git commit -m "feat: 添加AI生成配额和历史记录模型"
```

---

### Task 2: 创建 LLM 服务抽象层

**目标：** 支持多 LLM 提供商，便于后续切换和扩展

**文件：**
- Create: `BackEnd/user/llm_providers.py` - LLM 提供商抽象
- Modify: `BackEnd/user/tests.py` - 添加测试

**设计要点：**
- 抽象 Provider 接口
- 支持 OpenAI / Anthropic
- 实现重试机制和错误处理

```python
# BackEnd/user/llm_providers.py

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional, Dict, Any
import os
import logging
import time
from functools import wraps

logger = logging.getLogger(__name__)


@dataclass
class LLMResponse:
    """LLM响应数据"""
    content: str
    token_used: int
    model: str


def retry_on_error(max_retries=3, delay=1):
    """重试装饰器"""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            last_exception = None
            for attempt in range(max_retries):
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    last_exception = e
                    if attempt < max_retries - 1:
                        time.sleep(delay * (attempt + 1))
                    logger.warning(f"LLM 调用失败 (尝试 {attempt + 1}/{max_retries}): {str(e)}")
            raise last_exception
        return wrapper
    return decorator


class BaseLLMProvider(ABC):
    """LLM 提供商基类"""

    @abstractmethod
    def generate(self, prompt: str, system_prompt: str = None, **kwargs) -> LLMResponse:
        pass

    @abstractmethod
    def get_model_name(self) -> str:
        pass


class OpenAIProvider(BaseLLMProvider):
    """OpenAI 提供商"""
    
    def __init__(self, api_key: str = None, model: str = "gpt-4o"):
        try:
            from openai import OpenAI
            self.client = OpenAI(api_key=api_key or os.getenv("OPENAI_API_KEY"))
            self.model = model
        except ImportError:
            raise ImportError("请安装 openai: uv add openai")

    @retry_on_error(max_retries=3)
    def generate(self, prompt: str, system_prompt: str = None, **kwargs) -> LLMResponse:
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})
        
        response = self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=kwargs.get("temperature", 0.3),
            max_tokens=kwargs.get("max_tokens", 2000)
        )
        return LLMResponse(
            content=response.choices[0].message.content,
            token_used=response.usage.total_tokens,
            model=self.model
        )

    def get_model_name(self) -> str:
        return self.model


class AnthropicProvider(BaseLLMProvider):
    """Anthropic 提供商"""
    
    def __init__(self, api_key: str = None, model: str = "claude-3-5-sonnet-20241022"):
        try:
            import anthropic
            self.client = anthropic.Anthropic(api_key=api_key or os.getenv("ANTHROPIC_API_KEY"))
            self.model = model
        except ImportError:
            raise ImportError("请安装 anthropic: uv add anthropic")

    @retry_on_error(max_retries=3)
    def generate(self, prompt: str, system_prompt: str = None, **kwargs) -> LLMResponse:
        messages = [{"role": "user", "content": prompt}]
        
        message = self.client.messages.create(
            model=self.model,
            max_tokens=kwargs.get("max_tokens", 2000),
            system=system_prompt,
            messages=messages
        )
        content = message.content[0].text
        return LLMResponse(
            content=content,
            token_used=message.usage.input_tokens + message.usage.output_tokens,
            model=self.model
        )

    def get_model_name(self) -> str:
        return self.model


def get_llm_provider(provider: str = None) -> BaseLLMProvider:
    """获取 LLM 提供商实例"""
    provider = provider or os.getenv("AI_PROVIDER", "openai").lower()

    providers = {
        "openai": OpenAIProvider,
        "anthropic": AnthropicProvider,
    }

    if provider not in providers:
        raise ValueError(f"不支持的 LLM 提供商: {provider}")

    return providers[provider]()
```

**Step 1: 编写测试**

```python
# BackEnd/user/tests.py 添加

class LLMProviderTest(TestCase):
    """LLM提供商测试"""
    
    def test_openai_provider_initialization(self):
        """测试 OpenAI 提供商初始化"""
        from user.llm_providers import OpenAIProvider
        provider = OpenAIProvider(api_key="test-key", model="gpt-4o")
        self.assertEqual(provider.model, "gpt-4o")

    def test_get_llm_provider(self):
        """测试获取提供商"""
        from user.llm_providers import get_llm_provider, OpenAIProvider
        provider = get_llm_provider("openai")
        self.assertIsInstance(provider, OpenAIProvider)
```

**Step 2: 运行测试**

```bash
cd BackEnd
uv run python manage.py test user.tests.LLMProviderTest
```

**Step 3: 提交**

```bash
git add BackEnd/user/llm_providers.py BackEnd/user/tests.py
git commit -m "feat: 添加LLM服务抽象层"
```

---

### Task 3: 创建路线生成规则引擎

**目标：** 基于马术比赛规则生成障碍物布局

**文件：**
- Create: `BackEnd/user/route_generator.py` - 路线生成规则引擎
- Modify: `BackEnd/user/tests.py` - 添加测试

**设计要点：**
- FEI 障碍物间距要求（最小6米）
- 场地尺寸限制
- 难度级别控制
- 输出格式与前端 `Obstacle` 类型匹配

```python
# BackEnd/user/route_generator.py

from dataclasses import dataclass, asdict
from typing import List, Dict, Any, Optional
import random
import math
import uuid


@dataclass
class ObstacleConfig:
    """障碍物配置 - 与前端 Obstacle 类型匹配"""
    id: str
    type: str  # SINGLE, DOUBLE, COMBINATION, WALL, LIVERPOOL, WATER
    position: Dict[str, float]  # {x, y}
    rotation: float
    number: str
    poles: List[Dict[str, Any]]
    wallProperties: Optional[Dict[str, Any]] = None
    liverpoolProperties: Optional[Dict[str, Any]] = None
    waterProperties: Optional[Dict[str, Any]] = None


@dataclass
class PathPoint:
    """路径点"""
    x: float
    y: float
    controlPoint1: Optional[Dict[str, float]] = None
    controlPoint2: Optional[Dict[str, float]] = None


@dataclass
class RouteConfig:
    """路线配置"""
    field_width: float = 90  # 米
    field_height: float = 60  # 米
    obstacle_count: int = 12
    difficulty: str = "medium"  # easy, medium, hard
    include_combinations: bool = True
    start_position: tuple = (10, 10)  # 起点 x, y
    end_position: tuple = (80, 50)  # 终点 x, y


class RouteGenerator:
    """路线生成规则引擎"""

    # FEI 障碍物间距要求（米）
    MIN_OBSTACLE_DISTANCE = 6.0
    FIELD_MARGIN = 5.0  # 场地边距

    # 障碍物类型权重（根据难度）
    OBSTACLE_TYPE_WEIGHTS = {
        'easy': {'SINGLE': 0.7, 'DOUBLE': 0.3},
        'medium': {'SINGLE': 0.5, 'DOUBLE': 0.3, 'COMBINATION': 0.1, 'LIVERPOOL': 0.1},
        'hard': {'SINGLE': 0.3, 'DOUBLE': 0.25, 'COMBINATION': 0.2, 'WALL': 0.1, 'LIVERPOOL': 0.15}
    }

    def generate(self, config: RouteConfig) -> Dict[str, Any]:
        """生成完整路线设计"""
        obstacles = self._generate_obstacles(config)
        path = self._generate_path(obstacles, config)
        
        return {
            'obstacles': [asdict(o) for o in obstacles],
            'path': path,
            'difficulty_score': self._calculate_difficulty(obstacles),
            'estimated_time': self._estimate_time(obstacles, path),
            'explanation': self._generate_explanation(obstacles),
            'teaching_notes': self._generate_teaching_notes(obstacles, config.difficulty)
        }

    def _generate_obstacles(self, config: RouteConfig) -> List[ObstacleConfig]:
        """生成障碍物列表"""
        obstacles = []
        used_positions = []
        
        weights = self.OBSTACLE_TYPE_WEIGHTS.get(config.difficulty, self.OBSTACLE_TYPE_WEIGHTS['medium'])
        types = list(weights.keys())
        probs = list(weights.values())

        for i in range(config.obstacle_count):
            # 选择障碍物类型
            obs_type = random.choices(types, weights=probs, k=1)[0]
            
            # 生成有效位置
            position = self._find_valid_position(config, used_positions)
            if position:
                used_positions.append(position)
                
                obstacle = self._create_obstacle(
                    obstacle_id=str(uuid.uuid4()),
                    obs_type=obs_type,
                    x=position[0],
                    y=position[1],
                    number=str(i + 1)
                )
                obstacles.append(obstacle)

        return obstacles

    def _find_valid_position(self, config: RouteConfig, used_positions: List[tuple]) -> Optional[tuple]:
        """找到有效的障碍物位置"""
        max_attempts = 100
        
        for _ in range(max_attempts):
            x = random.uniform(self.FIELD_MARGIN, config.field_width - self.FIELD_MARGIN)
            y = random.uniform(self.FIELD_MARGIN, config.field_height - self.FIELD_MARGIN)
            
            # 检查与其他障碍物的距离
            valid = True
            for pos in used_positions:
                dist = math.sqrt((x - pos[0])**2 + (y - pos[1])**2)
                if dist < self.MIN_OBSTACLE_DISTANCE:
                    valid = False
                    break
            
            if valid:
                return (x, y)
        
        return None

    def _create_obstacle(self, obstacle_id: str, obs_type: str, x: float, y: float, number: str) -> ObstacleConfig:
        """创建障碍物配置"""
        rotation = random.choice([0, 90, 180, 270])
        
        # 基础横杆配置
        poles = [{'height': 1.4, 'width': 3.5, 'color': '#8B4513'}]
        wall_props = None
        liverpool_props = None
        water_props = None

        if obs_type == 'DOUBLE':
            poles = [
                {'height': 1.3, 'width': 3.5, 'color': '#8B4513', 'spacing': 0.7},
                {'height': 1.4, 'width': 3.5, 'color': '#654321'}
            ]
        elif obs_type == 'COMBINATION':
            poles = [
                {'height': 1.2, 'width': 3.5, 'color': '#8B4513', 'spacing': 0.6},
                {'height': 1.3, 'width': 3.5, 'color': '#654321', 'spacing': 0.6},
                {'height': 1.4, 'width': 3.5, 'color': '#8B4513'}
            ]
        elif obs_type == 'LIVERPOOL':
            poles = [
                {'height': 1.3, 'width': 3.5, 'color': '#8B4513'}
            ]
            liverpool_props = {
                'width': 3.5,
                'height': 1.6,
                'waterDepth': 0.2,
                'waterColor': '#1E90FF',
                'hasRail': True
            }
        elif obs_type == 'WALL':
            wall_props = {
                'width': 3.5,
                'height': 1.6,
                'color': '#808080'
            }
        elif obs_type == 'WATER':
            water_props = {
                'width': 4.0,
                'depth': 2.0,
                'color': '#1E90FF',
                'borderColor': '#4169E1',
                'borderWidth': 0.1
            }

        return ObstacleConfig(
            id=obstacle_id,
            type=obs_type,
            position={'x': round(x, 2), 'y': round(y, 2)},
            rotation=rotation,
            number=number,
            poles=poles,
            wallProperties=wall_props,
            liverpoolProperties=liverpool_props,
            waterProperties=water_props
        )

    def _generate_path(self, obstacles: List[ObstacleConfig], config: RouteConfig) -> Dict[str, Any]:
        """生成骑乘路径"""
        if not obstacles:
            return {'visible': False, 'points': []}

        # 按编号排序
        sorted_obstacles = sorted(obstacles, key=lambda o: int(o.number))
        
        points = []
        
        # 起点
        first_obs = sorted_obstacles[0]
        points.append({'x': first_obs.position['x'] - 3, 'y': first_obs.position['y']})
        
        # 经过每个障碍物
        for obs in sorted_obstacles:
            points.append({'x': obs.position['x'], 'y': obs.position['y']})
        
        # 终点
        last_obs = sorted_obstacles[-1]
        points.append({'x': last_obs.position['x'] + 3, 'y': last_obs.position['y']})

        return {
            'visible': True,
            'points': points,
            'startPoint': {'x': points[0]['x'], 'y': points[0]['y'], 'rotation': 0},
            'endPoint': {'x': points[-1]['x'], 'y': points[-1]['y'], 'rotation': 180}
        }

    def _calculate_difficulty(self, obstacles: List[ObstacleConfig]) -> float:
        """计算难度评分 (0-10)"""
        type_weights = {
            'SINGLE': 1, 'DOUBLE': 1.5, 'COMBINATION': 2,
            'WALL': 2, 'LIVERPOOL': 2.5, 'WATER': 2.5
        }
        
        score = sum(type_weights.get(o.type, 1) for o in obstacles)
        normalized = min(score / (len(obstacles) * 2) * 10, 10)
        return round(normalized, 1)

    def _estimate_time(self, obstacles: List[ObstacleConfig], path: Dict) -> int:
        """估算完成时间（秒）"""
        if not path.get('points'):
            return 0
        
        points = path['points']
        total_length = sum(
            math.sqrt((points[i]['x'] - points[i-1]['x'])**2 + 
                     (points[i]['y'] - points[i-1]['y'])**2)
            for i in range(1, len(points))
        )
        
        # 平均速度 350 米/分钟
        return int((total_length / 350) * 60)

    def _generate_explanation(self, obstacles: List[ObstacleConfig]) -> str:
        """生成设计说明"""
        type_counts = {}
        for obs in obstacles:
            type_counts[obs.type] = type_counts.get(obs.type, 0) + 1
        
        explanation = f"本路线共包含 {len(obstacles)} 道障碍物。"
        
        type_names = {
            'SINGLE': '单横杆', 'DOUBLE': '双横杆', 'COMBINATION': '组合障碍',
            'WALL': '砖墙', 'LIVERPOOL': '利物浦', 'WATER': '水障'
        }
        
        for obs_type, count in type_counts.items():
            if count > 0:
                explanation += f"其中{type_names.get(obs_type, obs_type)} {count} 道，"
        
        return explanation.rstrip('，') + '。'

    def _generate_teaching_notes(self, obstacles: List[ObstacleConfig], difficulty: str) -> str:
        """生成教学建议"""
        notes = []
        
        if difficulty == 'easy':
            notes.append("适合初学者训练基础节奏感")
        elif difficulty == 'medium':
            notes.append("适合中级骑手提升技术水平")
        else:
            notes.append("适合高级骑手挑战极限")
        
        types = [o.type for o in obstacles]
        if 'LIVERPOOL' in types:
            notes.append("注意利物浦障碍的水池训练")
        if 'COMBINATION' in types:
            notes.append("组合障碍需要精准的节奏控制")
        
        return ' | '.join(notes)
```

**Step 1: 编写测试**

```python
# BackEnd/user/tests.py 添加

class RouteGeneratorTest(TestCase):
    """路线生成器测试"""
    
    def test_route_generator_basic(self):
        """测试路线生成器基本功能"""
        from user.route_generator import RouteGenerator, RouteConfig

        generator = RouteGenerator()
        config = RouteConfig(obstacle_count=10)
        result = generator.generate(config)

        self.assertEqual(len(result['obstacles']), 10)
        self.assertTrue(result['path']['visible'])
        self.assertGreater(result['difficulty_score'], 0)

    def test_obstacle_spacing(self):
        """测试障碍物间距"""
        from user.route_generator import RouteGenerator, RouteConfig

        generator = RouteGenerator()
        config = RouteConfig(obstacle_count=8)
        result = generator.generate(config)

        obstacles = result['obstacles']
        for i in range(len(obstacles)):
            for j in range(i + 1, len(obstacles)):
                dist = math.sqrt(
                    (obstacles[i]['position']['x'] - obstacles[j]['position']['x'])**2 +
                    (obstacles[i]['position']['y'] - obstacles[j]['position']['y'])**2
                )
                self.assertGreaterEqual(dist, 6.0, f"障碍物间距不足: {dist}")
```

**Step 2: 运行测试**

```bash
cd BackEnd
uv run python manage.py test user.tests.RouteGeneratorTest
```

**Step 3: 提交**

```bash
git add BackEnd/user/route_generator.py BackEnd/user/tests.py
git commit -m "feat: 添加路线生成规则引擎"
```

---

### Task 4: 创建 AI 生成 API

**文件：**
- Create: `BackEnd/user/ai_views.py` - AI 生成视图
- Modify: `BackEnd/user/urls.py` - 添加路由
- Modify: `BackEnd/user/tests.py` - 添加测试

```python
# BackEnd/user/ai_views.py

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.utils import timezone
import logging
import json

from .models import AIGenerationQuota, AIGenerationHistory
from .llm_providers import get_llm_provider
from .route_generator import RouteGenerator, RouteConfig

logger = logging.getLogger(__name__)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def generate_route(request):
    """AI 生成路线"""
    # 1. 获取用户资料和配额
    profile = request.user.userprofile
    quota, _ = AIGenerationQuota.objects.get_or_create(user_profile=profile)

    # 2. 检查配额
    if quota.remaining_quota <= 0:
        return Response({
            'code': status.HTTP_403_FORBIDDEN,
            'message': '配额不足，请购买后再试'
        }, status=status.HTTP_403_FORBIDDEN)

    # 3. 获取用户输入
    prompt = request.data.get('prompt', '')
    config_data = request.data.get('config', {})

    if not prompt:
        return Response({
            'code': status.HTTP_400_BAD_REQUEST,
            'message': '请输入设计需求描述'
        }, status=status.HTTP_400_BAD_REQUEST)

    # 4. 创建历史记录
    history = AIGenerationHistory.objects.create(
        user_profile=profile,
        prompt=prompt,
        status='pending'
    )

    try:
        # 5. 调用 LLM 解析意图
        provider = get_llm_provider()
        system_prompt = """你是一个马术障碍赛路线设计助手。
根据用户的描述，提取以下参数并以JSON格式返回：
{
    "obstacle_count": 数字(8-15),
    "difficulty": "easy"或"medium"或"hard",
    "field_width": 数字(默认90),
    "field_height": 数字(默认60),
    "include_combinations": true或false
}
只返回JSON，不要其他内容。"""
        
        llm_response = provider.generate(prompt, system_prompt=system_prompt)
        
        # 解析LLM返回的参数
        try:
            import re
            json_match = re.search(r'\{.*\}', llm_response.content, re.DOTALL)
            if json_match:
                params = json.loads(json_match.group())
            else:
                params = {}
        except json.JSONDecodeError:
            params = {}

        # 6. 合并用户配置和LLM解析结果
        route_config = RouteConfig(
            field_width=params.get('field_width', config_data.get('field_width', 90)),
            field_height=params.get('field_height', config_data.get('field_height', 60)),
            obstacle_count=params.get('obstacle_count', config_data.get('obstacle_count', 12)),
            difficulty=params.get('difficulty', config_data.get('difficulty', 'medium')),
            include_combinations=params.get('include_combinations', True)
        )

        # 7. 调用规则引擎生成路线
        generator = RouteGenerator()
        result = generator.generate(route_config)

        # 8. 更新历史记录
        history.result = result
        history.token_used = llm_response.token_used
        history.status = 'success'
        history.save()

        # 9. 扣减配额
        quota.used_quota += 1
        quota.save()

        # 10. 返回结果
        return Response({
            'code': status.HTTP_200_OK,
            'message': '生成成功',
            'data': {
                'history_id': history.id,
                'obstacles': result['obstacles'],
                'path': result['path'],
                'difficulty_score': result['difficulty_score'],
                'estimated_time': result['estimated_time'],
                'explanation': result['explanation'],
                'teaching_notes': result['teaching_notes'],
                'remaining_quota': quota.remaining_quota
            }
        })

    except Exception as e:
        logger.error(f"AI生成失败: {str(e)}")
        history.status = 'failed'
        history.error_message = str(e)
        history.save()

        return Response({
            'code': status.HTTP_500_INTERNAL_SERVER_ERROR,
            'message': f'生成失败: {str(e)}'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_ai_quota(request):
    """获取 AI 配额信息"""
    profile = request.user.userprofile
    quota, _ = AIGenerationQuota.objects.get_or_create(user_profile=profile)

    return Response({
        'code': status.HTTP_200_OK,
        'data': {
            'free_quota': quota.free_quota,
            'purchased_quota': quota.purchased_quota,
            'used_quota': quota.used_quota,
            'remaining_quota': quota.remaining_quota
        }
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def purchase_ai_quota(request):
    """购买 AI 配额"""
    from .models import MembershipOrder
    import random
    import time
    
    quota_amount = request.data.get('quota', 10)
    
    # 价格配置
    prices = {
        10: 9.90,
        30: 24.90,
        100: 69.90
    }
    
    price = prices.get(quota_amount, quota_amount * 1.0)
    
    # 创建订单
    order = MembershipOrder.objects.create(
        user=request.user,
        order_id=f"AI{int(time.time())}{random.randint(1000,9999)}",
        membership_plan=None,
        amount=price,
        payment_channel='alipay',
        status='pending',
        billing_cycle='one_time',
        note=f"AI生成次数 x {quota_amount}"
    )
    
    return Response({
        'code': status.HTTP_200_OK,
        'message': '订单创建成功',
        'data': {
            'order_id': order.order_id,
            'amount': str(price),
            'quota_count': quota_amount
        }
    })
```

**urls.py 修改：**

```python
# BackEnd/user/urls.py 添加

from . import ai_views

urlpatterns = [
    # ... 现有路由 ...
    
    # AI 生成相关
    path("ai/generate/", ai_views.generate_route, name="ai_generate"),
    path("ai/quota/", ai_views.get_ai_quota, name="ai_quota"),
    path("ai/purchase/", ai_views.purchase_ai_quota, name="ai_purchase"),
]
```

**Step 1: 运行测试**

```bash
cd BackEnd
uv run python manage.py test user.tests
```

**Step 2: 提交**

```bash
git add BackEnd/user/ai_views.py BackEnd/user/urls.py BackEnd/user/tests.py
git commit -m "feat: 添加AI生成API接口"
```

---

## 阶段二：前端集成

### Task 5: 添加前端 API 配置

**文件：**
- Modify: `FrontEnd/src/config/api.ts` - 添加 AI 端点
- Create: `FrontEnd/src/api/ai.ts` - AI API 服务

```typescript
// FrontEnd/src/config/api.ts 在 endpoints 中添加

// API端点配置
endpoints: {
  // ... 现有配置 ...
  
  // AI 生成相关
  ai: {
    generate: getApiUrl('/user/ai/generate/'),
    quota: getApiUrl('/user/ai/quota/'),
    purchase: getApiUrl('/user/ai/purchase/'),
  },
},
```

```typescript
// FrontEnd/src/api/ai.ts

import { request } from '@/utils/request'
import type { Obstacle } from '@/types/obstacle'

export interface AIGenerateRequest {
  prompt: string
  config?: {
    field_width?: number
    field_height?: number
    obstacle_count?: number
    difficulty?: 'easy' | 'medium' | 'hard'
  }
}

export interface AIGenerateResponse {
  history_id: number
  obstacles: Obstacle[]
  path: {
    visible: boolean
    points: Array<{ x: number; y: number }>
    startPoint: { x: number; y: number; rotation: number }
    endPoint: { x: number; y: number; rotation: number }
  }
  difficulty_score: number
  estimated_time: number
  explanation: string
  teaching_notes: string
  remaining_quota: number
}

export interface AIQuotaInfo {
  free_quota: number
  purchased_quota: number
  used_quota: number
  remaining_quota: number
}

export const aiApi = {
  generate(data: AIGenerateRequest) {
    return request.post<{ code: number; message: string; data: AIGenerateResponse }>(
      '/user/ai/generate/',
      data
    )
  },

  getQuota() {
    return request.get<{ code: number; data: AIQuotaInfo }>('/user/ai/quota/')
  },

  purchase(quota: number) {
    return request.post<{ code: number; data: { order_id: string; amount: string } }>(
      '/user/ai/purchase/',
      { quota }
    )
  }
}
```

**Step 1: 提交**

```bash
git add FrontEnd/src/config/api.ts FrontEnd/src/api/ai.ts
git commit -m "feat: 添加前端AI API配置"
```

---

### Task 6: 创建 AI 生成对话框组件

**文件：**
- Create: `FrontEnd/src/components/AIGenerateDialog.vue`

```vue
<template>
  <el-dialog 
    v-model="dialogVisible" 
    title="AI 智能生成路线" 
    width="600px"
    :close-on-click-modal="false"
    destroy-on-close
  >
    <!-- 配额信息 -->
    <div class="quota-info">
      <el-tag :type="quotaInfo.remaining_quota > 0 ? 'success' : 'danger'">
        剩余次数: {{ quotaInfo.remaining_quota }}
      </el-tag>
      <el-button size="small" text type="primary" @click="handlePurchase">
        购买次数
      </el-button>
    </div>

    <!-- 输入区域 -->
    <el-form :model="form" label-position="top" class="ai-form">
      <el-form-item label="描述你的设计需求">
        <el-input
          v-model="form.prompt"
          type="textarea"
          :rows="4"
          placeholder="例如：设计一条中等难度的路线，包含12个障碍物，要有组合障碍和利物浦..."
          :disabled="isGenerating || quotaInfo.remaining_quota <= 0"
          maxlength="500"
          show-word-limit
        />
      </el-form-item>

      <el-row :gutter="16">
        <el-col :span="12">
          <el-form-item label="障碍物数量">
            <el-slider v-model="form.config.obstacle_count" :min="8" :max="15" show-stops />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="难度级别">
            <el-radio-group v-model="form.config.difficulty">
              <el-radio-button value="easy">简单</el-radio-button>
              <el-radio-button value="medium">中等</el-radio-button>
              <el-radio-button value="hard">困难</el-radio-button>
            </el-radio-group>
          </el-form-item>
        </el-col>
      </el-row>
    </el-form>

    <!-- 生成结果 -->
    <div v-if="result" class="result-section">
      <el-divider>生成结果</el-divider>
      
      <el-card class="result-card">
        <div class="result-stats">
          <span><el-icon><Odometer /></el-icon> 障碍物: {{ result.obstacles.length }}</span>
          <span><el-icon><TrendCharts /></el-icon> 难度: {{ result.difficulty_score }}/10</span>
          <span><el-icon><Timer /></el-icon> 预估: {{ result.estimated_time }}s</span>
        </div>
        
        <div class="result-explanation">
          <h4>设计说明</h4>
          <p>{{ result.explanation }}</p>
        </div>
        
        <div v-if="result.teaching_notes" class="teaching-notes">
          <h4>教学建议</h4>
          <p>{{ result.teaching_notes }}</p>
        </div>
      </el-card>
    </div>

    <template #footer>
      <el-button @click="dialogVisible = false">取消</el-button>
      <el-button 
        type="primary" 
        :loading="isGenerating"
        :disabled="!form.prompt.trim() || quotaInfo.remaining_quota <= 0"
        @click="handleGenerate"
      >
        {{ isGenerating ? '生成中...' : '生成' }}
      </el-button>
      <el-button 
        type="success"
        v-if="result"
        @click="applyResult"
      >
        应用到画布
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Odometer, TrendCharts, Timer } from '@element-plus/icons-vue'
import { useUserStore } from '@/stores/user'
import { useCourseStore } from '@/stores/course'
import { aiApi, type AIQuotaInfo, type AIGenerateResponse } from '@/api/ai'

const router = useRouter()
const userStore = useUserStore()
const courseStore = useCourseStore()

const dialogVisible = ref(false)
const isGenerating = ref(false)
const result = ref<AIGenerateResponse | null>(null)

const quotaInfo = reactive<AIQuotaInfo>({
  free_quota: 0,
  purchased_quota: 0,
  used_quota: 0,
  remaining_quota: 0
})

const form = reactive({
  prompt: '',
  config: {
    field_width: 90,
    field_height: 60,
    obstacle_count: 12,
    difficulty: 'medium' as const
  }
})

const fetchQuota = async () => {
  if (!userStore.isAuthenticated) return
  
  try {
    const response = await aiApi.getQuota()
    if (response.data) {
      Object.assign(quotaInfo, response.data)
    }
  } catch (error) {
    console.error('获取配额失败:', error)
  }
}

const handleGenerate = async () => {
  if (!form.prompt.trim() || quotaInfo.remaining_quota <= 0) return
  
  isGenerating.value = true
  result.value = null
  
  try {
    const response = await aiApi.generate({
      prompt: form.prompt,
      config: form.config
    })
    
    if (response.code === 200 && response.data) {
      result.value = response.data
      quotaInfo.remaining_quota = response.data.remaining_quota
      ElMessage.success(`生成成功！剩余次数: ${response.data.remaining_quota}`)
    }
  } catch (error: any) {
    const message = error.response?.data?.message || '生成失败，请稍后重试'
    ElMessage.error(message)
  } finally {
    isGenerating.value = false
  }
}

const applyResult = () => {
  if (!result.value) return
  
  courseStore.importAIResult({
    obstacles: result.value.obstacles,
    path: result.value.path
  })
  
  dialogVisible.value = false
  ElMessage.success('已应用到画布')
}

const handlePurchase = () => {
  dialogVisible.value = false
  router.push('/profile')
}

const open = () => {
  dialogVisible.value = true
  result.value = null
  fetchQuota()
}

defineExpose({ open })
</script>

<style scoped lang="scss">
.quota-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  margin-bottom: 16px;
  background: #f5f7fa;
  border-radius: 8px;
}

.ai-form {
  :deep(.el-form-item) {
    margin-bottom: 16px;
  }
}

.result-section {
  margin-top: 16px;
}

.result-card {
  .result-stats {
    display: flex;
    gap: 24px;
    margin-bottom: 16px;
    
    span {
      display: flex;
      align-items: center;
      gap: 4px;
      color: #606266;
    }
  }
  
  .result-explanation, .teaching-notes {
    margin-top: 12px;
    
    h4 {
      margin-bottom: 8px;
      color: #303133;
      font-size: 14px;
    }
    
    p {
      color: #606266;
      line-height: 1.6;
      margin: 0;
    }
  }
  
  .teaching-notes {
    padding-top: 12px;
    border-top: 1px dashed #dcdfe6;
    
    h4 {
      color: #409eff;
    }
  }
}
</style>
```

**Step 1: 提交**

```bash
git add FrontEnd/src/components/AIGenerateDialog.vue
git commit -m "feat: 添加AI生成对话框组件"
```

---

### Task 7: 扩展 Course Store

**文件：**
- Modify: `FrontEnd/src/stores/course.ts` - 添加 AI 结果导入方法

在 `useCourseStore` 的 return 语句之前添加：

```typescript
/**
 * 导入AI生成的路线设计
 * @param aiResult AI生成的设计结果
 */
function importAIResult(aiResult: { obstacles: Obstacle[], path: any }) {
  if (!aiResult.obstacles || aiResult.obstacles.length === 0) {
    console.error('AI生成结果无效：没有障碍物数据')
    return false
  }

  // 应用障碍物 - 重新生成ID避免冲突
  currentCourse.value.obstacles = aiResult.obstacles.map(obs => ({
    ...obs,
    id: uuidv4(),
    position: obs.position || { x: 10, y: 10 },
    rotation: obs.rotation || 0,
    poles: obs.poles || [{ height: 1.4, width: 3.5, color: '#8B4513' }]
  }))

  // 应用路径
  if (aiResult.path && aiResult.path.visible) {
    coursePath.value.visible = true
    coursePath.value.points = aiResult.path.points || []
    
    if (aiResult.path.startPoint) {
      startPoint.value = {
        x: aiResult.path.startPoint.x,
        y: aiResult.path.startPoint.y,
        rotation: aiResult.path.startPoint.rotation || 0
      }
    }
    
    if (aiResult.path.endPoint) {
      endPoint.value = {
        x: aiResult.path.endPoint.x,
        y: aiResult.path.endPoint.y,
        rotation: aiResult.path.endPoint.rotation || 0
      }
    }
  } else if (currentCourse.value.obstacles.length > 0) {
    generatePath()
  }

  currentCourse.value.updatedAt = new Date().toISOString()
  updateCourse()
  
  return true
}
```

在 return 对象中添加：

```typescript
return {
  // ... 现有导出 ...
  importAIResult,
}
```

**Step 1: 提交**

```bash
git add FrontEnd/src/stores/course.ts
git commit -m "feat: 添加AI结果导入方法到course store"
```

---

### Task 8: 集成到 ToolBar 组件

**文件：**
- Modify: `FrontEnd/src/components/ToolBar.vue`

在 ToolBar.vue 中添加 AI 生成按钮和对话框：

```vue
<!-- 在工具栏按钮区域添加 -->
<el-button 
  type="primary" 
  class="toolbar-btn ai-btn"
  @click="showAIGenerate"
>
  <el-icon><MagicStick /></el-icon>
  AI生成
</el-button>

<!-- 在模板末尾添加对话框 -->
<AIGenerateDialog ref="aiDialogRef" />
```

```typescript
// 在 <script setup> 中添加
import { MagicStick } from '@element-plus/icons-vue'
import AIGenerateDialog from './AIGenerateDialog.vue'

const aiDialogRef = ref<InstanceType<typeof AIGenerateDialog> | null>(null)

const showAIGenerate = () => {
  if (!userStore.isAuthenticated) {
    ElMessage.warning('请先登录后再使用AI生成功能')
    emit('show-login')
    return
  }
  aiDialogRef.value?.open()
}
```

**Step 1: 提交**

```bash
git add FrontEnd/src/components/ToolBar.vue
git commit -m "feat: 将AI生成功能集成到ToolBar"
```

---

## 阶段三：环境配置与部署

### Task 9: 更新环境变量配置

**文件：**
- Modify: `BackEnd/.env.example`

```bash
# BackEnd/.env.example 添加

# AI 服务配置
AI_PROVIDER=openai  # openai 或 anthropic
OPENAI_API_KEY=your-openai-api-key
ANTHROPIC_API_KEY=your-anthropic-api-key

# AI 服务参数
AI_MAX_TOKENS=2000
AI_TEMPERATURE=0.3
```

**Step 1: 提交**

```bash
git add BackEnd/.env.example
git commit -m "docs: 添加AI服务环境变量配置"
```

---

### Task 10: 更新 Admin 后台

**文件：**
- Modify: `BackEnd/user/admin.py`

```python
# BackEnd/user/admin.py 添加

from .models import AIGenerationQuota, AIGenerationHistory

@admin.register(AIGenerationQuota)
class AIGenerationQuotaAdmin(admin.ModelAdmin):
    list_display = ['user_profile', 'free_quota', 'purchased_quota', 'used_quota', 'remaining_quota', 'updated_at']
    list_filter = ['updated_at']
    search_fields = ['user_profile__user__username']
    readonly_fields = ['remaining_quota', 'created_at', 'updated_at']


@admin.register(AIGenerationHistory)
class AIGenerationHistoryAdmin(admin.ModelAdmin):
    list_display = ['user_profile', 'prompt', 'status', 'token_used', 'created_at']
    list_filter = ['status', 'created_at']
    search_fields = ['user_profile__user__username', 'prompt']
    readonly_fields = ['created_at']
```

**Step 1: 提交**

```bash
git add BackEnd/user/admin.py
git commit -m "feat: 添加AI配额和历史记录Admin管理"
```

---

## 实施检查清单

- [ ] Task 1: 创建AI配额数据模型
- [ ] Task 2: 创建LLM服务抽象层
- [ ] Task 3: 创建路线生成规则引擎
- [ ] Task 4: 创建AI生成API
- [ ] Task 5: 添加前端API配置
- [ ] Task 6: 创建AI生成对话框组件
- [ ] Task 7: 扩展Course Store
- [ ] Task 8: 集成到ToolBar组件
- [ ] Task 9: 更新环境变量配置
- [ ] Task 10: 更新Admin后台

---

## 依赖项

### 后端（使用 uv 管理）
```bash
cd BackEnd

# 安装 OpenAI（必需）
uv add openai

# 安装 Anthropic（可选）
uv add anthropic
```

### 前端
无需新增依赖

---

## 关键集成点

| 现有系统 | 集成方式 |
|----------|----------|
| 会员系统 | 复用 `UserProfile`，通过 `AIGenerationQuota` 扩展 |
| 支付系统 | 复用 `MembershipOrder`，通过 `note` 字段区分 |
| 认证系统 | 复用现有 JWT 认证 |
| 前端 Store | 复用 `useCourseStore.importAIResult()` |
| API 配置 | 在 `api.ts` 添加 `ai` 端点 |

---

## 注意事项

1. **LLM API Key 安全**：生产环境必须通过环境变量配置，禁止硬编码
2. **配额并发控制**：高并发场景需要考虑配额扣减的原子性
3. **错误处理**：LLM 调用可能失败，已有重试机制
4. **成本控制**：记录 token 消耗，便于后续成本分析
