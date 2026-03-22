from datetime import datetime
from pydantic import BaseModel


class JobLogResponse(BaseModel):
    id: int
    job_run_id: str
    timestamp: datetime
    stream: str
    level: str
    message: str
    line_number: int

    class Config:
        from_attributes = True
