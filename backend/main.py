import os
from typing import List, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from pydantic import BaseModel, Field
from supabase import Client, create_client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
genai_client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None

app = FastAPI(title="Cold Call Copilot API", version="1.0.0")

DEFAULT_ORIGINS = "http://localhost:3000,http://localhost:3001"

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.getenv("CORS_ORIGINS", DEFAULT_ORIGINS).split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class CallCreate(BaseModel):
    prospect_name: str = Field(min_length=1, max_length=200)
    company: str = Field(min_length=1, max_length=200)


class StageCreate(BaseModel):
    stage_number: int = Field(ge=1, le=8)
    button_tapped: str = Field(min_length=1, max_length=100)
    prospect_words: str = Field(default="", max_length=10000)


class CallClose(BaseModel):
    outcome: Optional[str] = Field(default=None, max_length=1000)


def _get_call(call_id: str) -> dict:
    try:
        result = (
            supabase.table("calls")
            .select("*")
            .eq("id", call_id)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Supabase error: {exc}") from exc
    if not result.data:
        raise HTTPException(status_code=404, detail="Call not found")
    return result.data[0]


def _generate_outcome(stages: List[dict]) -> str:
    prospect_words = [
        (s.get("prospect_words") or "").strip()
        for s in stages
        if (s.get("prospect_words") or "").strip()
    ]
    if not prospect_words:
        return "Call closed with no logged prospect conversation."
    if genai_client is None:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY is not configured")

    transcript = "\n".join(f"- {words}" for words in prospect_words)
    prompt = (
        "You are the assistant for a cold-call co-pilot. Below is what the prospect "
        "said during a cold call, in chronological order (one bullet per stage):\n\n"
        f"{transcript}\n\n"
        "Write ONE concise sentence summarizing this conversation. Focus on the "
        "prospect's needs, objections, and how the call ended. Output only the sentence."
    )
    try:
        response = genai_client.models.generate_content(model=GEMINI_MODEL, contents=prompt)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Gemini error: {exc}") from exc

    summary = (response.text or "").strip()
    return summary or "Call closed (no summary could be generated)."


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/calls", status_code=201)
def start_call(payload: CallCreate) -> dict:
    try:
        result = (
            supabase.table("calls")
            .insert(
                {
                    "prospect_name": payload.prospect_name,
                    "company": payload.company,
                }
            )
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Supabase error: {exc}") from exc
    return result.data[0]


@app.post("/calls/{call_id}/stages", status_code=201)
def save_stage(call_id: str, payload: StageCreate) -> dict:
    _get_call(call_id)
    try:
        result = (
            supabase.table("call_stages")
            .insert(
                {
                    "call_id": call_id,
                    "stage_number": payload.stage_number,
                    "button_tapped": payload.button_tapped,
                    "prospect_words": payload.prospect_words,
                }
            )
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Supabase error: {exc}") from exc
    return result.data[0]


@app.put("/calls/{call_id}")
def close_call(call_id: str, payload: Optional[CallClose] = None) -> dict:
    _get_call(call_id)
    try:
        stages = (
            supabase.table("call_stages")
            .select("stage_number, button_tapped, prospect_words")
            .eq("call_id", call_id)
            .order("stage_number")
            .execute()
            .data
            or []
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Supabase error: {exc}") from exc

    final_stage = max((s["stage_number"] for s in stages), default=None)

    outcome = payload.outcome.strip() if payload and payload.outcome else ""
    if not outcome:
        outcome = _generate_outcome(stages)

    try:
        updated = (
            supabase.table("calls")
            .update({"outcome": outcome})
            .eq("id", call_id)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Supabase error: {exc}") from exc

    return {**updated.data[0], "final_stage": final_stage}


@app.get("/calls")
def list_calls() -> List[dict]:
    try:
        result = (
            supabase.table("calls")
            .select("*, call_stages(stage_number)")
            .order("created_at", desc=True)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Supabase error: {exc}") from exc

    calls = []
    for row in result.data or []:
        stages = row.pop("call_stages", None) or []
        calls.append(
            {
                **row,
                "final_stage": max((s["stage_number"] for s in stages), default=None),
            }
        )
    return calls
