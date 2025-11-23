"""
Small utilities: CSV loader and JSON-safe conversion.

Rationale:
- Limit dataset sizes passed around to keep runtime predictable.
- Provide CSV->DataFrame with a row cap; convert pandas/numpy types to native Python types.
"""

import pandas as pd
import json
import tempfile
from typing import Dict, List
import os
import httpx
import io


# Maximum rows to load / to pass to the runner (keeps memory/time bounded).
ROW_LIMIT = 5000


def load_csvs(files: List):
    """
    Convert uploaded files (FastAPI UploadFile objects) into name->DataFrame dict.
    - limit rows to ROW_LIMIT
    Rationale: avoid huge memory usage, keep payloads predictable.
    """
    dfs = {}
    for f in files:
        name = getattr(f, "filename", "uploaded.csv")
        # read in a memory-safe way; pandas will read the whole file but we will slice
        df = pd.read_csv(f.file)
        if len(df) > ROW_LIMIT:
            df = df.head(ROW_LIMIT)
        dfs[name] = df
    return dfs


async def load_csvs_from_urls(urls: List[str]) -> Dict[str, pd.DataFrame]:
    """
    Download CSV files from URLs and convert to name->DataFrame dict.
    - limit rows to ROW_LIMIT
    Rationale: allow loading datasets from cloud storage (e.g., Cloudinary).
    """
    import logging
    logger = logging.getLogger(__name__)
    
    dfs = {}
    async with httpx.AsyncClient(timeout=30.0) as client:
        for url in urls:
            try:
                logger.info(f"Attempting to download CSV from: {url}")
                # Extract filename from URL or use a default
                filename = url.split("/")[-1].split("?")[0]
                if not filename.endswith(".csv"):
                    filename = f"dataset_{len(dfs)}.csv"
                logger.info(f"Using filename: {filename}")
                
                # Download the file
                response = await client.get(url)
                response.raise_for_status()
                logger.info(f"Downloaded {len(response.content)} bytes from {url}")
                
                # Read CSV from bytes
                df = pd.read_csv(io.BytesIO(response.content))
                logger.info(f"Successfully parsed CSV with {len(df)} rows and {len(df.columns)} columns")
                
                if len(df) > ROW_LIMIT:
                    df = df.head(ROW_LIMIT)
                    logger.info(f"Truncated to {ROW_LIMIT} rows")
                
                dfs[filename] = df
                logger.info(f"Added {filename} to dataframes dict")
            except Exception as e:
                # Log error but continue with other URLs
                logger.error(f"Failed to load CSV from {url}: {type(e).__name__}: {e}")
                import traceback
                logger.error(traceback.format_exc())
                continue
    
    logger.info(f"Returning {len(dfs)} dataframes")
    return dfs


def dataframe_to_sample_csv(df):
    """
    Save DataFrame to a temp CSV path and return path.
    Rationale: runner subprocess will read CSV from disk only; this limits data passed to process.
    """
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".csv")
    df.to_csv(tmp.name, index=False)
    tmp.close()
    return tmp.name


def safe_json(obj):
    """
    Convert pandas/numpy types to Python native types, then JSON-serialize.
    Rationale: ensure response is JSON serializable for API responses.
    """
    def convert(o):
        if isinstance(o, (int, float, str, bool)) or o is None:
            return o
        try:
            # pandas types
            import numpy as np
            if isinstance(o, (np.integer, np.floating, np.bool_)):
                return o.item()
        except Exception:
            pass
        if isinstance(o, dict):
            return {convert(k): convert(v) for k, v in o.items()}
        if isinstance(o, (list, tuple)):
            return [convert(x) for x in o]
        try:
            return json.loads(json.dumps(o))
        except Exception:
            return str(o)
    return convert(obj)
