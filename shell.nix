{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  buildInputs = with pkgs; [
    # Python development (FastAPI backend)
    python311
    python311Packages.pip
    python311Packages.virtualenv
    python311Packages.ipython
    python311Packages.black
    python311Packages.isort
    python311Packages.debugpy

    # Node.js (React frontend)
    nodejs_20
    nodePackages.npm

    # Database
    sqlite

    # Neovim and editor tools
    neovim
    git
    curl
    gcc
    gnumake
    ripgrep
    fd
    lazygit
    tree
    wget

    # Additional dev tools
    jq        # JSON processing
    yq        # YAML processing (for form configs)
    watchexec # File watcher for development
  ];

  shellHook = ''
    echo "=================================================="
    echo " Formula SAE Dashboard - Development Environment"
    echo "=================================================="

    # ----------------------------------------
    # Python Backend Setup
    # ----------------------------------------
    if [ ! -d backend/.venv ]; then
      echo ""
      echo "Creating Python virtual environment..."
      python -m venv backend/.venv
    fi

    source backend/.venv/bin/activate

    if [ -f backend/requirements.txt ]; then
      echo "Checking Python dependencies..."
      pip install --quiet -r backend/requirements.txt 2>/dev/null || true
    fi

    # ----------------------------------------
    # Node.js Frontend Setup
    # ----------------------------------------
    if [ -d frontend ] && [ ! -d frontend/node_modules ]; then
      echo ""
      echo "Installing frontend dependencies..."
      (cd frontend && npm install --silent) || true
    fi

    # ----------------------------------------
    # Neovim Configuration (from rlogger/nvim-config)
    # ----------------------------------------
    export NVIM_CONFIG_DIR="$HOME/.config/nvim-nix-shell"
    mkdir -p "$NVIM_CONFIG_DIR"

    REPO_URL="https://raw.githubusercontent.com/rlogger/nvim-config/refs/heads/main/init.lua"
    CONFIG_FILE="$NVIM_CONFIG_DIR/init.lua"

    if [ ! -f "$CONFIG_FILE" ] || [ $(find "$CONFIG_FILE" -mtime +1 2>/dev/null | wc -l) -gt 0 ]; then
      echo ""
      echo "Downloading custom Neovim config..."
      if curl -fsSL "$REPO_URL" -o "$CONFIG_FILE"; then
        echo "Config downloaded successfully"
      else
        echo "Failed to download config. Using existing or default config."
      fi
    else
      echo "Using cached Neovim config"
    fi

    # ----------------------------------------
    # Aliases
    # ----------------------------------------
    # Editor aliases
    alias nvim='nvim -u "$NVIM_CONFIG_DIR/init.lua"'
    alias vim='nvim -u "$NVIM_CONFIG_DIR/init.lua"'
    alias vi='nvim -u "$NVIM_CONFIG_DIR/init.lua"'

    # Python aliases
    alias python='python3'
    alias pip='pip3'

    # Git aliases
    alias lg='lazygit'
    alias gs='git status'
    alias gd='git diff'
    alias ga='git add'
    alias gc='git commit'
    alias gp='git push'
    alias gl='git pull'

    # Project-specific aliases
    alias backend='cd backend && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000'
    alias frontend='cd frontend && npm run dev'
    alias dc='docker compose'
    alias dcup='docker compose up --build -d'
    alias dcdown='docker compose down'
    alias dclogs='docker compose logs -f'

    # ----------------------------------------
    # Environment Variables
    # ----------------------------------------
    export XDG_CONFIG_HOME="''${XDG_CONFIG_HOME:-$HOME/.config}"
    export XDG_DATA_HOME="''${XDG_DATA_HOME:-$HOME/.local/share}"
    export XDG_CACHE_HOME="''${XDG_CACHE_HOME:-$HOME/.cache}"

    mkdir -p "$XDG_DATA_HOME/nvim/site/pack"
    mkdir -p "$XDG_CACHE_HOME/nvim"

    export PYTHON_PATH="$(which python3)"

    # Backend environment defaults (for local dev)
    export ADMIN_USERNAME="''${ADMIN_USERNAME:-admin}"
    export ADMIN_PASSWORD="''${ADMIN_PASSWORD:-admin123}"
    export JWT_SECRET="''${JWT_SECRET:-dev-secret-change-in-production}"
    export LDX_WATCH_DIR="''${LDX_WATCH_DIR:-./ldx}"

    # Frontend environment
    export VITE_API_URL="''${VITE_API_URL:-http://localhost:8000}"

    # ----------------------------------------
    # Help Output
    # ----------------------------------------
    echo ""
    echo " Project Structure:"
    echo "   backend/   - FastAPI + SQLModel + SQLite"
    echo "   frontend/  - React + Vite + TypeScript"
    echo ""
    echo " Quick Start:"
    echo "   backend       - Start FastAPI dev server (port 8000)"
    echo "   frontend      - Start Vite dev server (port 5173)"
    echo "   dcup          - Start all services via Docker"
    echo ""
    echo " Editor:"
    echo "   nvim          - Launch Neovim with custom config"
    echo "   lg            - Launch LazyGit"
    echo ""
    echo " Neovim Keys:"
    echo "   <Space>       - Leader key"
    echo "   <leader>e     - File explorer"
    echo "   <leader>sf    - Find files"
    echo "   <leader>sg    - Search in files"
    echo "   <leader>gg    - LazyGit"
    echo "   gd            - Go to definition"
    echo "   K             - Show documentation"
    echo ""
    echo " Environment:"
    echo "   Python venv:  backend/.venv (activated)"
    echo "   Nvim config:  $NVIM_CONFIG_DIR/init.lua"
    echo "=================================================="
    echo ""

    # Custom prompt
    export PS1="\[\e[1;36m\][fsae-dev]\[\e[0m\] \[\e[1;33m\]\w\[\e[0m\] $ "
  '';
}
