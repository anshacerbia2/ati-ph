import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node" },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      /*
       * The marker's own no-op, which is what a server context is meant to get.
       *
       * `server-only` ships two files: `empty.js` for the `react-server` condition and
       * an `index.js` that throws for everything else — with a message naming "Client
       * Component", the opposite of what is happening. Vitest resolves neither
       * condition, so importing any of the eighteen modules marked `import
       * "server-only"` failed at collection, and the ones that mattered went untested.
       *
       * Aliased rather than switching the resolver to `react-server` wholesale: that
       * condition also changes how React itself resolves, which is a much larger blast
       * radius than making one marker inert. The marker keeps doing its real job in the
       * bundler either way.
       */
      "server-only": fileURLToPath(
        new URL("./node_modules/server-only/empty.js", import.meta.url),
      ),
    },
  },
});
