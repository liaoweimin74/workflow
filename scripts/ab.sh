#!/usr/bin/env bash
# agent-browser 包装器：headless + 统一超时，用完务必 close 并确认 chrome=0（OOM 铁律）
exec agent-browser "$@"
