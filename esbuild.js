const esbuild = require("esbuild");

const buildOptions = {
  entryPoints: ["src/index.ts"],
  bundle: true,
  sourcemap: true,
  platform: "node",
  outfile: "index.js",
};

esbuild.build(buildOptions).catch(() => process.exit(1));
