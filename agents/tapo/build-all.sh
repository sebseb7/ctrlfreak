#!/bin/bash
#
# Build Tapo agent for various Raspberry Pi targets
#
# Targets:
#   - Pi 2, Pi 3, Pi 4 (32-bit): armv7-unknown-linux-gnueabihf
#   - Pi 3, Pi 4 (64-bit): aarch64-unknown-linux-gnu
#
# Usage: ./build-all.sh
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "=========================================="
echo "Tapo Agent Cross-Compilation Build"
echo "=========================================="
echo ""

# ============================================
# Prerequisites Check
# ============================================

MISSING_DEPS=0

echo -e "${BLUE}Checking prerequisites...${NC}"
echo ""

# Check for Rust/Cargo
if ! command -v cargo &> /dev/null; then
    echo -e "${RED}✗ Rust/Cargo not found${NC}"
    echo "  Install with:"
    echo -e "    ${YELLOW}curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh${NC}"
    echo "    source \$HOME/.cargo/env"
    echo ""
    MISSING_DEPS=1
else
    RUST_VERSION=$(rustc --version | cut -d' ' -f2)
    echo -e "${GREEN}✓ Rust/Cargo installed${NC} (v$RUST_VERSION)"
fi

# Check for Docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}✗ Docker not found${NC}"
    echo "  Install with:"
    echo -e "    ${YELLOW}sudo apt update && sudo apt install -y docker.io${NC}"
    echo -e "    ${YELLOW}sudo usermod -aG docker \$USER${NC}"
    echo "    (log out and back in after adding to docker group)"
    echo ""
    MISSING_DEPS=1
else
    DOCKER_VERSION=$(docker --version | cut -d' ' -f3 | tr -d ',')
    echo -e "${GREEN}✓ Docker installed${NC} (v$DOCKER_VERSION)"
    
    # Check if Docker daemon is running
    if ! docker info &> /dev/null; then
        echo -e "${RED}✗ Docker daemon not running or no permission${NC}"
        echo "  Try:"
        echo -e "    ${YELLOW}sudo systemctl start docker${NC}"
        echo "  Or if permission denied:"
        echo -e "    ${YELLOW}sudo usermod -aG docker \$USER${NC}"
        echo "    (log out and back in)"
        echo ""
        MISSING_DEPS=1
    else
        echo -e "${GREEN}✓ Docker daemon running${NC}"
    fi
fi

# Check for cross
if ! command -v cross &> /dev/null; then
    echo -e "${YELLOW}! cross not found - will install automatically${NC}"
    NEED_CROSS=1
else
    CROSS_VERSION=$(cross --version 2>/dev/null | head -1 | cut -d' ' -f2 || echo "unknown")
    echo -e "${GREEN}✓ cross installed${NC} (v$CROSS_VERSION)"
    NEED_CROSS=0
fi

echo ""

# Exit if missing dependencies
if [ $MISSING_DEPS -eq 1 ]; then
    echo -e "${RED}Please install missing dependencies and try again.${NC}"
    exit 1
fi

# Install cross if needed
if [ "${NEED_CROSS:-0}" -eq 1 ]; then
    echo -e "${YELLOW}Installing 'cross' for cross-compilation...${NC}"
    cargo install cross --git https://github.com/cross-rs/cross
    echo ""
fi

# ============================================
# Build
# ============================================

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

# Use separate target dir for local builds to avoid GLIBC conflicts with cross builds
# Build both tapo-agent and tapo-countdown
CARGO_TARGET_DIR=target-local cargo build --release --bin tapo-agent --bin tapo-countdown -j $(nproc)

# Copy binaries to dist folder
cp "target-local/release/tapo-agent" "dist/tapo-agent-local-${HOST_TARGET}"
cp "target-local/release/tapo-countdown" "dist/tapo-countdown-local-${HOST_TARGET}"

# Get binary sizes
size_agent=$(du -h "dist/tapo-agent-local-${HOST_TARGET}" | cut -f1)
size_cnt=$(du -h "dist/tapo-countdown-local-${HOST_TARGET}" | cut -f1)
echo -e "  → ${GREEN}dist/tapo-agent-local-${HOST_TARGET}${NC} ($size_agent)"
echo -e "  → ${GREEN}dist/tapo-countdown-local-${HOST_TARGET}${NC} ($size_cnt)"
echo ""

# ============================================
# Cross-Compilation Builds
# ============================================

echo -e "${BLUE}Starting cross-compilation builds...${NC}"
echo ""

for target in "${!TARGETS[@]}"; do
    name="${TARGETS[$target]}"
    echo -e "${GREEN}Building for $target ($name)...${NC}"
    
    # Build both binaries
    cross build --release --target "$target" --bin tapo-agent --bin tapo-countdown -j $(nproc)
    
    # Copy binaries to dist folder with descriptive name
    cp "target/$target/release/tapo-agent" "dist/tapo-agent-$name"
    cp "target/$target/release/tapo-countdown" "dist/tapo-countdown-$name"
    
    # Get binary sizes
    size_agent=$(du -h "dist/tapo-agent-$name" | cut -f1)
    size_cnt=$(du -h "dist/tapo-countdown-$name" | cut -f1)
    echo -e "  → ${GREEN}dist/tapo-agent-$name${NC} ($size_agent)"
    echo -e "  → ${GREEN}dist/tapo-countdown-$name${NC} ($size_cnt)"
    echo ""
done

echo "=========================================="
echo -e "${GREEN}Build complete!${NC} Binaries in dist/"
echo "=========================================="
ls -lh dist/

echo ""
echo "To deploy to Raspberry Pi:"
echo -e "  ${YELLOW}scp dist/tapo-agent-pi3_pi4_64bit dist/tapo-countdown-pi3_pi4_64bit pi@raspberrypi:~/${NC}"
echo -e "  ${YELLOW}ssh pi@raspberrypi 'chmod +x ~/tapo-agent-* ~/tapo-countdown-*'${NC}"

echo ""
echo -e "${BLUE}Upload to bashupload.com for web console deploy (3 days, 1 download):${NC}"
echo -e "  ${YELLOW}curl https://bashupload.com -F=@dist/tapo-agent-pi3_pi4_64bit${NC}"
echo -e "  ${YELLOW}curl https://bashupload.com -F=@dist/tapo-countdown-pi3_pi4_64bit${NC}"
echo ""
echo "Then on Pi, download and run:"
echo -e "  ${YELLOW}curl -sSL https://bashupload.com/XXXXX -o tapo-agent && chmod +x tapo-agent${NC}"

echo ""
echo -e "${BLUE}=========================================="
echo "Installing as User Service (no sudo needed)"
echo -e "==========================================${NC}"
echo ""
echo "1. Setup binary and config:"
echo -e "  ${YELLOW}chmod +x ~/tapo-agent${NC}"
echo -e "  ${YELLOW}mkdir -p ~/.config/tapo${NC}"
echo -e "  ${YELLOW}cp /path/to/config.toml ~/.config/tapo/config.toml${NC}"
echo ""
echo "2. Create service file:"
echo -e "  ${YELLOW}mkdir -p ~/.config/systemd/user${NC}"
echo -e "  ${YELLOW}cat > ~/.config/systemd/user/tapo-agent.service << 'EOF'"
echo "[Unit]"
echo "Description=Tapo Smart Plug Agent"
echo "After=network-online.target"
echo ""
echo "[Service]"
echo "Type=simple"
echo "ExecStart=%h/tapo-agent --config %h/.config/tapo/config.toml"
echo "Restart=always"
echo "RestartSec=10"
echo ""
echo "[Install]"
echo "WantedBy=default.target"
echo -e "EOF${NC}"
echo ""
echo "3. Enable and start service:"
echo -e "  ${YELLOW}systemctl --user daemon-reload${NC}"
echo -e "  ${YELLOW}systemctl --user enable tapo-agent${NC}"
echo -e "  ${YELLOW}systemctl --user start tapo-agent${NC}"
echo ""
echo "4. Enable linger (service runs at boot, before login):"
echo -e "  ${YELLOW}loginctl enable-linger \$USER${NC}"
echo ""
echo "5. Manage service:"
echo -e "  ${YELLOW}systemctl --user status tapo-agent${NC}     # Check status"
echo -e "  ${YELLOW}systemctl --user restart tapo-agent${NC}    # Restart"
echo -e "  ${YELLOW}journalctl --user -u tapo-agent -f${NC}     # View logs"
