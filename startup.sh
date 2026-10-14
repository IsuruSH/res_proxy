#!/bin/sh
# Azure App Service startup command: `sh startup.sh`
#
# FOSMIS only accepts Sri Lankan IPs. When TS_AUTHKEY is set, this starts
# Tailscale in userspace mode (App Service has no /dev/net/tun) and sends
# FOSMIS traffic through a SOCKS5 proxy that exits via TS_EXIT_NODE.
# Without TS_AUTHKEY the API starts normally with direct outbound traffic.
set -u
cd "$(dirname "$0")"

if [ -n "${TS_AUTHKEY:-}" ]; then
  TS_VERSION="${TS_VERSION:-1.104.1}"
  TS_DIR="/home/tailscale/bin/$TS_VERSION"
  TS_STATE_DIR="/home/tailscale/state"
  TS_SOCKET="/tmp/tailscaled.sock"

  if [ ! -x "$TS_DIR/tailscaled" ]; then
    echo "[tailscale] downloading Tailscale $TS_VERSION"
    mkdir -p "$TS_DIR"
    curl -fsSL "https://pkgs.tailscale.com/stable/tailscale_${TS_VERSION}_amd64.tgz" \
      | tar -xz -C "$TS_DIR" --strip-components=1
  fi
  mkdir -p "$TS_STATE_DIR"

  echo "[tailscale] starting tailscaled (userspace networking, SOCKS5 on localhost:1055)"
  "$TS_DIR/tailscaled" \
    --tun=userspace-networking \
    --socks5-server=localhost:1055 \
    --state="$TS_STATE_DIR/tailscaled.state" \
    --socket="$TS_SOCKET" \
    >> /home/LogFiles/tailscaled.log 2>&1 &
  sleep 3

  echo "[tailscale] connecting with exit node ${TS_EXIT_NODE:-<not set>}"
  if "$TS_DIR/tailscale" --socket="$TS_SOCKET" up \
      --auth-key="$TS_AUTHKEY" \
      --hostname="${TS_HOSTNAME:-azure-res-proxy}" \
      --exit-node="${TS_EXIT_NODE:-}" \
      --timeout=60s; then
    "$TS_DIR/tailscale" --socket="$TS_SOCKET" status || true
    export FOSMIS_PROXY_URL="${FOSMIS_PROXY_URL:-socks5h://localhost:1055}"
  else
    echo "[tailscale] ERROR: 'tailscale up' failed; FOSMIS requests will go direct and fail. See /home/LogFiles/tailscaled.log"
  fi
fi

exec npm start
