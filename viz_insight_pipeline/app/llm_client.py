"""
Minimal LLM client wrapper using Google Gemini.

Rationale:
- Use google-generativeai SDK for robust Gemini access.
- Keep interface tiny: call(system_prompt, user_prompt) -> str.
- No retries / no fallback.
"""

import os
import google.generativeai as genai
from typing import Optional

# Environment variables
API_KEY = os.getenv("GEMINI_API_KEY") or os.getenv("LLM_API_KEY")
MODEL_NAME = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")


def call_llm(system_prompt: str, user_prompt: str, max_tokens: int = 1024) -> str:
    """
    Call Gemini LLM with system instruction and user prompt.
    """
    import logging
    logger = logging.getLogger(__name__)
    
    if not API_KEY:
        raise RuntimeError("GEMINI_API_KEY or LLM_API_KEY must be set in environment")

    try:
        genai.configure(api_key=API_KEY)
        
        logger.info(f"Calling Gemini {MODEL_NAME} with max_tokens={max_tokens}")
        logger.debug(f"System prompt (first 200 chars): {system_prompt[:200]}")
        logger.debug(f"User prompt (first 200 chars): {user_prompt[:200]}")
        
        # Initialize model with system instruction
        model = genai.GenerativeModel(
            model_name=MODEL_NAME,
            system_instruction=system_prompt
        )
        
        # Configuration for generation
        config = genai.GenerationConfig(
            max_output_tokens=max_tokens,
            temperature=0.1  # Low temperature for more deterministic code/JSON
        )

        response = model.generate_content(user_prompt, generation_config=config)
        
        # Check if response has text
        try:
            result = response.text
        except ValueError:
            # Handle cases where response.text is not available (e.g. safety block or other finish reasons)
            logger.error(f"Gemini response has no text. Candidates: {response.candidates}")
            if response.candidates:
                candidate = response.candidates[0]
                if candidate.finish_reason == 2: # MAX_TOKENS
                     # Try to retrieve partial text if available
                    if candidate.content and candidate.content.parts:
                        result = candidate.content.parts[0].text
                        logger.warning("Gemini response truncated (MAX_TOKENS). Returning partial text.")
                    else:
                        raise RuntimeError("Gemini response truncated with no content.")
                else:
                    raise RuntimeError(f"Gemini blocked response. Finish reason: {candidate.finish_reason}")
            else:
                raise RuntimeError("Gemini returned no candidates.")

        if not result:
            logger.error(f"Empty response from Gemini. Response object: {response}")
            raise RuntimeError("Gemini returned empty response")
        
        logger.info(f"Gemini response length: {len(result)} chars")
        logger.debug(f"Gemini response (first 500 chars): {result[:500]}")
        
        # Return text content
        return result
        
    except Exception as e:
        logger.error(f"Gemini API error: {type(e).__name__}: {e}")
        # Wrap provider-specific errors
        raise RuntimeError(f"Gemini API error: {str(e)}")
