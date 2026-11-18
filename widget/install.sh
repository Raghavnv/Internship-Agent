#!/bin/bash
# Installs the Internship Copilot menu-bar widget on macOS.
#   curl -fsSL https://raw.githubusercontent.com/Raghavnv/Internship-Agent/main/widget/install.sh | bash
set -euo pipefail
if [ ! -d /Applications/SwiftBar.app ]; then
  if command -v brew >/dev/null 2>&1; then
    echo "Installing SwiftBar (free, open-source menu-bar app)..."
    brew install --cask swiftbar
  else
    echo "Please install SwiftBar first from https://swiftbar.app (or install Homebrew), then run this again."
    exit 1
  fi
fi
DIR="$HOME/SwiftBarPlugins"
mkdir -p "$DIR"
curl -fsSL https://raw.githubusercontent.com/Raghavnv/Internship-Agent/main/widget/internships.15m.js -o "$DIR/internships.15m.js"
chmod +x "$DIR/internships.15m.js"
defaults write com.ameba.SwiftBar PluginDirectory "$DIR" || true
open -a SwiftBar
echo "Done. Look for the briefcase in your menu bar. If SwiftBar asks for a plugin folder, choose: $DIR"
