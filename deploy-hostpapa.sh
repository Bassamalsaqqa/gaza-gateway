#!/bin/bash
set -euo pipefail

TARGET="${1:-}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
SITE_DIR="$SCRIPT_DIR/site"
RELEASE_MANIFEST="$SCRIPT_DIR/release-manifest.txt"
MANAGED_MANIFEST="$HOME/.gazaairport-deployed-files"

fail() {
  printf 'HostPapa deployment refused: %s\n' "$1" >&2
  exit 1
}

case "$TARGET" in
  ""|/|"$HOME"|"$HOME"/) fail "target must be a non-root directory below HOME" ;;
  "$HOME"/*) ;;
  *) fail "target must be below HOME" ;;
esac

case "$TARGET" in
  *"/../"*|*/..|*"/./"*|*/.|*"//"*) fail "target contains an unsafe path segment" ;;
esac

for required in \
  "$SITE_DIR/index.html" \
  "$SITE_DIR/.htaccess" \
  "$SITE_DIR/_shell.html" \
  "$SITE_DIR/ar/_shell.html" \
  "$SITE_DIR/admin/_shell.html" \
  "$SITE_DIR/ar/admin/_shell.html" \
  "$RELEASE_MANIFEST"; do
  [ -f "$required" ] || fail "required release file is missing: $required"
done

validate_relative_path() {
  local path="$1"
  [ -n "$path" ] || fail "manifest contains an empty path"
  case "$path" in
    /*|../*|*/../*|*/..|./*|*/./*|*/.|.well-known|.well-known/*)
      fail "manifest contains an unsafe or protected path: $path"
      ;;
  esac
}

declare -A CURRENT_FILES=()
while IFS= read -r path || [ -n "$path" ]; do
  validate_relative_path "$path"
  [ -f "$SITE_DIR/$path" ] || fail "manifest references a missing release file: $path"
  CURRENT_FILES["$path"]=1
done < "$RELEASE_MANIFEST"

mkdir -p -- "$TARGET"

if [ -f "$MANAGED_MANIFEST" ]; then
  while IFS= read -r path || [ -n "$path" ]; do
    validate_relative_path "$path"
    if [ -z "${CURRENT_FILES[$path]+x}" ]; then
      rm -f -- "$TARGET/$path"
    fi
  done < "$MANAGED_MANIFEST"
fi

# Copy the release contents, including .htaccess. Unknown server files and
# directories are left untouched.
cp -a -- "$SITE_DIR/." "$TARGET/"

manifest_tmp="$MANAGED_MANIFEST.tmp.$$"
cp -- "$RELEASE_MANIFEST" "$manifest_tmp"
mv -f -- "$manifest_tmp" "$MANAGED_MANIFEST"

printf 'Gaza Gateway static release deployed to %s\n' "$TARGET"
