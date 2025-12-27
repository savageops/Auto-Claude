# Quick Spec: Fix Windows Unicode Subprocess Errors

## Overview
Add UTF-8 encoding support to subprocess environment to prevent UnicodeDecodeError crashes on Windows.

## Workflow Type
simple

## Task Scope
- Modify `apps/backend/core/auth.py` to add PYTHONUTF8=1 and PYTHONIOENCODING environment variables to SDK subprocess configuration

## Success Criteria
- Build tasks complete without UnicodeDecodeError crashes on Windows
- Subprocess output is readable (non-UTF-8 bytes replaced with replacement character)
- No regressions on macOS/Linux

## Task
Add UTF-8 encoding support to subprocess environment to prevent UnicodeDecodeError crashes on Windows.

## Files to Modify
- `apps/backend/core/auth.py` - Add PYTHONUTF8=1 and PYTHONIOENCODING to SDK environment variables

## Change Details
On Windows, subprocess output often uses Windows-1252 (cp1252) encoding instead of UTF-8. When the Claude Agent SDK reads subprocess output with `text=True`, Python's default UTF-8 decoding fails on non-ASCII bytes.

The fix adds two environment variables to `get_sdk_env_vars()`:
1. `PYTHONUTF8=1` - Enables Python UTF-8 mode on Windows
2. `PYTHONIOENCODING=utf-8:replace` - Sets default encoding with error handler

This ensures subprocesses spawned by the SDK use UTF-8 encoding and gracefully handle any encoding errors.

## Verification
- [ ] Build tasks complete without UnicodeDecodeError crashes on Windows
- [ ] Subprocess output is readable (non-UTF-8 bytes replaced with replacement character)
- [ ] No regressions on macOS/Linux

## Notes
- The error trace shows Python's internal `_readerthread` failing to decode subprocess output
- This is a Windows-specific issue (console output uses cp1252 by default)
- The fix is backward-compatible and has no effect on UTF-8 systems
