#!/bin/bash
#
# Build PiS88 agent for various Raspberry Pi targets
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "=========================================="
echo "PiS88 Agent Cross-Compilation Build"
echo "=========================================="
echo ""

# Create output directory
mkdir -p dist

# Define targets
declare -A TARGETS=(
    ["armv7-unknown-linux-gnueabihf"]="pi2_pi3_pi4_32bit"
    ["aarch64-unknown-linux-gnu"]="pi3_pi4_64bit"
)

echo -e "${BLUE}Starting builds...${NC}"
echo ""

# ============================================
# Local/Native Build
# ============================================

echo -e "${GREEN}Building for local/native target...${NC}"

# Get host target
HOST_TARGET=$(rustc -vV | grep host | cut -d' ' -f2)

# Use separate target dir for local builds
set +e
CARGO_TARGET_DIR=target-local cargo build --release --bin pis88 -j $(nproc)
LOCAL_BUILD_STATUS=$?
set -e

if [ $LOCAL_BUILD_STATUS -eq 0 ]; then
    # Copy binaries to dist folder
    cp "target-local/release/pis88" "dist/pis88-local-${HOST_TARGET}"

    # Get binary sizes
    size_agent=$(du -h "dist/pis88-local-${HOST_TARGET}" | cut -f1)
    echo -e "  → ${GREEN}dist/pis88-local-${HOST_TARGET}${NC} ($size_agent)"
else
    echo -e "${YELLOW}Local build failed (likely missing dependencies like libudev). Skipping local build.${NC}"
fi

echo ""

# ============================================
# Cross-Compilation Builds
# ============================================

echo -e "${BLUE}Starting cross-compilation builds...${NC}"
echo ""

if ! command -v cross &> /dev/null; then
    echo -e "${YELLOW}Installing 'cross' for cross-compilation...${NC}"
    cargo install cross --git https://github.com/cross-rs/cross
    echo ""
fi

for target in "${!TARGETS[@]}"; do
    name="${TARGETS[$target]}"
    echo -e "${GREEN}Building for $target ($name)...${NC}"
    
    # Build binary
    cross build --release --target "$target" --bin pis88 -j $(nproc)
    
    # Copy binaries to dist folder with descriptive name
    cp "target/$target/release/pis88" "dist/pis88-$name"
    
    # Get binary sizes
    size_agent=$(du -h "dist/pis88-$name" | cut -f1)
    echo -e "  → ${GREEN}dist/pis88-$name${NC} ($size_agent)"
    echo ""
done

echo "=========================================="
echo -e "${GREEN}Build complete!${NC} Binaries in dist/"
echo "=========================================="
ls -lh dist/

echo ""
echo -e "${BLUE}=========================================="
echo "Installing as Root Service (systemd)"
echo -e "==========================================${NC}"
echo ""
echo "1. Copy binary to /usr/local/bin:"
echo -e "  ${YELLOW}sudo cp dist/pis88-pi3_pi4_64bit /usr/local/bin/pis88${NC}"
echo -e "  ${YELLOW}sudo chmod +x /usr/local/bin/pis88${NC}"
echo ""
echo "2. Create service file:"
echo -e "  ${YELLOW}sudo nano /etc/systemd/system/pis88.service${NC}"
echo -e "  (Paste the following content, adjusting arguments as needed)"
echo ""
echo -e "${GREEN}[Unit]"
echo "Description=PiS88 CO2 Sensor Agent"
echo "After=network-online.target"
echo "Wants=network-online.target"
echo ""
echo "[Service]"
echo "Type=simple"
echo "ExecStart=/usr/local/bin/pis88 --server wss://YOUR_SERVER/api/wss --key YOUR_KEY --port /dev/serial0"
echo "Restart=always"
echo "RestartSec=10"
echo "User=root"
echo "Group=root"
echo ""
echo "[Install]"
echo -e "WantedBy=multi-user.target${NC}"
echo ""
echo "3. Enable and start:"
echo -e "  ${YELLOW}sudo systemctl daemon-reload${NC}"
echo -e "  ${YELLOW}sudo systemctl enable --now pis88${NC}"
echo ""
echo "4. Check status:"
echo -e "  ${YELLOW}sudo systemctl status pis88${NC}"
echo -e "  ${YELLOW}sudo journalctl -u pis88 -f${NC}"
echo ""
