"""
Minimal LLM client wrapper using Google Gemini.

Rationale:
- Use google-generativeai SDK for robust Gemini access.
- Keep interface tiny: call(system_prompt, user_prompt) -> str.
- No retries / no fallback.
"""

import os
import google.generativeai as genai


def call_llm(system_prompt: str, user_prompt: str, max_tokens: int = 1024) -> str:
    """
    Call Gemini LLM with system instruction and user prompt.
    """
    # Load API key lazily (after main.py sets env vars)
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("LLM_API_KEY")
    model_name = os.getenv("GEMINI_MODEL")
    
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY or LLM_API_KEY must be set in environment")
        
    if not model_name:
        raise RuntimeError("GEMINI_MODEL must be set in environment")

    try:
        genai.configure(api_key=api_key)
        
        # Initialize model with system instruction
        model = genai.GenerativeModel(
            model_name=model_name,
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
            if response.candidates:
                candidate = response.candidates[0]
                if candidate.finish_reason == 2:  # MAX_TOKENS
                    # Try to retrieve partial text if available
                    if candidate.content and candidate.content.parts:
                        result = candidate.content.parts[0].text
                    else:
                        raise RuntimeError("Gemini response truncated with no content.")
                else:
                    raise RuntimeError(f"Gemini blocked response. Finish reason: {candidate.finish_reason}")
            else:
                raise RuntimeError("Gemini returned no candidates.")

        if not result:
            raise RuntimeError("Gemini returned empty response")

        return result

    except Exception as e:
        raise RuntimeError(f"Gemini API error: {str(e)}")
