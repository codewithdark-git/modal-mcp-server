import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const expectedTools = [
  "modal_check_environment",
  "modal_run_tests",
  "modal_run_training_job",
  "modal_run_function",
  "modal_get_job_status",
  "modal_stream_logs",
  "modal_get_job_result",
  "modal_cancel_job",
  "modal_list_jobs",
];

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [join(root, "dist", "index.js")],
  cwd: root,
  stderr: "pipe",
});

const client = new Client({ name: "modal-mcp-smoke-test", version: "0.1.0" });

try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  const names = tools.map((tool) => tool.name).sort();
  const missing = expectedTools.filter((name) => !names.includes(name));
  if (missing.length > 0) {
    throw new Error(`Missing MCP tools: ${missing.join(", ")}`);
  }

  const doctor = await client.callTool({ name: "modal_check_environment", arguments: {} });
  const text = doctor.content?.find((item) => item.type === "text")?.text ?? "";
  JSON.parse(text);

  console.log(
    JSON.stringify(
      {
        ok: true,
        tool_count: names.length,
        tools: names,
        doctor_call_returned_json: true,
      },
      null,
      2
    )
  );
} finally {
  await client.close();
}
