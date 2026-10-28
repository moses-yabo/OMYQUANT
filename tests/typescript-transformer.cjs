const ts = require("typescript");
module.exports = {
  process(source, filename, options) {
    const result = ts.transpileModule(source, {
      fileName: filename,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: options.supportsStaticESM
          ? ts.ModuleKind.ESNext
          : ts.ModuleKind.CommonJS,
        sourceMap: true,
        inlineSources: true,
      },
    });
    return { code: result.outputText, map: result.sourceMapText };
  },
};
