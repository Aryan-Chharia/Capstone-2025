"""
Core orchestration / pipeline.

Flow:
1. Receive inputs (user_text, dfs, history_summary)
2. Single LLM call that detects intent AND generates content:
   - For INSIGHT: Returns intent + insights text directly
   - For GRAPH: Returns intent + graph_type + Python code
3. For GRAPH only:
   a. Run the generated code on FULL dataset to get real aggregated values
   b. DETERMINISTICALLY convert values to ChartJS configuration (no LLM needed)
4. Return formatted response
"""

import json
import os
import re
import tempfile
import subprocess
import logging
from typing import Dict, Any
import pandas as pd
from .llm_client import call_llm

logger = logging.getLogger(__name__)

# Prompt file paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UNIFIED_PROMPT_PATH = os.path.join(BASE_DIR, "prompts", "unified_system.txt")


def _read_prompt(path: str) -> str:
    """Read a prompt text file."""
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def _extract_unified_response(text: str) -> Dict[str, Any]:
    """
    Extract JSON object from unified LLM response.
    Handles markdown code blocks and raw JSON with nested braces.
    """
    text = text.strip()
    
    # Remove markdown code blocks if present
    if "```" in text:
        # Try to find JSON block first
        match = re.search(r"```json\s*([\s\S]*?)\s*```", text, re.IGNORECASE)
        if match:
            text = match.group(1).strip()
        else:
            # Fallback: remove all fences
            text = re.sub(r"```\w*\s*", "", text)
            text = text.replace("```", "")
    
    # Find the outermost JSON object by matching braces
    start = text.find("{")
    if start == -1:
        raise json.JSONDecodeError("No JSON object found", text, 0)
    
    # Count braces to find matching closing brace
    # Must properly handle escape sequences within strings
    depth = 0
    in_string = False
    i = start
    end = -1
    
    while i < len(text):
        char = text[i]
        
        if in_string:
            if char == '\\' and i + 1 < len(text):
                # Skip the next character (it's escaped)
                i += 2
                continue
            elif char == '"':
                in_string = False
        else:
            if char == '"':
                in_string = True
            elif char == '{':
                depth += 1
            elif char == '}':
                depth -= 1
                if depth == 0:
                    end = i
                    break
        i += 1
    
    if end == -1:
        raise json.JSONDecodeError("Unmatched braces in JSON", text, start)
    
    json_str = text[start:end + 1]
    return json.loads(json_str)


def _format_datasets_info(dfs: Dict[str, pd.DataFrame]) -> str:
    """
    Format ALL datasets into a comprehensive string for LLM context.
    Includes: dataset name, shape, column info with types, sample rows, and basic stats.
    This rich context enables more accurate insights.
    """
    parts = []
    for name, df in dfs.items():
        # Basic info
        num_rows, num_cols = df.shape
        columns = df.columns.tolist()
        
        # Column types and info
        col_info = []
        for col in columns:
            dtype = str(df[col].dtype)
            non_null = df[col].notna().sum()
            unique_count = df[col].nunique()
            col_info.append(f"  - {col} ({dtype}): {non_null} non-null, {unique_count} unique values")
        
        # Sample rows
        sample_rows = df.head(5).to_string(index=False)
        
        # Basic statistics for numeric columns
        numeric_cols = df.select_dtypes(include=['int64', 'float64', 'int32', 'float32']).columns.tolist()
        stats_info = ""
        if numeric_cols:
            stats_parts = []
            for col in numeric_cols[:5]:  # Limit to first 5 numeric columns
                try:
                    col_min = df[col].min()
                    col_max = df[col].max()
                    col_mean = df[col].mean()
                    stats_parts.append(f"  - {col}: min={col_min:.2f}, max={col_max:.2f}, mean={col_mean:.2f}")
                except Exception:
                    pass
            if stats_parts:
                stats_info = "\nNumeric Column Statistics:\n" + "\n".join(stats_parts)
        
        # Categorical column value counts (for top categories)
        cat_cols = df.select_dtypes(include=['object', 'category']).columns.tolist()
        cat_info = ""
        if cat_cols:
            cat_parts = []
            for col in cat_cols[:3]:  # Limit to first 3 categorical columns
                try:
                    top_values = df[col].value_counts().head(5)
                    top_str = ", ".join([f"{v}({c})" for v, c in zip(top_values.index, top_values.values)])
                    cat_parts.append(f"  - {col} top values: {top_str}")
                except Exception:
                    pass
            if cat_parts:
                cat_info = "\nCategorical Column Summaries:\n" + "\n".join(cat_parts)
        
        parts.append(
            f"Dataset: {name}\n"
            f"Shape: {num_rows} rows × {num_cols} columns\n"
            f"Columns:\n" + "\n".join(col_info) + "\n"
            f"Sample Data (first 5 rows):\n{sample_rows}"
            f"{stats_info}"
            f"{cat_info}"
        )
    return "\n\n" + "="*50 + "\n\n".join(parts)


def _save_dataset_to_temp(df: pd.DataFrame) -> str:
    """Save DataFrame to a temporary CSV file and return the path."""
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".csv", mode="w", encoding="utf-8")
    df.to_csv(tmp.name, index=False)
    tmp.close()
    return tmp.name


def _extract_code(text: str) -> str:
    """
    Extract and unescape Python code from LLM response.
    Handles:
    - Markdown code blocks
    - JSON-escaped strings (literal \\n, \\", etc.)
    """
    # First handle markdown code blocks if present
    if "```" in text:
        pattern = re.compile(r"```(?:python|py)?\s*(.*?)```", re.IGNORECASE | re.DOTALL)
        match = pattern.search(text)
        if match:
            text = match.group(1).strip()
        else:
            # Fallback: remove all fences
            text = text.replace("```python", "").replace("```py", "").replace("```", "")
            text = text.strip()
    
    # Unescape JSON string escapes (literal \n, \", \\, \t)
    # This handles code that was returned as a JSON-escaped string
    if "\\n" in text or "\\\"" in text or "\\\\" in text:
        # Replace escaped sequences with actual characters
        text = text.replace("\\n", "\n")
        text = text.replace("\\t", "\t")
        text = text.replace("\\\"", "\"")
        text = text.replace("\\'", "'")
        text = text.replace("\\\\", "\\")
    
    return text.strip()


def _wrap_transformation_code(transformation: str) -> str:
    """
    Wrap the LLM's transformation code with the required boilerplate.
    This removes the burden of JSON escaping from the LLM.
    """
    # Clean up the transformation code
    transformation = _extract_code(transformation)
    
    # Build the complete script with boilerplate
    full_script = f'''import sys
import json
import pandas as pd

try:
    df = pd.read_csv(sys.argv[1])
    df.columns = df.columns.str.strip()
    
    # LLM-generated transformation code
{_indent_code(transformation, spaces=4)}
    
    print(json.dumps({{"values": values, "summary": summary}}))
except Exception as e:
    print(json.dumps({{"values": None, "summary": {{"error": str(e)}}}}))
'''
    return full_script


def _indent_code(code: str, spaces: int = 4) -> str:
    """Indent each line of code by the specified number of spaces."""
    indent = " " * spaces
    lines = code.split("\n")
    return "\n".join(indent + line if line.strip() else line for line in lines)


def _run_code(code: str, csv_path: str, timeout: int = 10) -> Dict[str, Any]:
    """
    Execute the generated Python code with the CSV path as argument.
    Returns parsed JSON with 'values' and 'summary' keys.
    """
    if not code.strip():
        raise RuntimeError("Generated code is empty")

    # Write code to temp file
    script_file = tempfile.NamedTemporaryFile(delete=False, suffix=".py", mode="w", encoding="utf-8")
    script_file.write(code)
    script_file.flush()
    script_file.close()

    try:
        proc = subprocess.run(
            ["python", script_file.name, csv_path],
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        raise RuntimeError("Code execution timed out")
    finally:
        try:
            os.unlink(script_file.name)
        except Exception:
            pass

    if proc.returncode != 0:
        raise RuntimeError(f"Code execution failed: {proc.stderr.strip()}")

    stdout = proc.stdout.strip()
    try:
        data = json.loads(stdout)
    except json.JSONDecodeError as e:
        raise RuntimeError(f"Invalid JSON output: {e}. Output: {stdout[:500]}")

    if "values" not in data or "summary" not in data:
        raise RuntimeError("Output must contain 'values' and 'summary' keys")

    return data


def _values_to_chartjs(values: Dict[str, Any], graph_type: str) -> Dict[str, Any]:
    """
    DETERMINISTICALLY convert standardized values to Chart.js configuration.
    
    Input formats supported:
    1. Single series: {"labels": [...], "data": [...]}
    2. Multi series:  {"labels": [...], "datasets": [{"label": "X", "data": [...]}, ...]}
    3. Scatter/Bubble: {"datasets": [{"label": "X", "data": [{"x": 1, "y": 2}, ...]}]}
    
    Output: Complete Chart.js configuration object
    
    Note: graph_type is passed through directly - any Chart.js type is accepted.
    """
    # Initialize Chart.js config - accept any graph type from LLM
    chartjs_config = {
        "type": graph_type,
        "data": {
            "labels": [],
            "datasets": []
        }
    }
    
    # Extract labels if present
    if "labels" in values and values["labels"]:
        chartjs_config["data"]["labels"] = values["labels"]
    
    # Handle different input formats
    if "datasets" in values and isinstance(values["datasets"], list):
        # Multi-series format or scatter/bubble format
        for ds in values["datasets"]:
            dataset = {
                "label": ds.get("label", "Series"),
                "data": ds.get("data", [])
            }
            chartjs_config["data"]["datasets"].append(dataset)
    
    elif "data" in values:
        # Single series format: {"labels": [...], "data": [...]}
        chartjs_config["data"]["datasets"].append({
            "label": values.get("label", "Series"),
            "data": values["data"]
        })
    
    # Add minimal options for certain chart types
    if graph_type in ["bar", "line"]:
        chartjs_config["options"] = {
            "scales": {
                "y": {
                    "beginAtZero": True
                }
            }
        }
    
    return chartjs_config


def _safe_serialize(obj: Any) -> Any:
    """Convert pandas/numpy types to native Python types for JSON serialization."""
    if isinstance(obj, (int, float, str, bool)) or obj is None:
        return obj
    try:
        import numpy as np
        if isinstance(obj, (np.integer, np.floating, np.bool_)):
            return obj.item()
    except Exception:
        pass
    if isinstance(obj, dict):
        return {_safe_serialize(k): _safe_serialize(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_safe_serialize(x) for x in obj]
    return str(obj)


def analyze(
    user_text: str,
    dfs: Dict[str, pd.DataFrame],
    history_summary: str = "",
) -> Dict[str, Any]:
    """
    Main analysis pipeline with single LLM call.
    
    Args:
        user_text: User's request
        dfs: Dictionary of dataset_name -> DataFrame
        history_summary: Formatted conversation history
    
    Returns:
        Response dict with intent, graph_type, chartjs/insights, etc.
    """
    # 1) Format all datasets info (for LLM to understand structure)
    datasets_info = _format_datasets_info(dfs)

    # 2) Select primary dataset for code execution (first one or user-specified)
    selected_name = None
    for name in dfs.keys():
        if name.lower() in user_text.lower():
            selected_name = name
            break
    if selected_name is None:
        selected_name = next(iter(dfs.keys()))
    
    selected_df = dfs[selected_name]

    # 3) Single LLM call for intent detection + content generation
    try:
        system_prompt = _read_prompt(UNIFIED_PROMPT_PATH)
    except FileNotFoundError as e:
        logger.error(f"Unified prompt file not found: {UNIFIED_PROMPT_PATH}")
        return _safe_serialize({
            "intent": None,
            "graph_type": None,
            "insights": None,
            "chartjs": None,
            "summary": None,
            "values": None,
            "code": None,
            "error": f"Unified prompt file not found: {e}"
        })

    user_prompt = (
        f"User Request: {user_text}\n\n"
        f"Conversation History:\n{history_summary if history_summary else '(No previous conversation)'}\n\n"
        f"Available Datasets:\n{datasets_info}\n\n"
        "Analyze the request and respond with the appropriate JSON."
    )

    try:
        response = call_llm(system_prompt, user_prompt, max_tokens=4096)
        logger.debug(f"LLM raw response: {response}")
    except Exception as e:
        logger.error(f"LLM call failed: {e}")
        return _safe_serialize({
            "intent": None,
            "graph_type": None,
            "insights": None,
            "chartjs": None,
            "summary": None,
            "values": None,
            "code": None,
            "error": f"LLM call failed: {e}"
        })

    # 4) Parse unified response
    try:
        unified_result = _extract_unified_response(response)
    except (json.JSONDecodeError, Exception) as e:
        logger.error(f"Failed to parse LLM response as JSON: {e}")
        logger.error(f"Raw response was: {response[:1000]}...")  # Log first 1000 chars
        return _safe_serialize({
            "intent": None,
            "graph_type": None,
            "insights": None,
            "chartjs": None,
            "summary": None,
            "values": None,
            "code": None,
            "error": f"Invalid JSON in LLM response: {e}"
        })

    # Log reasoning if present (helps with debugging)
    reasoning = unified_result.get("_reasoning", "")
    if reasoning:
        logger.info(f"LLM reasoning: {reasoning[:200]}...")

    # Validate intent field
    intent_type = unified_result.get("intent")
    if intent_type not in ["graph", "insight"]:
        logger.error(f"Invalid or missing intent in response: {unified_result}")
        return _safe_serialize({
            "intent": None,
            "graph_type": None,
            "insights": None,
            "chartjs": None,
            "summary": None,
            "values": None,
            "code": None,
            "error": f"Invalid intent in LLM response: {intent_type}"
        })

    logger.info(f"Intent detected: {intent_type}")

    # ========== INSIGHT FLOW ==========
    if intent_type == "insight":
        insights_text = unified_result.get("insights", "")
        if not insights_text:
            logger.warning("Insight response missing 'insights' field")
        
        return _safe_serialize({
            "intent": "insight",
            "graph_type": None,
            "insights": insights_text,
            "chartjs": None,
            "summary": None,
            "values": None,
            "code": None,
            "error": None
        })

    # ========== GRAPH FLOW ==========
    elif intent_type == "graph":
        graph_type = unified_result.get("graph_type")
        # Support both "transformation" (new) and "code" (legacy) fields
        transformation = unified_result.get("transformation") or unified_result.get("code", "")
        
        if not graph_type:
            logger.error("Graph response missing 'graph_type' field")
            return _safe_serialize({
                "intent": "graph",
                "graph_type": None,
                "insights": None,
                "chartjs": None,
                "summary": None,
                "values": None,
                "code": transformation,
                "error": "Graph response missing 'graph_type' field"
            })
        
        if not transformation:
            logger.error("Graph response missing 'transformation' field")
            return _safe_serialize({
                "intent": "graph",
                "graph_type": graph_type,
                "insights": None,
                "chartjs": None,
                "summary": None,
                "values": None,
                "code": None,
                "error": "Graph response missing 'transformation' field"
            })

        # Wrap transformation code with boilerplate (backend handles imports/try-except)
        full_code = _wrap_transformation_code(transformation)

        # Run code to get REAL values from full dataset
        csv_path = _save_dataset_to_temp(selected_df)
        try:
            runner_output = _run_code(full_code, csv_path, timeout=15)
            values = runner_output["values"]
            summary = runner_output["summary"]
        except Exception as e:
            return _safe_serialize({
                "intent": "graph",
                "graph_type": graph_type,
                "insights": None,
                "chartjs": None,
                "summary": None,
                "values": None,
                "code": full_code,
                "error": f"Code execution failed: {str(e)}"
            })
        finally:
            try:
                os.unlink(csv_path)
            except Exception:
                pass

        # DETERMINISTICALLY convert values to ChartJS (no LLM call!)
        try:
            chartjs_config = _values_to_chartjs(values, graph_type)
            return _safe_serialize({
                "intent": "graph",
                "graph_type": graph_type,
                "insights": None,
                "chartjs": chartjs_config,
                "summary": summary,
                "values": values,
                "code": full_code,
                "error": None
            })
        except Exception as e:
            return _safe_serialize({
                "intent": "graph",
                "graph_type": graph_type,
                "insights": None,
                "chartjs": None,
                "summary": summary,
                "values": values,
                "code": full_code,
                "error": f"Failed to convert to ChartJS: {str(e)}"
            })

    else:
        return _safe_serialize({
            "intent": None,
            "graph_type": None,
            "insights": None,
            "chartjs": None,
            "summary": None,
            "values": None,
            "code": None,
            "error": f"Unknown intent: {intent_type}"
        })
