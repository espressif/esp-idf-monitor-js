import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import terser from "@rollup/plugin-terser";

/**
 * @type {import('rollup').RollupOptions}
 */
const config = {
  input: "lib/index.js",
  output: {
    name: "espIdfMonitor",
    file: "bundle.js",
    format: "es",
  },
  plugins: [resolve({ preferBuiltins: false }), commonjs(), terser()],
};

export default config;
