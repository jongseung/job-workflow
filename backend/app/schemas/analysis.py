from pydantic import BaseModel


class ImportInfo(BaseModel):
    module: str
    alias: str | None = None
    is_stdlib: bool = False
    is_third_party: bool = False
    names: list[str] | None = None


class FunctionInfo(BaseModel):
    name: str
    line_number: int
    args: list[str]
    docstring: str | None = None
    is_async: bool = False


class ClassInfo(BaseModel):
    name: str
    line_number: int
    bases: list[str]
    methods: list[str]
    docstring: str | None = None


class CodeWarning(BaseModel):
    line_number: int | None = None
    message: str
    severity: str = "warning"  # warning, error, info


class AnalysisRequest(BaseModel):
    code: str


class AnalysisResponse(BaseModel):
    is_valid: bool
    imports: list[ImportInfo]
    functions: list[FunctionInfo]
    classes: list[ClassInfo]
    warnings: list[CodeWarning]
    total_lines: int
    has_main_guard: bool
    syntax_error: str | None = None
