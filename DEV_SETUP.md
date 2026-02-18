# Development Environment Setup (Nix)

Personal development notes for running the Formula SAE Dashboard with Nix shell.

## Prerequisites

- [Nix package manager](https://nixos.org/download.html)
- Optional: [direnv](https://direnv.net/) for auto-activation

### Install Nix (macOS/Linux)

```bash
sh <(curl -L https://nixos.org/nix/install)
```

### Install direnv (optional)

```bash
# macOS
brew install direnv

# Add to shell (zsh)
echo 'eval "$(direnv hook zsh)"' >> ~/.zshrc
source ~/.zshrc
```

---

## Entering the Development Environment

### Option 1: Manual (nix-shell)

```bash
cd ~/Documents/GitHub/Formula_SAE_Dashboard
nix-shell
```

### Option 2: Automatic (direnv)

```bash
cd ~/Documents/GitHub/Formula_SAE_Dashboard
direnv allow  # Only needed once
# Environment activates automatically on cd
```

---

## Running the Application

### Local Development (without Docker)

**Terminal 1 - Backend:**
```bash
backend
# Or manually:
# cd backend && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Terminal 2 - Frontend:**
```bash
frontend
# Or manually:
# cd frontend && npm run dev
```

**Access:**
- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

### Docker Deployment

```bash
# First time setup - create .env from template
cp .env.example .env
# Edit .env with your values (especially JWT_SECRET)
openssl rand -hex 32  # Generate a secure JWT_SECRET

dcup        # docker compose up --build -d
dcdown      # docker compose down
dclogs      # docker compose logs -f
```

**Access (Docker):**
- Frontend: http://localhost:8080
- Backend API: http://localhost:8000

---

## Environment Variables

Pre-configured defaults for local development:

| Variable | Default | Description |
|----------|---------|-------------|
| `ADMIN_USERNAME` | `admin` | Bootstrap admin account |
| `ADMIN_PASSWORD` | `admin123` | Bootstrap admin password |
| `JWT_SECRET` | `dev-secret-change-in-production` | JWT signing key |
| `LDX_WATCH_DIR` | `./ldx` | LDX file watch directory |
| `VITE_API_URL` | `http://localhost:8000` | Backend URL for frontend |

Override in `.envrc` or export before entering shell:
```bash
export JWT_SECRET="my-secure-secret"
nix-shell
```

---

## Neovim Setup

The shell automatically downloads your config from `rlogger/nvim-config`.

### First Launch

```bash
nvim
# Wait for plugins to auto-install
:checkhealth   # Verify setup
:Mason         # Check LSP servers
```

### Key Bindings

| Key | Action |
|-----|--------|
| `<Space>` | Leader key |
| `<leader>e` | File explorer (Neo-tree) |
| `<leader>sf` | Find files (Telescope) |
| `<leader>sg` | Search in files (grep) |
| `<leader>gg` | LazyGit |
| `gd` | Go to definition |
| `gr` | Find references |
| `K` | Show documentation |
| `<leader>ca` | Code actions |
| `<leader>rn` | Rename symbol |
| `:Lazy` | Plugin manager |
| `:Mason` | LSP server manager |

### Config Location

```
~/.config/nvim-nix-shell/init.lua
```

Config auto-updates if older than 1 day.

---

## Shell Aliases

### Editor
```bash
nvim, vim, vi    # Neovim with custom config
```

### Git
```bash
lg    # lazygit
gs    # git status
gd    # git diff
ga    # git add
gc    # git commit
gp    # git push
gl    # git pull
```

### Project
```bash
backend     # Start FastAPI dev server
frontend    # Start Vite dev server
dc          # docker compose
dcup        # docker compose up --build -d
dcdown      # docker compose down
dclogs      # docker compose logs -f
```

---

## Included Packages

| Package | Version | Purpose |
|---------|---------|---------|
| python | 3.11 | Backend runtime |
| nodejs | 20 | Frontend build |
| neovim | latest | Editor |
| sqlite | latest | Database |
| ripgrep | latest | Fast search (nvim) |
| fd | latest | Fast find (nvim) |
| lazygit | latest | Git TUI |
| jq | latest | JSON processing |
| yq | latest | YAML processing |
| watchexec | latest | File watcher |

Python packages (in nix shell, not venv):
- ipython, black, isort, debugpy, virtualenv

---

## Troubleshooting

### Nix shell is slow to start

First run downloads packages. Subsequent runs use cache.

### Python packages not found

Ensure venv is activated:
```bash
source backend/.venv/bin/activate
pip install -r backend/requirements.txt
```

### Neovim plugins failing

```vim
:Lazy sync      " Update plugins
:Mason          " Reinstall LSP servers
:checkhealth    " Diagnose issues
```

### direnv not activating

```bash
direnv allow    # Authorize .envrc
```

### Port already in use

```bash
# Find and kill process on port 8000
lsof -i :8000
kill -9 <PID>
```

---

## File Structure

```
Formula_SAE_Dashboard/
├── shell.nix          # Nix environment definition
├── .envrc             # direnv configuration
├── DEV_SETUP.md       # This file
├── README.md          # Project documentation
├── docker-compose.yml # Docker deployment
├── backend/
│   ├── .venv/         # Python virtual environment (auto-created)
│   ├── app/           # FastAPI application
│   ├── forms/         # YAML form definitions
│   ├── data/          # SQLite database
│   └── requirements.txt
└── frontend/
    ├── node_modules/  # npm packages (auto-installed)
    ├── src/           # React application
    └── package.json
```

---

## Updating the Nix Environment

Edit `shell.nix` to add/remove packages:

```nix
buildInputs = with pkgs; [
  # Add new packages here
  htop
  tree
];
```

Then re-enter the shell:
```bash
exit
nix-shell
```

---

Start the backend:

   ADMIN_USERNAME=admin ADMIN_PASSWORD=change_this_password_123
   JWT_SECRET=dev-secret .venv/bin/uvicorn app.main:app --reload --host
   0.0.0.0 --port 8000

