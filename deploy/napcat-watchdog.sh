#!/bin/sh
set -eu

deploy_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$deploy_dir"

if ! grep -Eq '^NAPCAT_QUICK_PASSWORD=.+|^NAPCAT_QUICK_PASSWORD_MD5=.+' .env; then
  exit 0
fi

status=$(curl -fsS --connect-timeout 10 --max-time 20 https://babylink.top/api/auth/config) || exit 0
recovery_file="$deploy_dir/private/napcat-watchdog-recovery-pending"
offline_since_file="$deploy_dir/private/napcat-watchdog-offline-since"
if printf '%s' "$status" | grep -q '"botOnline":true'; then
  rm -f "$recovery_file" "$offline_since_file"
  exit 0
fi

if ! printf '%s' "$status" | grep -Eq '"botCheckedAt":[1-9][0-9]*'; then
  exit 0
fi

if test -e "$recovery_file"; then
  exit 0
fi

state_file="$deploy_dir/private/napcat-watchdog-last-restart"
mkdir -p "$deploy_dir/private"
now=$(date +%s)
if ! test -f "$offline_since_file"; then
  umask 077
  printf '%s\n' "$now" > "$offline_since_file"
  exit 0
fi

offline_since=$(cat "$offline_since_file" 2>/dev/null || printf '0')
case "$offline_since" in
  ''|*[!0-9]*) offline_since=0 ;;
esac
if test $((now - offline_since)) -lt 120; then
  exit 0
fi

last_restart=0
if test -s "$state_file"; then
  last_restart=$(cat "$state_file" 2>/dev/null || printf '0')
fi
case "$last_restart" in
  ''|*[!0-9]*) last_restart=0 ;;
esac
if test $((now - last_restart)) -lt 600; then
  exit 0
fi

umask 077
printf '%s\n' "$now" > "$state_file"
: > "$recovery_file"
docker compose restart napcat