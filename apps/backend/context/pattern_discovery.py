"""
Pattern & UI/UX Pattern Discovery
=================================

Discovers code and UI/UX patterns from reference files to guide implementation.
"""

from pathlib import Path
import re
from typing import List, Dict, Set, Callable

from .models import FileMatch

class PatternDiscovererConfig:
    """Configurable options for PatternDiscoverer."""
    UI_UX_TERMS = [
        "card", "component", "border", "shadow", "font", "hilite", "highlight", "button",
        "input", "form", "label", "padding", "margin", "tailwind", "theme", "rounded",
        "radius", "elevation", "color", "palette", "z-", "flex", "grid", "gap",
        "justify", "align", "text-", "bg-", "hover:", "focus:", "ring", "opacity",
        "px-", "py-", "pt-", "pb-", "pl-", "pr-", "mx-", "my-", "mt-", "mb-", "ml-", "mr-",
        "w-", "h-", "space-", "divide", "shadow-", "outline", "transition", "uppercase",
        "lowercase", "capitalize", "tracking", "leading", "underline", "italic", "bold"
    ]
    CSS_PROPERTIES = [
        "border", "box-shadow", "background", "color", "font-size", "font-family",
        "font-weight", "margin", "padding", "display", "flex", "grid", "gap",
        "justify-content", "align-items", "width", "height", "border-radius",
        "z-index", "opacity", "transition", "outline", "overflow", "text-align"
    ]
    HTML_STRUCTURE_TAGS_REGEX = re.compile(
        r"<(h[1-6]|section|header|footer|main|nav|article|aside|ul|li|hr|div|span|strong|em|b|i)[^>]*>",
        re.IGNORECASE
    )

    # Allow dynamic extension
    def __init__(self,
                 ui_ux_terms: List[str] = None,
                 css_properties: List[str] = None,
                 ):
        if ui_ux_terms is not None:
            self.UI_UX_TERMS = ui_ux_terms
        if css_properties is not None:
            self.CSS_PROPERTIES = css_properties

class PatternDiscoverer:
    """
    Discovers code and UI/UX patterns, visual motifs, structure, design heuristics
    from reference files to guide implementation. Extensible, modular, scalable.
    """
    def __init__(self, project_dir: Path, config: PatternDiscovererConfig = None):
        self.project_dir = project_dir.resolve()
        self.config = config if config else PatternDiscovererConfig()
        self._compile_regexes()

    def _compile_regexes(self):
        # Compile and cache regexes for efficiency & clarity
        css_props = self.config.CSS_PROPERTIES
        self.css_regex = re.compile(
            r"|".join(
                re.escape(prop) + r"\s*:\s*[^;]+;"
                for prop in css_props
            ),
            flags=re.IGNORECASE,
        )
        ui_ux_terms = self.config.UI_UX_TERMS
        # Tailwind: Only those that look like utility classes
        tailwind_like_terms = [
            term for term in ui_ux_terms
            if "-" in term or ":" in term or term.startswith("text") or term.startswith("bg") or term.startswith("w-") or term.startswith("h-")
        ]
        self.tailwind_class_regex = re.compile(
            r"\b(" + "|".join([re.escape(term) for term in tailwind_like_terms]) + r")[^\s\"'>]*",
            flags=re.IGNORECASE
        )
        # Visual hierarchy
        self.visual_hierarchy_regex = re.compile(
            r"\b(font[-_]?size|font[-_]?weight|h[1-6]|bold|strong|uppercase|lowercase|capitalize|section|main|nav)\b",
            re.IGNORECASE
        )
        # Card/component detection
        self.card_component_regex = re.compile(
            r"\b(card|component|paper|panel|box|container|section)\b",
            re.IGNORECASE
        )
        # Border and shadow
        self.border_shadow_regex = re.compile(
            r"\b(border(-(top|right|left|bottom))?|box-shadow|shadow)\b",
            re.IGNORECASE
        )
        # Padding/margin
        self.pad_margin_regex = re.compile(
            r"\b(padding|margin|p[trblxy]?-[0-9a-z]+|m[trblxy]?-[0-9a-z]+)\b",
            re.IGNORECASE
        )

    def discover_patterns(
        self,
        reference_files: List[FileMatch],
        keywords: List[str],
        max_files: int = 5,
    ) -> Dict[str, str]:
        """
        Discover code patterns and UI/UX design motifs from reference files.

        Args:
            reference_files: List of FileMatch objects to analyze
            keywords: User-supplied code keywords to look for in the code
            max_files: Maximum number of files to analyze

        Returns:
            Dictionary mapping pattern keys to code/UI snippets
        """
        results = {}

        # Compose all keywords
        all_keywords = set(keywords) | set(self.config.UI_UX_TERMS)

        for match in reference_files[:max_files]:
            try:
                file_path = self.project_dir / match.path
                content = file_path.read_text(errors="ignore")
            except (OSError, UnicodeDecodeError):
                continue

            lines = content.split("\n")
            lower_content = content.lower()

            # --- Modular pattern discovery flow
            file_patterns = {}

            # 1. Code patterns (needle-in-haystack, thread of logic)
            self._extract_code_patterns(lines, keywords, match, file_patterns)

            # 2. UI/UX Patterns: Tailwind, CSS properties, etc.
            self._extract_tailwind_classes(lines, match, file_patterns)
            self._extract_css_properties(content, match, lower_content, file_patterns)

            # 3. Visual/Structural UI Patterns
            self._extract_visual_hierarchy(lines, match, file_patterns)
            self._extract_card_components(lines, match, file_patterns)
            self._extract_border_shadow(lines, match, file_patterns)
            self._extract_pad_margin(lines, match, file_patterns)

            # 4. UI Structure (HTMLish/Reactish/etc.)
            self._extract_ui_structure(lines, match, file_patterns)

            # 5. Extendibility point: for plugin-based or custom pattern extractors

            # Merge per-file findings into overall results, DRY (add if not already present)
            for k, v in file_patterns.items():
                if k not in results:
                    results[k] = v
                else:
                    # Allow accumulation for class lists, structure, etc.
                    if isinstance(v, set):
                        results[k] = results[k].union(v)
                    elif isinstance(v, str):
                        results[k] += "\n" + v

        # Final clean-up: convert set-based aggregates to sorted snippets
        for k in list(results):
            if isinstance(results[k], set):
                results[k] = ", ".join(sorted(results[k]))[:950]

        return results

    # --- Modular pattern extractors below ---

    def _extract_code_patterns(
        self, lines: List[str], keywords: List[str], match: FileMatch, patterns: Dict
    ):
        lower_lines = [l.lower() for l in lines]
        for keyword in keywords:
            found = False
            for i, line in enumerate(lower_lines):
                if keyword.lower() in line:
                    start = max(0, i - 3)
                    end = min(len(lines), i + 4)
                    snippet = "\n".join(lines[start:end])
                    pattern_key = f"{keyword}_pattern"
                    patterns.setdefault(
                        pattern_key, f"From {match.path}:\n{snippet[:300]}"
                    )
                    found = True
                    break  # Only first instance for brevity
            if found:
                continue

    def _extract_tailwind_classes(
        self, lines: List[str], match: FileMatch, patterns: Dict
    ):
        tw_classes = set()
        for line in lines:
            for m in self.tailwind_class_regex.finditer(line):
                tw_classes.add(m.group(0))
        if tw_classes:
            key = "tailwind_classes"
            msg = f"From {match.path}:\n" + ", ".join(sorted(tw_classes))[:300]
            if key in patterns:
                patterns[key] += "\n" + msg
            else:
                patterns[key] = msg

    def _extract_css_properties(
        self, content: str, match: FileMatch, lower_content: str, patterns: Dict
    ):
        is_style_file = match.path.lower().endswith((".css", ".scss", ".less"))
        if is_style_file or ("style" in lower_content):
            css_matches = self.css_regex.findall(content)
            if css_matches:
                key = "css_properties"
                msg = f"From {match.path}:\n" + "\n".join(css_matches[:10])
                if key in patterns:
                    patterns[key] += "\n" + msg
                else:
                    patterns[key] = msg

    def _extract_visual_hierarchy(
        self, lines: List[str], match: FileMatch, patterns: Dict
    ):
        visual_snippets = []
        for i, line in enumerate(lines):
            if self.visual_hierarchy_regex.search(line):
                start = max(0, i - 2)
                end = min(len(lines), i + 3)
                visual_snippets.append("\n".join(lines[start:end]))
        if visual_snippets:
            key = "visual_hierarchy"
            snips = list(dict.fromkeys(visual_snippets))[:5]
            msg = f"From {match.path}:\n" + "\n--\n".join(snips)[:600]
            if key in patterns:
                patterns[key] += "\n" + msg
            else:
                patterns[key] = msg

    def _extract_card_components(
        self, lines: List[str], match: FileMatch, patterns: Dict
    ):
        card_snips = []
        for i, line in enumerate(lines):
            if self.card_component_regex.search(line):
                start = max(0, i - 2)
                end = min(len(lines), i + 3)
                card_snips.append("\n".join(lines[start:end]))
        if card_snips:
            key = "cards_components"
            snips = list(dict.fromkeys(card_snips))[:5]
            msg = f"From {match.path}:\n" + "\n--\n".join(snips)[:600]
            if key in patterns:
                patterns[key] += "\n" + msg
            else:
                patterns[key] = msg

    def _extract_border_shadow(
        self, lines: List[str], match: FileMatch, patterns: Dict
    ):
        border_shadows = []
        for i, line in enumerate(lines):
            if self.border_shadow_regex.search(line):
                start = max(0, i - 2)
                end = min(len(lines), i + 3)
                border_shadows.append("\n".join(lines[start:end]))
        if border_shadows:
            key = "border_shadow"
            snips = list(dict.fromkeys(border_shadows))[:5]
            msg = f"From {match.path}:\n" + "\n--\n".join(snips)[:600]
            if key in patterns:
                patterns[key] += "\n" + msg
            else:
                patterns[key] = msg

    def _extract_pad_margin(
        self, lines: List[str], match: FileMatch, patterns: Dict
    ):
        padm_snips = []
        for i, line in enumerate(lines):
            if self.pad_margin_regex.search(line):
                start = max(0, i - 2)
                end = min(len(lines), i + 3)
                padm_snips.append("\n".join(lines[start:end]))
        if padm_snips:
            key = "padding_margin"
            snips = list(dict.fromkeys(padm_snips))[:5]
            msg = f"From {match.path}:\n" + "\n--\n".join(snips)[:600]
            if key in patterns:
                patterns[key] += "\n" + msg
            else:
                patterns[key] = msg

    def _extract_ui_structure(
        self, lines: List[str], match: FileMatch, patterns: Dict
    ):
        structure_found = []
        file_ext = match.path.lower()
        # Scan for both UI/UX keywords and semantic HTML structure
        for i, line in enumerate(lines):
            if any(
                ext in file_ext
                for ext in (".js", ".ts", ".jsx", ".tsx", ".vue", ".svelte", ".html")
            ):
                if any(ui_term in line.lower() for ui_term in self.config.UI_UX_TERMS):
                    start = max(0, i - 2)
                    end = min(len(lines), i + 3)
                    snippet = "\n".join(lines[start:end])
                    structure_found.append(snippet)
            if self.config.HTML_STRUCTURE_TAGS_REGEX.search(line):
                start = max(0, i - 2)
                end = min(len(lines), i + 3)
                snippet = "\n".join(lines[start:end])
                structure_found.append(snippet)
        if structure_found:
            key = "ui_structure"
            snippets = list(dict.fromkeys(structure_found))[:3]
            structure_msg = f"From {match.path}:\n" + "\n--\n".join(snippets)[:600]
            if key in patterns:
                patterns[key] += "\n" + structure_msg
            else:
                patterns[key] = structure_msg

