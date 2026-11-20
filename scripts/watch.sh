#!/usr/bin/env bash
# Runs the internship check. MODE=run: check every 10 minutes for ~5.5 hours, publishing listings
# after each check, then start the next run. MODE=once|test|digest: a single pass.
# State (what's been seen and sent) lives on the `data` branch next to the listings, so the bot
# never commits to main (which would redeploy the website every 10 minutes).
set -u
INTERVAL=${INTERVAL_SECONDS:-600}
WINDOW=${WATCH_MINUTES:-325}
END=$(( $(date +%s) + WINDOW * 60 ))
mkdir -p state data

# latest state from the data branch (falls back to the copy in main the first time)
if git fetch -q origin data 2>/dev/null && git show FETCH_HEAD:state.json > /tmp/state.json 2>/dev/null; then
  mv /tmp/state.json state/state.json
fi

publish() {
  [ -f data/jobs.json ] || return 0
  rm -rf /tmp/pub && mkdir -p /tmp/pub
  cp data/jobs.json state/state.json /tmp/pub/
  cp data/openings.json MATCHES.md STATUS.md /tmp/pub/ 2>/dev/null || true
  ( cd /tmp/pub && git init -q -b data && git add . \
    && git -c user.name="internship-bot" -c user.email="internship-bot@users.noreply.github.com" \
         commit -qm "listings $(date -u +%FT%TZ)" \
    && git push -qf "https://x-access-token:${GH_TOKEN}@github.com/${REPO}.git" data ) \
    && echo "published $(date -u +%H:%M) UTC"
}

case "$MODE" in
  test)   python -m agent.main --test; exit $? ;;
  digest) python -m agent.main --digest; publish; exit 0 ;;
  once)   python -m agent.main; publish; exit 0 ;;
esac

while :; do
  start=$(date +%s)
  python -m agent.main || echo "::warning::check failed, trying again next round"
  publish || echo "::warning::publish failed"
  now=$(date +%s)
  [ $(( now + INTERVAL )) -ge "$END" ] && break
  wait=$(( INTERVAL - (now - start) ))
  [ "$wait" -gt 0 ] && sleep "$wait"
done

# hand over to a fresh run (it starts as soon as this one ends)
gh workflow run alerts.yml -R "$REPO" -f mode=run && echo "next run queued" || echo "::warning::couldn't queue the next run"
