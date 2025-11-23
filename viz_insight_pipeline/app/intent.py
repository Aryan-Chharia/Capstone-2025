"""
Intent detection module using regex patterns.

Rationale:
- Use regex patterns to extract intent (graph/insight) and graph type
- Fast and deterministic - no LLM call needed
- Returns JSON like: {"intent":"graph"} or {"intent":"insight"} or {"intent":"graph","graph_type":"bar"}
"""

import re
from typing import Dict
import logging

logger = logging.getLogger(__name__)


def decide_intent(user_text: str, context_summary: str = None) -> Dict:
    """
    Use regex patterns to determine user intent and graph type.
    
    Args:
        user_text: The user's input text
        context_summary: Optional context (not used in regex approach but kept for compatibility)
    
    Returns:
        Dict with "intent" (graph/insight) and optional "graph_type"
    """
    text_lower = user_text.lower()
    
    # Define graph type patterns
    graph_patterns = {
        "bar": r"\b(bar\s+chart|bar\s+graph|bar\s+plot|barchart|bargraph|bars?)\b",
        "line": r"\b(line\s+chart|line\s+graph|line\s+plot|linechart|linegraph|lines?|trend|time\s+series)\b",
        "pie": r"\b(pie\s+chart|pie\s+graph|piechart|piegraph|pie)\b",
        "scatter": r"\b(scatter\s+plot|scatter\s+chart|scatterplot|scatter)\b",
        "doughnut": r"\b(doughnut\s+chart|doughnut\s+graph|donut)\b",
        "radar": r"\b(radar\s+chart|radar\s+graph|radar)\b",
        "polar": r"\b(polar\s+area|polar\s+chart|polar)\b",
        "bubble": r"\b(bubble\s+chart|bubble\s+plot|bubble)\b",
    }
    
    # Detect graph type
    detected_graph_type = None
    for graph_type, pattern in graph_patterns.items():
        if re.search(pattern, text_lower):
            detected_graph_type = graph_type
            logger.info(f"Detected graph type: {graph_type}")
            break
    
    # Insight keywords
    insight_patterns = [
        r"\b(insight|insights|analysis|analyze|summary|summarize|explain|tell\s+me\s+about|what\s+are|describe)\b",
        r"\b(trend|trends|pattern|patterns|observation|observations)\b",
    ]
    
    # Graph/visualization keywords
    graph_keywords = [
        r"\b(plot|chart|graph|visualize|visualization|show\s+me|display|draw)\b",
        r"\b(compare|comparison|versus|vs\.?)\b",
    ]
    
    # Check for insight intent
    is_insight = any(re.search(pattern, text_lower) for pattern in insight_patterns)
    
    # Check for graph intent
    is_graph = detected_graph_type is not None or any(re.search(pattern, text_lower) for pattern in graph_keywords)
    
    # Determine intent with priority
    if detected_graph_type or is_graph:
        result = {
            "intent": "graph",
            "graph_type": detected_graph_type or "bar"  # Default to bar if graph intent but no specific type
        }
    elif is_insight:
        result = {"intent": "insight"}
    else:
        # Default to graph with bar chart if unclear
        result = {"intent": "graph", "graph_type": "bar"}
    
    logger.info(f"Intent detection result: {result}")
    return result
