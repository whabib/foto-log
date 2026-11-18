#!/usr/bin/env bash
# Reports Artifact Registry's vulnerability scan of one image.
#   scripts/image-scan.sh IMAGE[:TAG|@DIGEST] [--wait]
# Prints a summary (and appends it to $GITHUB_STEP_SUMMARY and $SCAN_REPORT
# when set), writes
# the counts of critical, high and medium findings to $GITHUB_OUTPUT as
# `critical`, `high`, `medium` and `blocking` (their sum), and always exits 0
# once the scan is read, so a report never fails a deploy. --wait waits for a
# freshly pushed image's scan to finish (up to 15 minutes).
set -euo pipefail

image="$1"
wait="${2:-}"

out() { [ -n "${GITHUB_OUTPUT:-}" ] && echo "$1" >> "$GITHUB_OUTPUT" || true; }
summary() {
  echo "$1"
  [ -n "${GITHUB_STEP_SUMMARY:-}" ] && echo "$1" >> "$GITHUB_STEP_SUMMARY"
  [ -n "${SCAN_REPORT:-}" ] && echo "$1" >> "$SCAN_REPORT"
  true
}

if [ "$wait" = "--wait" ]; then
  status=""
  for _ in $(seq 1 60); do
    status=$(gcloud artifacts docker images describe "$image" --show-discovery \
      --format='value(discovery_summary.discovery[0].discovery.analysisStatus)' 2>/dev/null || true)
    case "$status" in
      FINISHED_SUCCESS) break ;;
      FINISHED_FAILED | FINISHED_UNSUPPORTED)
        summary "Vulnerability scan of \`$image\` ended with $status."
        exit 0
        ;;
    esac
    sleep 15
  done
  if [ "$status" != "FINISHED_SUCCESS" ]; then
    summary "Vulnerability scan of \`$image\` hadn't finished (status: ${status:-unknown})."
    exit 0
  fi
fi

json=$(gcloud artifacts docker images describe "$image" --show-package-vulnerability --format=json)
vulns=$(jq '[.package_vulnerability_summary.vulnerabilities // {} | to_entries[] | .value[]]' <<<"$json")
count() { jq --arg s "$1" '[.[] | select(.vulnerability.effectiveSeverity == $s)] | length' <<<"$vulns"; }
critical=$(count CRITICAL)
high=$(count HIGH)
medium=$(count MEDIUM)
low=$(count LOW)
blocking=$((critical + high + medium))
out "critical=$critical"
out "high=$high"
out "medium=$medium"
out "blocking=$blocking"

summary "### Vulnerability scan: \`$image\`"
summary ""
summary "Critical $critical · High $high · Medium $medium · Low $low"
if [ "$blocking" -gt 0 ]; then
  summary ""
  summary "| Severity | CVE | Package | Installed | Fixed in |"
  summary "| --- | --- | --- | --- | --- |"
  jq -r '
    [.[] | select(.vulnerability.effectiveSeverity | IN("CRITICAL", "HIGH", "MEDIUM"))]
    | sort_by({"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2}[.vulnerability.effectiveSeverity])
    | .[]
    | .vulnerability as $v
    | ($v.packageIssue[0] // {}) as $p
    | "| \($v.effectiveSeverity) | \(.noteName | split("/") | last) | \($p.affectedPackage // "?") | \($p.affectedVersion.fullName // "?") | \(if ($p.fixAvailable // false) then ($p.fixedVersion.fullName // "yes") else "no fix yet" end) |"
  ' <<<"$vulns" | while IFS= read -r line; do summary "$line"; done
fi
