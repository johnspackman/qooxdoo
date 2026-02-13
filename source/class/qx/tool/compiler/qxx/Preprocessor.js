qx.Class.define("qx.tool.compiler.qxx.Preprocessor", {
  type: "static",
  statics: {
    preprocess(source) {
      const IDENTIFIER = "[A-Za-z_][A-Za-z_0-9]*";
      const MEMBER_CHAIN = `${IDENTIFIER}(.${IDENTIFIER})*`
      const START = String.raw`(?<=\{\s*)#foreach\s+(?<var>${IDENTIFIER})\sin\s(?<array>${MEMBER_CHAIN})\s*(\((?<key>.+)\))?\s*\}`;
      let rgxEnd = /\{\/foreach\s*(?=\})/g;

      let rgxStart = new RegExp(START, "g");
      const startReplacer = (...args) => {
        let groups = args[args.length - 1];
        return `$foreach(${groups.var}, ${groups.array}, ${groups.key ?? null}, <>`;
      }
      let out = source.replace(rgxStart, startReplacer).replace(rgxEnd, "</>)");
      return out;
    }
  }
});