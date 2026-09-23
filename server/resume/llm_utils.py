"""Gemini helpers for resume scoring (Azure OpenAI kept commented for rollback)."""

from __future__ import annotations

import json
import os
import re
from typing import Any
import json_repair

from openai import OpenAI

# from openai import AzureOpenAI  # DISABLED — Gemini migration

GEMINI_FLASH_MODEL = os.environ.get("GEMINI_FLASH_MODEL", "gemini-3.5-flash").strip() or "gemini-3.5-flash"
GEMINI_OPENAI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"


def get_model_name() -> str:
    # Resume scoring → Flash (structured JSON quality)
    if os.environ.get("GOOGLE_API_KEY"):
        return os.environ.get("RESUME_MODEL") or GEMINI_FLASH_MODEL

    # ── Azure / OpenAI fallback (DISABLED — Gemini migration) ──────────────
    # return (
    #     os.environ.get("AZURE_OPENAI_DEPLOYMENT_CHAT")
    #     or os.environ.get("AZURE_OPENAI_DEPLOYMENT")
    #     or os.environ.get("RESUME_MODEL")
    #     or "gpt-4o"
    # )
    raise RuntimeError(
        "GOOGLE_API_KEY is required for resume scoring (gemini-3.5-flash). "
        "Azure OpenAI path is disabled."
    )


def get_openai_client() -> OpenAI:
    google_api_key = os.environ.get("GOOGLE_API_KEY")
    if google_api_key:
        return OpenAI(
            api_key=google_api_key,
            base_url=GEMINI_OPENAI_BASE_URL,
        )

    # ── Azure OpenAI (DISABLED — Gemini migration) ─────────────────────────
    # endpoint = os.environ.get("AZURE_OPENAI_ENDPOINT")
    # api_key = os.environ.get("AZURE_OPENAI_API_KEY") or os.environ.get("OPENAI_API_KEY")
    # if endpoint and api_key:
    #     return AzureOpenAI(
    #         azure_endpoint=endpoint.rstrip("/"),
    #         api_key=api_key,
    #         api_version=os.environ.get("AZURE_OPENAI_API_VERSION", "2024-10-01-preview"),
    #     )
    # return OpenAI(
    #     api_key=api_key or "",
    #     base_url=os.environ.get("OPENAI_BASE_URL"),
    # )
    raise RuntimeError(
        "GOOGLE_API_KEY is required for resume scoring. Azure OpenAI path is disabled."
    )


def extract_json_from_response(text: str) -> str:
    cleaned = text.strip()
    code_block = re.search(r"```(?:json)?\s*\n?([\s\S]*?)\n?\s*```", cleaned)
    if code_block:
        cleaned = code_block.group(1).strip()
    match = re.search(r"\{[\s\S]*\}", cleaned)
    if not match:
        raise ValueError("No JSON object found in LLM response")
    json_str = match.group(0)
    # Fix invalid JSON like "points": +5 from some models
    json_str = re.sub(r":\s*\+(\d+(?:\.\d+)?)", r": \1", json_str)
    return json_str


def chat_json(
    *,
    system_message: str,
    user_message: str,
    temperature: float = 0.2,
    max_tokens: int = 4096,
) -> dict[str, Any]:
    client = get_openai_client()
    model = get_model_name()
    kwargs = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_message},
            {"role": "user", "content": user_message},
        ],
        "temperature": temperature,
        "max_tokens": max_tokens,
        "response_format": {"type": "json_object"},
    }

    response = client.chat.completions.create(**kwargs)
    content = response.choices[0].message.content or "{}"
    try:
        return json_repair.loads(extract_json_from_response(content))
    except Exception as e:
        print("====== INVALID JSON ======")
        print(extract_json_from_response(content))
        print("==========================")
        raise e
