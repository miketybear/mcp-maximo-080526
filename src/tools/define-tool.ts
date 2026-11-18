import type { McpServer, ToolAnnotations } from "@modelcontextprotocol/server";
import { z } from "zod";

/**
 * Declarative definition of a Maximo tool (read-only unless `annotations` says otherwise).
 *
 * `run` returns any JSON-serialisable value; the wrapper formats it as text
 * content and turns thrown errors into `isError` results prefixed with
 * `errorLabel` — so individual tools never repeat that boilerplate.
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
  return {
    name: def.name,
    register(server) {
      const handler = async (args: z.infer<z.ZodObject<S>>) => {
        try {
          const result = await def.run(args);
          return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
        } catch (e) {
          const label = typeof def.errorLabel === "function" ? def.errorLabel(args) : def.errorLabel;
          const message = e instanceof Error ? e.message : String(e);
          return { isError: true, content: [{ type: "text" as const, text: `${label}: ${message}` }] };
        }
      };
      server.registerTool(
        def.name,
        {
          description: def.description,
          // SDK v2 expects a Standard Schema object; tools keep declaring raw
          // shapes (shared with maximo-client types) and are wrapped here once.
          inputSchema: z.object(def.inputSchema),
          annotations: def.annotations ?? { readOnlyHint: true },
        },
        // The SDK's generic callback type can't be inferred through our own
        // generic parameter; the shape is identical, so the cast is safe.
        handler as never,
      );
    },
  };
}
