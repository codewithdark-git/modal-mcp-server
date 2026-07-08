# modal-mcp-server Quickstart

> Get running in 3 minutes

---

## 1. Prerequisites (30 sec)

```bash
node --version    # v20+
npm --version     # 10+
```

**Need Modal account?** → [modal.com](https://modal.com) → Get API tokens (Token ID + Secret)

---

## 2. Install (1 min)

### Recommended: Global Install

```bash
npm install -g modal-mcp-server
```

### Alternative: Project-Local (for teams)

```bash
npm install modal-mcp-server --save-dev
# Then use: npx modal-mcp-server
```

---

## 3. Configure Modal Tokens (30 sec)

Get tokens from [modal.com/tokens](https://modal.com/tokens):

```bash
# Unix/macOS
export MODAL_TOKEN_ID=ak-xxxxxxxx
export MODAL_TOKEN_SECRET=as-xxxxxxxxxxxxxxxxxxxxxxxx

# Windows PowerShell
$env:MODAL_TOKEN_ID="ak-xxxxxxxx"
$env:MODAL_TOKEN_SECRET="as-xxxxxxxxxxxxxxxxxxxxxxxx"

# Or create ~/.modal.toml:
# [modal]
# token_id = "ak-xxxxxxxx"
# token_secret = "as-xxxxxxxxxxxxxxxxxxxxxxxx"
```

---

## 4. Add to Your Agent (1 min)

### Global Install (simplest)

```json
{
  "mcpServers": {
    "modal": {
      "command": "modal-mcp-server",
      "env": {
        "MODAL_TOKEN_ID": "ak-xxxxxxxx",
        "MODAL_TOKEN_SECRET": "as-xxxxxxxxxxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

### Project-Local (npx)

```json
{
  "mcpServers": {
    "modal": {
      "command": "npx",
      "args": ["modal-mcp-server"],
      "env": {
        "MODAL_TOKEN_ID": "ak-xxxxxxxx",
        "MODAL_TOKEN_SECRET": "as-xxxxxxxxxxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

| Agent | Config File |
|-------|-------------|
| **Claude Desktop** | `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) |
| **Claude Code** | Run: `claude mcp add modal modal-mcp-server -e MODAL_TOKEN_ID=... -e MODAL_TOKEN_SECRET=...` |
| **Codex** | `~/.codex/config.toml` |
| **Cursor** | `.cursor/mcp.json` or `~/.cursor/mcp.json` |

**Restart your agent after editing.**

---

## 5. Test (30 sec)

```bash
# CLI test
modal-mcp-server doctor
# → {"ok":true,"errors":[]}

# In your agent, run:
modal_check_environment
# → Should return: {"ok": true, ...}
```

---

## 6. Run Your First GPU Job! (1 min)

### Test GPU Works

```bash
modal-mcp-server run-tests -p /tmp -c "python -c 'import torch; print(torch.__version__); print(\"CUDA:\", torch.cuda.is_available())'" --gpu T4 --wait -e torch
```

### Run Real Training

```bash
mkdir -p my-training && cd my-training

cat > train.py << 'EOF'
import torch, torch.nn as nn, torch.optim as optim
from torchvision import datasets, transforms
from torch.utils.data import DataLoader

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"Device: {device}")

model = nn.Linear(784, 10).to(device)
opt = optim.Adam(model.parameters())
loss_fn = nn.CrossEntropyLoss()

data = datasets.MNIST('./data', download=True, transform=transforms.ToTensor())
loader = DataLoader(data, batch_size=64, shuffle=True)

for epoch in range(2):
    for x, y in loader:
        x, y = x.view(-1, 784).to(device), y.to(device)
        opt.zero_grad()
        loss = loss_fn(model(x), y)
        loss.backward()
        opt.step()
    print(f"Epoch {epoch+1}: loss={loss.item():.4f}")
print("Done!")
EOF

cat > requirements.txt << 'EOF'
torch==2.3.0
torchvision==0.18.0
EOF

# Run!
modal-mcp-server run-training -p "$(pwd)" -c "python train.py" --gpu T4 --wait -r requirements.txt
```

**Expected output:** Training runs on GPU, shows `Device: cuda`, completes in ~2 min with loss decreasing.

---

## 7. Next Steps

| Task | Command |
|------|---------|
| Run tests | `modal_run_tests` or `run-tests` CLI |
| Run script | `modal_run_function` or `run-function` CLI |
| Long training (background) | `modal_run_training_job` with `wait=false` |
| Stream logs | `modal_stream_logs` with `follow=true` |
| Check status | `modal_get_job_status` |
| Get results | `modal_get_job_result` |
| Cancel job | `modal_cancel_job` |
| List all jobs | `modal_list_jobs` |

---

## 📖 Full Documentation

- **Complete Guide:** `skills/modal-mcp-server/README.md`
- **Troubleshooting:** `skills/modal-mcp-server/README.md#troubleshooting`
- **Advanced Config:** `skills/modal-mcp-server/README.md#advanced-configuration`
- **Security:** `skills/modal-mcp-server/README.md#security`

---

## ❌ Common Issues

| Problem | Fix |
|---------|-----|
| `{"ok":false}` from doctor | Check `.env` tokens, run `modal token new` |
| `ModuleNotFoundError: torch` | Add `-e torch` or `-r requirements.txt` |
| Upload too large | Increase `max_upload_mb` or add `--exclude-patterns` |
| GPU quota exceeded | Request quota at modal.com or use smaller GPU |
| Windows ESM errors | Upgrade Node to 22+ or use `npx modal-mcp-server` |

---

**Done! 🎉** You're now running GPU workloads on Modal from your AI agent.