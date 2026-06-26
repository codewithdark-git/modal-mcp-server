# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-06-26

### 🚀 Major Changes

**Complete migration from Python to Node.js Modal SDK**

This is a **major version bump** due to breaking changes in the architecture and dependencies.

### ✅ Added

- **Modal Node.js SDK Integration**: Added `modal@^0.7.2` dependency for direct Node.js access to Modal API
- **New Modal Service**: Created `src/services/modal.ts` with comprehensive Modal SDK integration:
  - Singleton client management
  - Authentication verification
  - App and image creation
  - File upload with exclude patterns support
  - Package installation
  - Command execution in sandboxes
  - Concurrent file uploads with rate limiting
- **File Upload**: Implemented using `sandbox.filesystem.copyFromLocal()` with proper pattern matching
- **Type Safety**: Full TypeScript support for all Modal SDK calls

### 🔄 Changed

- **Architecture**: Migrated from Node.js → Python subprocess → Modal API to Node.js → Modal Node.js SDK → Modal API
- **Build Process**: Simplified, no longer copies Python files to dist/
- **Authentication**: Now uses Modal Node.js SDK authentication (same tokens as Python SDK)
- **Doctor Command**: Checks Node.js SDK authentication instead of Python environment
- **Job Execution**: Direct Modal SDK calls instead of Python bridge
- **README.md**: Complete rewrite for Node.js-only setup

### 🗑️ Removed

- **Python Dependency**: No longer requires Python 3.9+ on client machines
- **Python Bridge**: Removed `src/python/modal_runner.py` bridge script
- **Python Service**: Removed `src/services/python.ts` Python detection service
- **Configuration**: Removed `MODAL_MCP_PYTHON` environment variable requirement

### 🔧 Migration Guide

#### For Existing Users

1. **Update the package**:
   ```bash
   npm update -g modal-mcp-server
   ```

2. **Remove Python dependencies** (optional):
   ```bash
   pip uninstall modal
   ```

3. **Update configuration**: Remove `MODAL_MCP_PYTHON` environment variable if set

4. **Verify installation**:
   ```bash
   modal-mcp-server doctor
   ```

#### For New Users

1. **Install**:
   ```bash
   npm install -g modal-mcp-server
   ```

2. **Authenticate**: Set environment variables:
   ```bash
   export MODAL_TOKEN_ID=ak-your-token-id
   export MODAL_TOKEN_SECRET=as-your-token-secret
   ```

3. **Verify**:
   ```bash
   modal-mcp-server doctor
   ```

### 📋 API Changes

All MCP tool interfaces remain the same. The only changes are internal:
- Authentication now uses Modal Node.js SDK
- File upload uses Modal Node.js SDK filesystem API
- Job execution uses Modal Node.js SDK sandbox API

### 🎯 Benefits

1. **Simplified Setup**: Only Node.js 20+ required (no Python)
2. **Better Performance**: No subprocess overhead
3. **Better Type Safety**: Full TypeScript support from Modal SDK
4. **Modern Architecture**: Uses Modal's official Node.js SDK
5. **Future-Proof**: Aligns with Modal's development direction
6. **Simpler Deployment**: Single runtime dependency
7. **Better Error Handling**: Direct exceptions instead of JSON error messages

## [0.2.0] - 2025-06-XX

### ✅ Initial Release

- Hybrid Node.js + Python architecture
- MCP server with Modal GPU support
- Python bridge for Modal SDK calls
- Support for tests, training jobs, and function execution
- File upload with exclude patterns
- GPU selection and timeout configuration

### 📦 Dependencies

- Node.js 20+
- Python 3.9+
- Modal Python package (`python -m pip install modal`)

### 🔧 Setup

Required `modal setup` or `MODAL_TOKEN_ID`/`MODAL_TOKEN_SECRET` environment variables along with `MODAL_MCP_PYTHON` for Python launcher specification.
