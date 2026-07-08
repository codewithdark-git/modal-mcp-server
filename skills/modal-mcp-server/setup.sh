#!/usr/bin/env bash
# modal-mcp-server automated setup script
# Usage: ./setup.sh [--global] [--project PATH] [--help]

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Defaults
INSTALL_MODE="global"
PROJECT_PATH=""
SKIP_DOCTOR=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --global)
            INSTALL_MODE="global"
            shift
            ;;
        --project)
            PROJECT_PATH="$2"
            shift 2
            ;;
        --skip-doctor)
            SKIP_DOCTOR=true
            shift
            ;;
        --help)
            echo "Usage: $0 [--global] [--project PATH] [--skip-doctor]"
            echo ""
            echo "Options:"
            echo "  --global         Install globally with npm (default)"
            echo "  --project PATH   Install locally in specified project directory"
            echo "  --skip-doctor    Skip authentication verification"
            echo "  --help           Show this help"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

print_step() {
    echo -e "${BLUE}==>${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Check prerequisites
check_prereqs() {
    print_step "Checking prerequisites..."

    local missing=()

    if ! command -v node &> /dev/null; then
        missing+=("node (>=20)")
    elif [[ $(node --version | sed 's/v//' | cut -d. -f1) -lt 20 ]]; then
        missing+=("node >=20 (current: $(node --version))")
    fi

    if ! command -v npm &> /dev/null; then
        missing+=("npm")
    fi

    if [[ ${#missing[@]} -gt 0 ]]; then
        print_error "Missing prerequisites:"
        for m in "${missing[@]}"; do
            echo "  - $m"
        done
        echo ""
        echo "Please install missing tools and re-run."
        exit 1
    fi

    print_success "Prerequisites OK (node $(node --version), npm $(npm --version))"
}

# Setup environment file
setup_env() {
    print_step "Setting up environment..."

    local env_file=".env"
    local example_file="config/env.example"

    if [[ ! -f "$example_file" ]]; then
        print_warning "Example env file not found at $example_file"
        return
    fi

    if [[ ! -f "$env_file" ]]; then
        cp "$example_file" "$env_file"
        print_success "Created .env from template"
        print_warning "Edit .env with your MODAL_TOKEN_ID and MODAL_TOKEN_SECRET"
    else
        print_success ".env already exists"
    fi
}

# Install globally
install_global() {
    print_step "Installing modal-mcp-server globally..."
    npm install -g modal-mcp-server
    print_success "Global install complete"
    echo "  Command: modal-mcp-server"
    echo "  (Available in PATH after npm global install)"
}

# Install in project
install_project() {
    local target_dir="${PROJECT_PATH:-$(pwd)}"

    print_step "Installing in project: $target_dir"
    cd "$target_dir"

    # Check if package.json exists
    if [[ ! -f "package.json" ]]; then
        print_warning "No package.json found, creating minimal one..."
        cat > package.json << 'EOF'
{
  "name": "my-project",
  "version": "1.0.0",
  "private": true,
  "devDependencies": {}
}
EOF
    fi

    # Install modal-mcp-server as dev dependency
    npm install modal-mcp-server --save-dev
    print_success "Project install complete"
}

# Verify with doctor
verify_doctor() {
    if [[ "$SKIP_DOCTOR" == "true" ]]; then
        print_warning "Skipping doctor check (--skip-doctor)"
        return
    fi

    print_step "Verifying Modal authentication..."

    local cli_cmd="modal-mcp-server"

    if $cli_cmd doctor >/dev/null 2>&1; then
        print_success "Modal authentication OK"
    else
        print_warning "Doctor check failed - check your .env tokens"
        echo "Run: $cli_cmd doctor"
        echo "Or:  source .env && $cli_cmd doctor"
    fi
}

# Print next steps
print_next_steps() {
    local cli_cmd="modal-mcp-server"

    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}Setup complete!${NC}"
    echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo "Next steps:"
    echo ""
    echo "1. ${YELLOW}Add to your agent config:${NC}"
    echo "   See: agents/ for templates"
    echo ""
    echo "2. ${YELLOW}Test with CLI:${NC}"
    echo "   $cli_cmd run-tests -p /path/to/project -c \"python -c 'import torch; print(torch.cuda.is_available())'\" --gpu T4 --wait"
    echo ""
    echo "3. ${YELLOW}Verify MCP tools in agent:${NC}"
    echo "   modal_check_environment → Should return ok: true"
    echo ""
    echo "4. ${YELLOW}Run your first GPU job!${NC}"
    echo ""
    echo "Full docs: https://github.com/codewithdark-git/modal-mcp-server"
    echo "Skill docs: skills/modal-mcp-server/README.md"
    echo ""
}

# Main
main() {
    echo -e "${BLUE}"
    echo "╔═══════════════════════════════════════════════════════════╗"
    echo "║     modal-mcp-server Automated Setup                     ║"
    echo "║     Run GPU Python workloads on Modal.com                ║"
    echo "╚══════════════════════════════════════════════════════════╝"
    echo -e "${NC}"

    check_prereqs

    if [[ "$INSTALL_MODE" == "global" ]]; then
        install_global
    else
        install_project
    fi

    setup_env

    verify_doctor

    print_next_steps
}

main "$@"