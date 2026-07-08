# Publishing

This file is for maintainers. End-user setup lives in `README.md`.

## Before Publishing

```bash
c
npm run build
npm test
npm run smoke:mcp
npm pack --dry-run
```

## Publish Public Package

```bash
npm login
npm publish --access public
```

Notes for maintainers when 2FA or automation tokens are required:

- If your account has 2FA enabled, provide an OTP during publish:

```bash
npm publish --access public --otp 123456
```

- To publish from CI, set an npm automation token with publish rights. Save the token without curly braces and then publish:

```bash
npm config set //registry.npmjs.org/:_authToken "npm_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
npm publish --access public
```

- If you need a token that bypasses 2FA for automation, create an "Automation" token in your npm account with the appropriate permissions.

If `modal-mcp-server` is unavailable on npm, publish under a scope:

```json
{
  "name": "@alphatechlogics/modal-mcp-server"
}
```

Users then install:

```bash
npm install -g @alphatechlogics/modal-mcp-server
```
