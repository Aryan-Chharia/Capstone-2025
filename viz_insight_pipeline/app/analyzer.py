"""
Core orchestration / pipeline.

Rationale:
- Single place to coordinate intent detection, prompt creation, LLM calls, runner invocation,
  and final Chart.js conversion call.
- Minimal logic: exact dataset name match or fallback to first dataset.
- Use external prompt files (defaults point to uploaded prompt files).
- Strict contracts with LLM: intent-json, code script (prints json), and chartjs-json.
"""

import json
import os
import logging
import re
from typing import Dict, Any, Optional
from .llm_client import call_llm
from .intent import decide_intent
from .runner import run_code_and_get_values
from .utils import dataframe_to_sample_csv, safe_json

logger = logging.getLogger(__name__)

# Default prompt paths - use paths relative to project root
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_CODE_PROMPT_PATH = os.getenv("CODE_PROMPT_PATH", os.path.join(BASE_DIR, "prompts", "codegen_system.txt"))
DEFAULT_INSIGHT_PROMPT_PATH = os.getenv("INSIGHT_PROMPT_PATH", os.path.join(BASE_DIR, "prompts", "insights_system.txt"))
DEFAULT_CHARTJS_PROMPT_PATH = os.getenv("CHARTJS_PROMPT_PATH", os.path.join(BASE_DIR, "prompts", "chartjs_system.txt"))


def _read_prompt(path: str) -> str:
    """Read a prompt text file. Fail fast if not found."""
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def _sanitize_json(text: str) -> str:
    """
    Extract JSON from markdown code blocks or raw text.
    """
    # Try to find JSON block in markdown
    if "```" in text:
        pattern = re.compile(r"```(?:json)?\s*(\{.*?\})\s*```", re.IGNORECASE | re.DOTALL)
        match = pattern.search(text)
        if match:
            return match.group(1)
    
    # If no markdown, try to find the first '{' and last '}'
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        return text[start:end+1]
        
    return text


def analyze(
    user_text: str,
    dfs: Dict[str, Any],
    context: Optional[Dict] = None,
) -> Dict[str, Any]:
    """
    Main pipeline:
    1. summarize context (very small: join messages)
    2. decide intent via LLM
    3. select dataset (exact match via user mention or default first)
    4. for insight: call LLM with system_insight and return text
    5. for graph: call LLM with system_code to get code, run it, then ask LLM to convert values->ChartJS
    """

    # 1) small context summary: join the last messages
    context_summary = ""
    if context and "messages" in context:
        context_summary = "\n".join(m.get("content", "") for m in context["messages"])

    # 2) intent detection using regex (no LLM call)
    intent = decide_intent(user_text, context_summary)
    intent_type = intent.get("intent")

    # choose dataset: if user specified name in text and matches key, otherwise first dataset
    selected_name = None
    for name in dfs.keys():
        if name in user_text:
            selected_name = name
            break
    if selected_name is None:
        # fallback to first dataset
        selected_name = next(iter(dfs.keys()))

    df = dfs[selected_name]
    csv_path = dataframe_to_sample_csv(df)

    result: Dict[str, Any] = {"intent": intent_type, "graph_type": intent.get("graph_type"), "code": None}

    if intent_type == "insight":
        # 6) Build prompt for insights
        system_prompt = _read_prompt(DEFAULT_INSIGHT_PROMPT_PATH)
        user_prompt = (
            "Provide concise insights about the dataset. Include key numbers and short observations.\n\n"
            f"User request:\n{user_text}\n\n"
            f"Conversation Context:\n{context_summary}\n\n"
            f"Dataset sample path: {csv_path}\n\n"
            "Return plain text only."
        )
        insights_text = call_llm(system_prompt, user_prompt, max_tokens=2000)
        result.update({"insights": insights_text, "summary": None, "values": None})
        return safe_json(result)

    elif intent_type == "graph":
        # 6) Build prompt for codegen
        system_prompt = _read_prompt(DEFAULT_CODE_PROMPT_PATH)
        user_prompt = (
            "Generate a complete Python script that:"
            "1. Reads a CSV file path from sys.argv[1]\n"
            "2. Loads it into a pandas DataFrame\n"
            "3. Performs analysis/aggregation based on the user's request\n"
            "4. Prints EXACTLY ONE JSON object to stdout with keys 'values' and 'summary'\n\n"
            f"User request: {user_text}\n\n"
            f"Desired graph type: {intent.get('graph_type', 'auto')}\n\n"
            "Requirements:\n"
            "- Import sys, json, and pandas at the top\n"
            "- Read CSV: df = pd.read_csv(sys.argv[1])\n"
            "- 'values' should be chart-ready data (e.g., dict with labels/data arrays)\n"
            "- 'summary' should describe the data (e.g., {{\"total\": N, \"categories\": [...]}})\n"
            "- End with: print(json.dumps({{\"values\": values, \"summary\": summary}}))\n"
            "- Use only pandas and standard library (no matplotlib/plotly in the script)\n"
            "- Handle errors gracefully\n\n"
            "Provide ONLY the complete Python script, no explanations. Keep comments minimal."
        )
        code_text = call_llm(system_prompt, user_prompt, max_tokens=4000)
        
        logger.info("--------------------------------------------------")
        logger.info(f"Raw LLM Code Response:\n{code_text}")
        logger.info("--------------------------------------------------")

        # store code in result for debugging/audit
        result["code"] = code_text

        # 10) Run the code to receive values
        runner_out = run_code_and_get_values(code_text, csv_path, timeout=8)
        values = runner_out["values"]
        summary = runner_out["summary"]
        result.update({"values": values, "summary": summary})

        # 11) Send chart type + values to LLM to get ChartJS
        chartjs_system = _read_prompt(DEFAULT_CHARTJS_PROMPT_PATH)
        user_prompt_chart = (
            "Convert the following data into a complete Chart.js configuration.\n\n"
            f"Chart Type: {intent.get('graph_type', 'bar')}\n\n"
            f"Data Values:\n{json.dumps(values, indent=2)}\n\n"
            f"Summary Context:\n{json.dumps(summary, indent=2)}\n\n"
            f"User's Original Request: {user_text}\n\n"
            "Return ONLY a valid Chart.js configuration JSON object. No explanations, no markdown, just JSON."
        )
        chartjs_text = call_llm(chartjs_system, user_prompt_chart, max_tokens=2000)
        
        # Sanitize and parse Chart.js JSON
        clean_chartjs_text = _sanitize_json(chartjs_text)
        
        try:
            chartjs_json = json.loads(clean_chartjs_text)
            result["chartjs"] = chartjs_json
        except json.JSONDecodeError as e:
            # Log the raw response for debugging
            logger.error(f"Failed to parse Chart.js JSON: {e}")
            logger.error(f"Raw LLM response (first 500 chars): {chartjs_text[:500]}")
            logger.error(f"Sanitized text (first 500 chars): {clean_chartjs_text[:500]}")
            result["error"] = f"Could not parse Chart.js configuration: {str(e)}"

        return safe_json(result)

    else:
        raise RuntimeError("Unknown intent returned by LLM")
