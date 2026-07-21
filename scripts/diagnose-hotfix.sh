#!/usr/bin/env bash
set -o pipefail
awk '
  /python <<'"'"'PY'"'"'/ { capture=1; next }
  capture && /^          PY$/ { capture=0; exit }
  capture { sub(/^          /, ""); print }
' .github/workflows/apply-hotfix.yml > /tmp/apply-hotfix.py
python /tmp/apply-hotfix.py 2>&1 | tail -n 20
