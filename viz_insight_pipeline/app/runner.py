"""
Isolated runner for LLM-generated code.

Design & Rationale:
- Write the code to a temporary Python script and run it in a subprocess.
- The script must accept a CSV path as argv[1] and print EXACTLY one JSON object to stdout:
  {"values": ..., "summary": {...}}
- Subprocess approach: simple, effective isolation compared to in-process exec.
- Timeout enforced and stdout/stderr captured. On timeout or non-JSON output, raise.
- No advanced OS sandboxing here (keeps minimal). For production, replace with containerized runner.
"""

import tempfile
import subprocess
import json
import os
import re
from typing import Dict
import logging

logger = logging.getLogger(__name__)


def _sanitize_code(code_str: str) -> str:
    """Extract pure Python from possible fenced markdown or surrounding text.
    Strategy:
    - If a triple backtick fenced block exists, take its first block (preferring ```python).
    - Otherwise strip any stray backticks and leading non-code commentary lines.
    """
    if "```" in code_str:
        pattern = re.compile(r"```(?:python|py)?\s*(.*?)```", re.IGNORECASE | re.DOTALL)
        match = pattern.search(code_str)
        if match:
            extracted = match.group(1).strip()
            logger.debug("Sanitized fenced code; original length %d -> %d", len(code_str), len(extracted))
            return extracted
        # fallback: remove all fences
        code_str = code_str.replace("```python", "").replace("```py", "").replace("```", "")
    # Remove leading markdown artifacts (e.g., starting 'python\n')
    code_str = code_str.lstrip()
    return code_str


def run_code_and_get_values(code_str: str, csv_path: str, timeout: int = 8) -> Dict:
    """
    Write `code_str` to a temporary file and execute it with `csv_path` as the argument.
    Return parsed JSON from stdout containing keys "values" and "summary".
    """
    # sanitize potential markdown fencing from LLM output
    clean_code = _sanitize_code(code_str)
    
    logger.info("--------------------------------------------------")
    logger.info(f"Sanitized Code:\n{clean_code}")
    logger.info("--------------------------------------------------")

    if not clean_code.strip():
        raise RuntimeError("Generated code is empty after sanitization.")

    # create temp file for script
    script_file = tempfile.NamedTemporaryFile(delete=False, suffix=".py", mode="w", encoding="utf-8")
    script_file.write(clean_code)
    script_file.flush()
    script_file.close()

    try:
        # run subprocess (python interpreter must be available in PATH)
        proc = subprocess.run(
            ["python", script_file.name, csv_path],
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        # kill and report
        raise RuntimeError("Generated code timed out")

    # cleanup script file
    try:
        os.unlink(script_file.name)
    except Exception:
        pass

    logger.info(f"Execution finished. Return code: {proc.returncode}")
    logger.info(f"STDOUT: {proc.stdout!r}")
    logger.info(f"STDERR: {proc.stderr!r}")

    if proc.returncode != 0:
        raise RuntimeError(f"Script failed: {proc.stderr.strip()}")

    stdout = proc.stdout.strip()
    try:
        data = json.loads(stdout)
    except Exception as e:
        raise RuntimeError(f"Runner did not produce valid JSON. Error: {e}. Raw stdout: {stdout[:1000]!r}")

    # Basic validation
    if "values" not in data or "summary" not in data:
        raise RuntimeError("Runner JSON must contain 'values' and 'summary' keys")

    return data
