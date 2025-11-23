"""
FastAPI entrypoint with a single /analyze route.

Rationale:
- Keep HTTP layer tiny: parse files + JSON context, call analyzer.analyze, and return Pydantic response.
- Use form multipart for file uploads, which is practical for CSVs.
"""

import os

# Set environment variables directly if not already set
if not os.getenv('GEMINI_API_KEY'):
    os.environ['GEMINI_API_KEY'] = // api ki dasso idhar
if not os.getenv('GEMINI_MODEL'):
    os.environ['GEMINI_MODEL'] = 'gemini-2.5-pro'

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from typing import List, Optional
import json
import logging
import httpx
import tempfile
from .schemas import AnalysisResponse
from .utils import load_csvs, load_csvs_from_urls
from .analyzer import analyze

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Minimal Analysis Pipeline")


@app.post("/analyze", response_model=AnalysisResponse)
async def analyze_endpoint(
    user_text: str = Form(...),
    context: Optional[str] = Form(None),
    files: Optional[List[UploadFile]] = File(None),
):
    # Log raw incoming inputs (avoid large binary dumps)
    try:
        file_names = [f.filename for f in files] if files else []
        logger.info("/analyze received user_text=%r context_raw_len=%s files=%s", user_text[:200], len(context) if context else 0, file_names)
    except Exception:
        logger.warning("Logging of incoming request failed")

    # parse context JSON if provided
    ctx = None
    dataset_urls = []
    if context:
        try:
            logger.info(f"Raw context received (first 500 chars): {context[:500]}")
            ctx = json.loads(context)
            logger.info(f"Context parsed successfully: {ctx}")
            # Extract dataset URLs from context if present
            if ctx and "datasets" in ctx:
                dataset_urls = [d["url"] for d in ctx["datasets"] if "url" in d and d["url"] != "Current Upload"]
                logger.info(f"Extracted {len(dataset_urls)} dataset URLs from context: {dataset_urls}")
            else:
                logger.info("No datasets found in context")
        except Exception as e:
            logger.error(f"Failed to parse context: {e}")
            logger.error(f"Context value: {context}")
            raise HTTPException(status_code=400, detail=f"context must be valid JSON: {e}")

    # require at least one CSV file OR dataset URL
    has_files = files and len(files) > 0
    has_urls = len(dataset_urls) > 0
    if not has_files and not has_urls:
        raise HTTPException(status_code=400, detail="At least one CSV file must be uploaded or a dataset URL provided.")

    # load CSVs into pandas DataFrames (with row cap)
    dfs = {}
    try:
        # Load directly uploaded files
        if has_files:
            dfs.update(load_csvs(files))
        
        # Download and load files from URLs
        if has_urls:
            url_dfs = await load_csvs_from_urls(dataset_urls)
            dfs.update(url_dfs)
            
        logger.info(f"Loaded {len(dfs)} total DataFrames")
    except Exception as e:
        logger.error(f"Error loading CSVs: {e}")
        raise HTTPException(status_code=400, detail=f"Error reading CSVs: {e}")

    # call analyzer
    try:
        logger.info(f"Calling analyzer with {len(dfs)} dataframes")
        result = analyze(user_text=user_text, dfs=dfs, context=ctx)
        logger.info(f"Analyzer returned result with intent: {result.get('intent')}")
    except Exception as e:
        logger.error(f"Analyzer error: {type(e).__name__}: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

    # ensure conforms to response model
    return result
