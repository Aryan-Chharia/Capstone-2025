"""
FastAPI entrypoint with a single /analyze route.

Consolidates all input parsing and data formatting:
- Parses JSON context for datasets and history
- Loads CSV files from uploads and URLs
- Formats conversation history as context summary
- Passes processed data to analyzer
"""

import os
import logging
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv(encoding="utf-16")

# Configure logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from typing import List, Optional, Dict, Any
import json
import httpx
import io
import pandas as pd

from .schemas import AnalysisResponse
from .analyzer import analyze

# Maximum rows to load (keeps memory/time bounded)
ROW_LIMIT = 5000

app = FastAPI(title="Minimal Analysis Pipeline")


def _load_csv_from_file(file: UploadFile) -> pd.DataFrame:
    """Load a single uploaded file into a DataFrame with row limit."""
    df = pd.read_csv(file.file)
    if len(df) > ROW_LIMIT:
        df = df.head(ROW_LIMIT)
    return df


async def _load_csv_from_url(url: str, client: httpx.AsyncClient) -> Optional[pd.DataFrame]:
    """Download and load a CSV from URL into a DataFrame with row limit."""
    try:
        response = await client.get(url)
        response.raise_for_status()
        df = pd.read_csv(io.BytesIO(response.content))
        if len(df) > ROW_LIMIT:
            df = df.head(ROW_LIMIT)
        return df
    except Exception:
        return None


def _extract_filename_from_url(url: str, index: int) -> str:
    """Extract filename from URL or generate a default name."""
    filename = url.split("/")[-1].split("?")[0]
    if not filename.endswith(".csv"):
        filename = f"dataset_{index}.csv"
    return filename


def _parse_datasets(ctx: Dict[str, Any]) -> List[str]:
    """Extract dataset URLs from context, excluding 'Current Upload' placeholders."""
    if not ctx or "datasets" not in ctx:
        return []
    return [
        d["url"] for d in ctx["datasets"]
        if "url" in d and d["url"] != "Current Upload"
    ]


def _parse_history(ctx: Dict[str, Any]) -> str:
    """Extract and format conversation history from context as a string summary."""
    if not ctx or "messages" not in ctx:
        return ""
    return "\n".join(
        m.get("content", "") for m in ctx["messages"]
    )


@app.post("/analyze", response_model=AnalysisResponse)
async def analyze_endpoint(
    user_text: str = Form(...),
    context: Optional[str] = Form(None),
    files: Optional[List[UploadFile]] = File(None),
):
    # 1) Keep user_text as string (already a string from Form)
    
    # 2) Parse the JSON context
    ctx: Dict[str, Any] = {}
    if context:
        try:
            ctx = json.loads(context)
        except json.JSONDecodeError as e:
            raise HTTPException(status_code=400, detail=f"context must be valid JSON: {e}")

    # 3) Parse datasets from context
    dataset_urls = _parse_datasets(ctx)

    # 4) Parse history from context
    history_summary = _parse_history(ctx)

    # 5) Check: require at least one CSV file OR dataset URL
    has_files = files and len(files) > 0
    has_urls = len(dataset_urls) > 0
    if not has_files and not has_urls:
        raise HTTPException(
            status_code=400,
            detail="At least one CSV file must be uploaded or a dataset URL provided."
        )

    # 6) Load CSV files into DataFrames
    dfs: Dict[str, pd.DataFrame] = {}

    # Load directly uploaded files
    if has_files:
        try:
            for f in files:
                name = getattr(f, "filename", "uploaded.csv")
                dfs[name] = _load_csv_from_file(f)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Error reading uploaded CSV files: {e}")

    # Download and load files from URLs
    if has_urls:
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                for idx, url in enumerate(dataset_urls):
                    df = await _load_csv_from_url(url, client)
                    if df is not None:
                        filename = _extract_filename_from_url(url, idx)
                        dfs[filename] = df
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Error loading CSV from URL: {e}")

    # 7) Verify we have at least one DataFrame loaded
    if not dfs:
        raise HTTPException(
            status_code=400,
            detail="No valid CSV data could be loaded from files or URLs."
        )

    # 8) Call analyzer with processed data
    try:
        result = analyze(
            user_text=user_text,
            dfs=dfs,
            history_summary=history_summary
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return result
