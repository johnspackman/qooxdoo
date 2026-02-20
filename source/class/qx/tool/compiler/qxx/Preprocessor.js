qx.Class.define("qx.tool.compiler.qxx.Preprocessor", {
  extend: qx.core.Object,
  implement: qx.tool.compiler.ISourceTransformer,
  members: {
    /**@override */
    init() {
      //nothing
    },
    /**@override */
    shouldTransform(sourceInfo) {
      return true;
    },

    /**@override */
    transform(sourceInfo) {
      let source = sourceInfo.source;
      const IDENTIFIER = "[A-Za-z_][A-Za-z_0-9]*";
      const MEMBER_CHAIN = `${IDENTIFIER}(.${IDENTIFIER})*`
      const START = String.raw`(?<=\{\s*)#foreach\s+(?<var>${IDENTIFIER})\sof\s(?<array>${MEMBER_CHAIN})\s*(\((?<key>.+)\))?\s*\}`;
      let rgxEnd = /\{\/foreach\s*(?=\})/g;

      let rgxStart = new RegExp(START, "g");
      const startReplacer = (...args) => {
        let groups = args[args.length - 1];
        return `$foreach(${groups.array}, ${groups.var}, ${groups.key ?? groups.var}, <>`;
      }
      let out = source.replace(rgxStart, startReplacer).replace(rgxEnd, "</>)");
      return out;
    }
  }
});