# Issue Report: modal-mcp-setup Skill & modal-mcp-server Problems

## Summary

This document details the issues encountered when using the `modal-mcp-setup` skill (in `D:\CodeBackground\PLDM\.opencode\skills\modal-mcp-setup`) to set up and test `modal-mcp-server` v1.0.0 (npm package `modal-mcp-server`) with the PLDM project on Windows.

---

## 1. Skill Documentation vs. Reality Mismatch

### Issue: Skill Claims Direct CLI Usage, But Server Is MCP-Only

**Skill says (Step 6 - Sanity-check):**
> "Ask the agent (in its own chat) to call `modal_check_environment`, or run a trivial test job, e.g. ... via `modal_run_tests`."

**Reality:** 
- `modal-mcp-server` is **only an MCP server** — it exposes tools via the Model Context Protocol (stdio/JSON-RPC)
- There is **no CLI subcommand** like `modal-mcp-server run_tests`, `modal-mcp-server run_training_job`, etc.
- The skill incorrectly documents these as direct CLI commands
- Users cannot run tests from terminal without an MCP client (Claude Desktop, Cursor, Codex, etc.)

**Impact:** Users following the skill exactly will fail at Step 6 because the documented commands don't exist.

---

## 2. Windows Path Handling in ESM Imports (Breaking)

### Issue: `file://` URLs Required on Windows for ESM

When trying to import the server's internal modules directly (bypassing MCP):
```javascript
import { executeModalJob } from "modal-mcp-server/dist/services/modal.js";
```

**Error:**
```
Error [ERR_UNSUPPORTED_ESM_URL_SCHEME]: Only URLs with a scheme in: file, data, and node are supported. 
On Windows, absolute paths must be valid file:// URLs. Received protocol 'c:'
```

**Root Cause:** Node.js ESM loader on Windows requires `file://` protocol for absolute paths. The skill doesn't document this.

**Workaround Required:**
```javascript
import { pathToFileURL } from "node:url";
const modalServicePath = pathToFileURL("C:/Users/.../modal-mcp-server/dist/services/modal.js").href;
const { executeModalJob } = await import(modalServicePath);
```

---

## 3. Upload Performance & Timeout Issues

### Issue: Large Project Uploads Are Extremely Slow & Silent

**Observed:** 
- 4,157 files (65.5 MB) uploaded
- Upload took >10 minutes (timed out at 600s)
- **Zero progress feedback** during upload — only "Uploading X files..." then silence until complete or timeout

**Code Analysis (`dist/services/modal.js:145-177`):**
```javascript
// Uploads files in batches of 10 concurrently
const CONCURRENCY_LIMIT = 10;
// But NO progress callback, NO streaming logs, NO periodic updates
await Promise.all(uploadPromises);  // Blocks until ALL done
console.log(`[modal] Upload complete: ${files.length} files uploaded`);  // Only at END
```

**Problems:**
1. **No progress streaming** — user sees nothing for minutes
2. **No cancellation** — can't abort a stuck upload
3. **No resume** — failure = restart from zero
4. **Sequential directory walking** before upload starts (`collectFiles` walks entire tree first)
5. **Hardcoded concurrency limit (10)** — not tunable

---

## 4. No Streaming Logs / Real-time Feedback

### Issue: Tool Results Only Return After Full Completion

**Current behavior (`dist/tools/run-tests.js:16-28`):**
```javascript
const started = await startModalJob(toConfig(input));
if (!input.wait) return jobStartedResponse(started.job);
const completed = await waitForJob(started);  // BLOCKS until done
return jobResultResponse(toResult(completed));
```

**Problems:**
- `wait: true` (default) = **blocks entire MCP call** until job finishes (could be hours)
- `wait: false` = returns job ID, but **no way to stream logs** in real-time
- `modal_stream_logs` tool exists but **only returns buffered logs after the fact**, not a live stream
- User has no visibility into: pip install progress, test execution, GPU utilization, etc.

---

## 5. Missing CLI Entry Points for Direct Usage

### Issue: Server Binary Only Starts MCP stdio Server

**Current `dist/index.js:10-38`:**
```javascript
if (process.argv[2] === "doctor") { ... }  // ONLY subcommand
// Otherwise: starts MCP server on stdio
const server = new McpServer({...});
const transport = new StdioServerTransport();
await server.connect(transport);
```

**Missing CLI commands that would be useful:**
- `modal-mcp-server run-tests --project-path ... --command ... --gpu T4 --wait`
- `modal-mcp-server run-function --project-path ... --script benchmark.py`
- `modal-mcp-server list-jobs`
- `modal-mcp-server cancel-job --job-id ...`
- `modal-mcp-server logs --job-id ... --follow`

**Impact:** Cannot use in CI/CD, scripts, or terminal without MCP client.

---

## 6. Skill Does Not Document MCP Client Configuration Properly

### Issue: Skill Mentions Config But Not How to Actually Test

**Skill Step 5 says:** "Register the MCP server with the agent" and shows JSON config.

**But:** 
- No guidance on **how to invoke tools** after config
- No example of what the agent should actually do
- No mention that you need to **restart the agent** after config change
- No troubleshooting for "agent doesn't show modal tools"

---

## 7. Default Exclude Patterns May Be Too Aggressive / Not Documented

### Issue: Hardcoded Excludes Not Visible to User

**Code (`dist/services/modal.js`):**
```javascript
excludePatterns: [...DEFAULT_EXCLUDE_PATTERNS, ...input.exclude_patterns],
```

**But `DEFAULT_EXCLUDE_PATTERNS` is not exported/documented** — user can't see what's being excluded by default.

**Also:** The exclude pattern matching logic (`shouldExcludeFile`) has limitations:
- No support for `**` recursive glob in middle of path (only at end)
- No support for `?` single-char wildcard
- No support for `[abc]` character classes
- Case-sensitive on Windows (where filesystem is case-insensitive)

---

## 8. No Retry / Resilience for Transient Failures

### Issue: Network Blips = Complete Job Failure

**Observed in `executeModalJob`:**
- Sandbox creation: no retry
- File upload: no retry on individual file failure
- pip install: no retry on transient network error
- Command execution: no retry

**Result:** Any transient Modal API blip, network hiccup, or rate limit = job marked "failed" with no automatic recovery.

---

## 9. Windows-Specific: PowerShell Wrapper Issues

### Issue: `modal-mcp-server.ps1` Wrapper Has Problems

**File:** `C:\Users\codew\AppData\Roaming\npm\modal-mcp-server.ps1`

**Problems:**
1. Hardcodes path to `node_modules/modal-mcp-server/dist/index.js` — breaks if npm prefix changes
2. Doesn't handle `npm link` or local development builds
3. No `--version` or `--help` passthrough
4. PowerShell-only — doesn't work in CMD, Git Bash, WSL

---

## 10. Python Version Hardcoded in Some Places

### Issue: `python:3.11-slim` Hardcoded in Image Creation

**Code (`dist/services/modal.js:53-57`):**
```javascript
export async function createPythonImage(pythonVersion) {
    const modal = getModalClient();
    return modal.images.fromRegistry(`python:${pythonVersion}-slim`);
}
```

**But:** The `pythonVersion` parameter comes from config (default `3.11`). If user's project requires 3.9 or 3.12, they must specify it. The skill doesn't emphasize this.

---

## 11. No Project Size Estimation Before Upload

### Issue: User Discovers Size Limit Only After Walking Entire Tree

**Current flow:**
1. Walk entire project directory (slow for large projects)
2. Calculate total size
3. If > maxUploadMb → **throw error** (after all the walking)

**Better:** Quick estimate first, or stream upload with running total and abort early.

---

## 12. Skill Claims "Tests Run Fine on CPU" But Server Forces GPU

### Issue: Contradiction Between Skill and Server Behavior

**Skill (AGENTS.md:53):** "Tests run fine on CPU; no GPU required."

**Server (`dist/schemas/inputs.js:25`):** `gpu: GpuSchema.optional()` — but sandbox creation **requires GPU** (`dist/services/modal.js:244-245`):
```javascript
sandbox = await modal.sandboxes.create(app, image, {
    gpu: config.gpu,  // Required by Modal sandbox API
    ...
});
```

**Result:** Even CPU-only tests consume GPU quota on Modal.

---

## 13. No Way to Use Existing Modal Volumes / Caches

### Issue: Every Run Starts Fresh — No Dependency Caching

**Impact:** 
- `pip install -e .` runs every time (slow)
- No way to mount a Modal Volume with pre-built wheels
- No way to cache `~/.cache/pip` between runs
- Wastes time and Modal compute credits

---

## 14. Error Messages Lack Context

### Issue: Generic "Modal job failed" Without Actionable Details

**Code (`dist/services/modal.js:283-286`):**
```javascript
catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    throw new Error(`Modal job failed: ${errorMessage}`);
}
```

**Problems:**
- Loses original error stack trace
- No error codes / categories (auth, quota, network, user-code, etc.)
- No suggestion for remediation

---

## 15. Skill References Non-existent Files

### Issue: Skill Mentions `references/agent-configs.md` But It's Not In Skill Dir

**Skill says:** "See `references/agent-configs.md` for exact file paths and full snippets"

**Reality:** File doesn't exist in `.opencode/skills/modal-mcp-setup/references/`

---

## Summary Table

| # | Category | Severity | Blocks Testing? |
|---|----------|----------|-----------------|
| 1 | Doc vs Reality | Critical | Yes |
| 2 | Windows ESM | Critical | Yes (direct usage) |
| 3 | Upload Performance | High | Yes (large projects) |
| 4 | No Streaming Logs | High | Yes (long jobs) |
| 5 | Missing CLI | Medium | For CI/automation |
| 6 | Incomplete Skill Config | Medium | For new users |
| 7 | Exclude Patterns | Medium | Potential missing files |
| 8 | No Retry | Medium | Flaky failures |
| 9 | PowerShell Wrapper | Low | Windows-only |
| 10 | Python Version | Low | If not 3.11 |
| 11 | Size Estimation | Low | UX |
| 12 | CPU vs GPU | Low | Cost |
| 13 | No Volume Cache | Medium | Speed/Cost |
| 14 | Error Context | Medium | Debugging |
| 15 | Missing Reference | Low | Config help |

---

## Recommended Fixes (Priority Order)

### For modal-mcp-server (upstream):

1. **Add CLI subcommands** (`run-tests`, `run-function`, `list-jobs`, `cancel-job`, `logs`) alongside MCP server mode
2. **Implement streaming progress** for upload (WebSocket / SSE / periodic stdout)
3. **Add retry with backoff** for all Modal API calls
4. **Export `DEFAULT_EXCLUDE_PATTERNS`** and document exclude pattern syntax
5. **Support `gpu: "none"` / CPU-only** for tests that don't need GPU
6. **Add volume/mount support** for caching
7. **Improve error types** with codes and remediation hints
8. **Support `--help`, `--version`** in binary

### For modal-mcp-setup skill:

1. **Remove false CLI commands** from Step 6 — clarify MCP-only usage
2. **Add Windows ESM import workaround** documentation
3. **Document actual MCP tool invocation** (what to type in agent chat)
4. **Add troubleshooting section** for "agent doesn't show tools"
5. **Fix/remove reference** to non-existent `references/agent-configs.md`
6. **Note GPU requirement** even for CPU-capable tests
7. **Add example** of minimal agent config + first tool call

---

## Environment Details

- **OS:** Windows 10/11 (PowerShell 5.1)
- **Node.js:** v26.1.0
- **modal-mcp-server:** v1.0.0 (npm global install)
- **Test command:** `python -m pldm.testing.test_modules`
- **Modal auth:** Working (`modal-mcp-server doctor` → `{ "ok": true, "errors": [] }`)

---
