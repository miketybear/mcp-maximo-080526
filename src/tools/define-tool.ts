import type { CallToolResult, McpServer, ToolAnnotations } from "@modelcontextprotocol/server";
import { z } from "zod";

/**
 * Declarative definition of a Maximo tool (read-only unless `annotations` says otherwise).
 *
 * `run` returns any JSON-serialisable value; the wrapper formats it as text
 * content and turns thrown errors into `isError` results prefixed with
 * `errorLabel` — so individual tools never repeat that boilerplate.
 *
 * Tools declare their input as a Zod raw shape (shared with the
 * maximo-client input types); it is wrapped in `z.object()` here, as SDK v2
 * expects a Standard Schema object.
 */
export interface ToolDefinition<S extends z.ZodRawShape> {
  name: string;
  description: string;
  inputSchema: S;
  /** Defaults to `{ readOnlyHint: true }`; override for tools that write to Maximo. */
  annotations?: ToolAnnotations;
  /** Prefix for error messages, e.g. "Error searching work orders". */
  errorLabel: string | ((args: z.infer<z.ZodObject<S>>) => string);
  run: (args: z.infer<z.ZodObject<S>>) => Promise<unknown>;
}

export interface Tool {
  name: string;
  register: (server: McpServer) => void;
}

export function defineTool<S extends z.ZodRawShape>(def: ToolDefinition<S>): Tool {
  const inputSchema = z.object(def.inputSchema);

  const handler = async (args: z.infer<typeof inputSchema>): Promise<CallToolResult> => {
    try {
      const result = await def.run(args);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      const label = typeof def.errorLabel === "function" ? def.errorLabel(args) : def.errorLabel;
      const message = e instanceof Error ? e.message : String(e);
      return { isError: true, content: [{ type: "text", text: `${label}: ${message}` }] };
    }
  };

  return {
    name: def.name,
    register(server) {
      server.registerTool(
        def.name,
        {
          description: def.description,
          inputSchema,
          annotations: def.annotations ?? { readOnlyHint: true },
        },
        handler,
      );
    },
  };
}
