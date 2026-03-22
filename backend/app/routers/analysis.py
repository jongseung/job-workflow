from fastapi import APIRouter, Depends

from app.schemas.analysis import AnalysisRequest, AnalysisResponse
from app.services.analysis_service import analyze_code
from app.core.dependencies import require_role
from app.models.user import User

router = APIRouter(prefix="/api/analysis", tags=["analysis"])


@router.post("/analyze", response_model=AnalysisResponse)
def analyze(
    data: AnalysisRequest,
    current_user: User = Depends(require_role("admin", "operator")),
):
    return analyze_code(data.code)


@router.post("/validate")
def validate(
    data: AnalysisRequest,
    current_user: User = Depends(require_role("admin", "operator")),
):
    result = analyze_code(data.code)
    return {
        "is_valid": result.is_valid,
        "syntax_error": result.syntax_error,
        "warnings_count": len(result.warnings),
    }
