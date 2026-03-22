from datetime import datetime
from typing import Any
from pydantic import BaseModel, Field


class ModuleCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: str | None = None
    module_type: str = Field(..., pattern="^(action|data|transform|condition|trigger|merge)$")
    category: str = "general"
    icon: str | None = None
    color: str | None = "#6366f1"

    input_schema: dict | None = None
    output_schema: dict | None = None
    config_schema: dict | None = None

    executor_type: str = Field("python", pattern="^(python|http|sql|builtin)$")
    executor_code: str | None = None
    executor_config: dict | None = None


class ModuleUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    description: str | None = None
    module_type: str | None = Field(None, pattern="^(action|data|transform|condition|trigger|merge)$")
    category: str | None = None
    icon: str | None = None
    color: str | None = None
    input_schema: dict | None = None
    output_schema: dict | None = None
    config_schema: dict | None = None
    executor_type: str | None = Field(None, pattern="^(python|http|sql|builtin)$")
    executor_code: str | None = None
    executor_config: dict | None = None
    is_active: bool | None = None


class ModuleOut(BaseModel):
    id: str
    name: str
    description: str | None
    module_type: str
    category: str
    icon: str | None
    color: str | None
    input_schema: dict | None
    output_schema: dict | None
    config_schema: dict | None
    executor_type: str
    executor_code: str | None
    executor_config: dict | None
    is_active: bool
    is_builtin: bool
    version: int
    created_by: str | None
    created_at: datetime
    updated_at: datetime | None

    model_config = {"from_attributes": True}


class ModuleTestRequest(BaseModel):
    input_data: dict[str, Any] = {}
