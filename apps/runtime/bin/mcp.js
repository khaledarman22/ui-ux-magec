#!/usr/bin/env node
// MCP stdio entry point. The project directory is MAGEC_PROJECT_DIR or the current working directory.
import { MagecRuntime, McpServer } from '../dist/index.js';

const rt = await MagecRuntime.create({ projectDir: process.env.MAGEC_PROJECT_DIR || process.cwd(), platform: process.env.MAGEC_PLATFORM || 'mcp-host' });
const server = new McpServer(rt);
await server.serve();
await rt.close();
process.exit(0);
