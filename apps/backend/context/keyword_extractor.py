"""
Keyword Extraction
==================

Extracts meaningful keywords from task descriptions for search.
"""

import re

class KeywordExtractor:
    """Extracts and filters keywords from task descriptions."""

    # Common words to filter out as stopwords or filler content. Avoids code-related words like 'if', 'else', 'for', etc.
    STOPWORDS = {
        # Articles, connectors, and basic verbs
        "a", "an", "the", "of", "in", "on", "at", "by", "with",
        "is", "are", "was", "were", "be", "been", "being",
        "have", "has", "had", "do", "does", "can",

        # Common filler/adverbs and minimal context words
        "so", "just", "much", "also", "get", "got", "thus", "really", "very",
        "almost", "actually", "literally", "basically", "hence", "though", "although",
        "maybe", "perhaps", "simply", "stuff", "things", "kinda", "sorta", "somehow",

        # Business jargon/filler
        "etcetera", "regarding", "regards", "regard", "shall",
        "thusly", "furthermore", "additionally", "anyway", "anyways", "upon",
        "overall", "whilst", "hereby", "herein", "hereafter", "thereby", "therein", "thereof",

        # Politeness/filler/affirmation/negation
        "no", "yes", "okay", "ok", "alright", "sure", "please", "thanks", "thank", "welcome",
        "hi", "hello", "hey", "bye", "goodbye", "cheers",

        # Vague/general/low-content
        "someone", "something", "anything", "everything", "nothing", "anyone", "everyone",

        # Extra conversational or useless fillers
        "like", "well", "uh", "um", "hmm", "huh", "mmm", "oh", "ah", "ugh",

        # Additional fillers, hedges, or intensifiers that add no value
        "sort", "kind", "honestly", "similarly", "pretty",
        "sorts", "kinds", "mostly", "generally", "possibly", "overall", "simply",
        "somewhat", "totally", "absolutely", "completely",
        "obviously", "clearly", "surely", "definitely", "certainly", "likely", "unlikely",
        "apparently", "essentially", "virtually", "really", "seriously",
        "yeah", "right", "guess", "fine"
    }

    @classmethod
    def extract_keywords(cls, task: str, max_keywords: int = 10) -> list[str]:
        """
        Extract search keywords from task description.

        Args:
            task: Task description string
            max_keywords: Maximum number of keywords to return

        Returns:
            List of extracted keywords
        """
        # Tokenize input text using regular expressions.
        # How: This splits the task description into words, ignoring punctuation.
        # Why: Split into words allows later filtering and extraction.
        words = re.findall(r"\b[a-zA-Z_][a-zA-Z0-9_]*\b", task.lower())

        # Filter out stopwords and require minimum length.
        # How: Remove words that are in STOPWORDS and those shorter than 3 characters.
        # Why: Short words and common words are rarely meaningful as keywords.
        keywords = [w for w in words if w not in cls.STOPWORDS and len(w) > 2]

        # Deduplicate while keeping order, to avoid repeating the same keyword.
        # How: Use a set to track seen keywords, but output them in original order.
        # Why: Ensures output is concise and preserves the first occurrence order.
        seen = set()
        unique_keywords = []
        for kw in keywords:
            if kw not in seen:
                seen.add(kw)
                unique_keywords.append(kw)

        # Return only up to max_keywords requested by caller.
        # Why: Prevent huge lists & keep most relevant keywords.
        return unique_keywords[:max_keywords]
