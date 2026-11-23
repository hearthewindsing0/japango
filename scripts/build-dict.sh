#!/usr/bin/env bash
# Downloads JMdict (with Tatoeba examples) and KANJIDIC2 from
# scriptin/jmdict-simplified and builds the game's dictionary with
# scripts/build-dict.mjs. Used by the Map data and Conversations workflows.
set -euo pipefail
assets=$(curl -fsSL https://api.github.com/repos/scriptin/jmdict-simplified/releases/latest | jq -r '.assets[].browser_download_url')
# JMdict with Tatoeba example sentences; plain JMdict if a release lacks it.
url=$(echo "$assets" | grep -E '/jmdict-examples-eng-[0-9][^/]*\.json\.tgz$' | head -1 || true)
[ -n "$url" ] || url=$(echo "$assets" | grep -E '/jmdict-eng-[0-9][^/]*\.json\.tgz$' | head -1 || true)
kd=$(echo "$assets" | grep -E '/kanjidic2-en-[0-9][^/]*\.json\.tgz$' | head -1 || true)
echo "JMdict: $url"
echo "KANJIDIC2: $kd"
mkdir -p /tmp/jmdict /tmp/kanjidic
curl -fsSL "$url" | tar xz -C /tmp/jmdict
[ -n "$kd" ] && curl -fsSL "$kd" | tar xz -C /tmp/kanjidic
bun scripts/build-dict.mjs /tmp/jmdict/*.json $(ls /tmp/kanjidic/*.json 2>/dev/null | head -1)
