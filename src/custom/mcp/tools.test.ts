import { vi } from "vitest";

// The tools import modules that read Worker bindings; none is used here.
vi.mock("cloudflare:workers", () => ({ env: {} }));

import { describe, expect, it } from "vitest";
import { customMcpTools } from "@/custom/mcp/tools";

describe("custom MCP tools", () => {
  it("have unique names and always ask for a project", () => {
    const names = customMcpTools.map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
    for (const tool of customMcpTools) {
      expect(tool.config.inputSchema).toHaveProperty("projectId");
    }
  });

  it("mark only the reading tools as read only, and deletion as destructive", () => {
    const byName = new Map(customMcpTools.map((tool) => [tool.name, tool]));
    expect(byName.get("radar_overview")?.config.annotations.readOnlyHint).toBe(
      true,
    );
    expect(
      byName.get("reporting_create")?.config.annotations.readOnlyHint,
    ).toBe(false);
    expect(
      byName.get("reporting_delete")?.config.annotations.destructiveHint,
    ).toBe(true);
  });
});
