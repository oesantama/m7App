#!/bin/bash

is_free() {
  local port=$1
  if ! ss -tunlp | grep -q ":$port "; then
    return 0 # free
  else
    return 1 # occupied
  fi
}

find_free_port() {
  local port=$1
  while ! is_free $port; do
    port=$((port + 1))
  done
  echo $port
}

BACKEND_PORT=$(find_free_port 8080)
FRONTEND_PORT=$(find_free_port 5173)
DB_PORT=$(find_free_port 5432)

echo "BACKEND_PORT=$BACKEND_PORT"
echo "FRONTEND_PORT=$FRONTEND_PORT"
echo "DB_PORT=$DB_PORT"
