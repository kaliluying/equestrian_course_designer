from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional, cast
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


def require_config(config: Optional[str], env_var: str, example: str = None) -> str:
    """检查配置是否存在，不存在则抛出错误"""
    if not config:
        msg = f"请设置 {env_var} 环境变量"
        if example:
            msg += f" (如: {example})"
        raise ValueError(msg)
    return config


class BaseLLMProvider(ABC):
    """LLM 提供商基类"""

    @abstractmethod
    def generate(self, prompt: str, system_prompt: Optional[str] = None, **kwargs) -> LLMResponse:
        pass

    @abstractmethod
    def get_model_name(self) -> str:
        pass


class OpenAICompatibleProvider(BaseLLMProvider):
    """OpenAI 兼容 API 提供商"""

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        base_url: Optional[str] = None
    ):
        # 读取统一配置
        self.api_key = cast(str, require_config(
            api_key or os.getenv("API_KEY"),
            "API_KEY"
        ))
        self.model = cast(str, require_config(
            model or os.getenv("MODEL"),
            "MODEL", "gpt-4o, MiniMax-M2.5"
        ))
        self.base_url = cast(str, require_config(
            base_url or os.getenv("BASE_URL"),
            "BASE_URL", "https://api.openai.com/v1"
        ))

        try:
            from openai import OpenAI
            self.client = OpenAI(
                api_key=self.api_key,
                base_url=self.base_url
            )
        except ImportError:
            raise ImportError("请安装 openai: uv add openai")

    @retry_on_error(max_retries=3)
    def generate(self, prompt: str, system_prompt: Optional[str] = None, **kwargs) -> LLMResponse:
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        response = self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=kwargs.get("temperature", 0.3),
            max_tokens=kwargs.get("max_tokens", 2000),
            timeout=kwargs.get("timeout", 60)
        )

        if not response.choices:
            raise ValueError("LLM 返回空响应")
        content = response.choices[0].message.content
        if not content:
            raise ValueError("LLM 返回空内容")

        return LLMResponse(
            content=content,
            token_used=response.usage.total_tokens,
            model=self.model
        )

    def get_model_name(self) -> str:
        return self.model


class AnthropicCompatibleProvider(BaseLLMProvider):
    """Anthropic 兼容 API 提供商"""

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        base_url: Optional[str] = None
    ):
        # 读取统一配置
        self.api_key = cast(str, require_config(
            api_key or os.getenv("API_KEY"),
            "API_KEY"
        ))
        self.model = cast(str, require_config(
            model or os.getenv("MODEL"),
            "MODEL", "claude-3-5-sonnet-20241022"
        ))
        self.base_url = cast(str, require_config(
            base_url or os.getenv("BASE_URL"),
            "BASE_URL", "https://api.anthropic.com"
        ))

        try:
            import anthropic
            self.client = anthropic.Anthropic(
                api_key=self.api_key,
                base_url=self.base_url
            )
        except ImportError:
            raise ImportError("请安装 anthropic: uv add anthropic")

    @retry_on_error(max_retries=3)
    def generate(self, prompt: str, system_prompt: Optional[str] = None, **kwargs) -> LLMResponse:
        messages = [{"role": "user", "content": prompt}]

        message = self.client.messages.create(
            model=self.model,
            max_tokens=kwargs.get("max_tokens", 2000),
            system=system_prompt,
            messages=messages
        )

        # 处理不同类型的响应内容 (TextBlock, ThinkingBlock 等)
        content_parts = []
        for block in message.content:
            # 检查是否有 text 属性 (TextBlock)
            if hasattr(block, 'text'):
                content_parts.append(block.text)
            # 如果是 ThinkingBlock，跳过思考过程

        content = ''.join(content_parts)
        if not content:
            raise ValueError("LLM 返回空内容")

        return LLMResponse(
            content=content,
            token_used=message.usage.input_tokens + message.usage.output_tokens,
            model=self.model
        )

    def get_model_name(self) -> str:
        return self.model


def get_llm_provider(provider: Optional[str] = None) -> BaseLLMProvider:
    """获取 LLM 提供商实例

    环境变量配置:
    - AI_PROVIDER: openai 或 anthropic (默认: openai)
    - API_KEY: API 密钥
    - MODEL: 模型名称
    - BASE_URL: API 地址

    示例 (MiniMax):
    AI_PROVIDER=openai
    API_KEY=your-key
    MODEL=MiniMax-M2.5
    BASE_URL=https://api.minimaxi.com/v1
    """
    provider = provider or os.getenv("AI_PROVIDER", "openai").lower()

    providers = {
        "openai": OpenAICompatibleProvider,
        "anthropic": AnthropicCompatibleProvider,
    }

    if provider not in providers:
        raise ValueError(f"不支持的 LLM 提供商: {provider}")

    return providers[provider]()
