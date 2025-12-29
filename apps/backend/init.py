"""
Turret project initialization utilities.

Handles first-time setup of .turret directory and ensures proper gitignore configuration.
"""

from pathlib import Path


def ensure_gitignore_entry(project_dir: Path, entry: str = ".turret/") -> bool:
    """
    Ensure an entry exists in the project's .gitignore file.

    Creates .gitignore if it doesn't exist.

    Args:
        project_dir: The project root directory
        entry: The gitignore entry to add (default: ".turret/")

    Returns:
        True if entry was added, False if it already existed
    """
    gitignore_path = project_dir / ".gitignore"

    # Check if .gitignore exists and if entry is already present
    if gitignore_path.exists():
        content = gitignore_path.read_text()
        lines = content.splitlines()

        # Check if entry already exists (exact match or with trailing newline variations)
        entry_normalized = entry.rstrip("/")
        for line in lines:
            line_stripped = line.strip()
            # Match both ".turret" and ".turret/"
            if (
                line_stripped == entry
                or line_stripped == entry_normalized
                or line_stripped == entry_normalized + "/"
            ):
                return False  # Already exists

        # Entry doesn't exist, append it
        # Ensure file ends with newline before adding our entry
        if content and not content.endswith("\n"):
            content += "\n"

        # Add a comment and the entry
        content += "\n# Turret data directory\n"
        content += entry + "\n"

        gitignore_path.write_text(content)
        return True
    else:
        # Create new .gitignore with the entry
        content = "# Turret data directory\n"
        content += entry + "\n"

        gitignore_path.write_text(content)
        return True


def init_turret_dir(project_dir: Path) -> tuple[Path, bool]:
    """
    Initialize the .turret directory for a project.

    Creates the directory if needed and ensures it's in .gitignore.

    Args:
        project_dir: The project root directory

    Returns:
        Tuple of (turret_dir path, gitignore_was_updated)
    """
    project_dir = Path(project_dir)
    turret_dir = project_dir / ".turret"

    # Create the directory if it doesn't exist
    dir_created = not turret_dir.exists()
    turret_dir.mkdir(parents=True, exist_ok=True)

    # Ensure .turret is in .gitignore (only on first creation)
    gitignore_updated = False
    if dir_created:
        gitignore_updated = ensure_gitignore_entry(project_dir, ".turret/")
    else:
        # Even if dir exists, check gitignore on first run
        # Use a marker file to track if we've already checked
        marker = turret_dir / ".gitignore_checked"
        if not marker.exists():
            gitignore_updated = ensure_gitignore_entry(project_dir, ".turret/")
            marker.touch()

    return turret_dir, gitignore_updated


def get_turret_dir(project_dir: Path, ensure_exists: bool = True) -> Path:
    """
    Get the .turret directory path, optionally ensuring it exists.

    Args:
        project_dir: The project root directory
        ensure_exists: If True, create directory and update gitignore if needed

    Returns:
        Path to the .turret directory
    """
    if ensure_exists:
        turret_dir, _ = init_turret_dir(project_dir)
        return turret_dir

    return Path(project_dir) / ".turret"
