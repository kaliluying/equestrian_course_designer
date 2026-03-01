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
    def generate(self, prompt: str, system_prompt: Optional[str] = None, **kwargs) -> LLMResponse:
        pass

    @abstractmethod
    def get_model_name(self) -> str:
        pass


class OpenAIProvider(BaseLLMProvider):
    """OpenAI 提供商"""

    def __init__(self, api_key: Optional[str] = None, model: Optional[str] = None):
        try:
            from openai import OpenAI
            self.client = OpenAI(api_key=api_key or os.getenv("OPENAI_API_KEY"))
            # 支持从环境变量读取模型配置
            self.model = model or os.getenv("OPENAI_MODEL", "gpt-4o")
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

        # 验证响应内容
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


class AnthropicProvider(BaseLLMProvider):
    """Anthropic 提供商"""

    def __init__(self, api_key: Optional[str] = None, model: Optional[str] = None):
        try:
            import anthropic
            self.client = anthropic.Anthropic(api_key=api_key or os.getenv("ANTHROPIC_API_KEY"))
            # 支持从环境变量读取模型配置
            self.model = model or os.getenv("ANTHROPIC_MODEL", "claude-3-5-sonnet-20241022")
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
        content = message.content[0].text
        return LLMResponse(
            content=content,
            token_used=message.usage.input_tokens + message.usage.output_tokens,
            model=self.model
        )

    def get_model_name(self) -> str:
        return self.model


def get_llm_provider(provider: Optional[str] = None) -> BaseLLMProvider:
    """获取 LLM 提供商实例"""
    provider = provider or os.getenv("AI_PROVIDER", "openai").lower()

    providers = {
        "openai": OpenAIProvider,
        "anthropic": AnthropicProvider,
    }

    if provider not in providers:
        raise ValueError(f"不支持的 LLM 提供商: {provider}")

    return providers[provider]()
