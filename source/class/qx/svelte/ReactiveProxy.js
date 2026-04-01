const ObservableSlim = require("observable-slim").default;//!!make this optional dependency
qx.Class.define("qx.svelte.ReactiveProxy", {
  type: "static",
  statics: {
    __SymReactiveProxy: Symbol("qx.svelte.ReactiveProxy.__SymReactiveProxy"),
    get(object) {
      if (object[this.__SymReactiveProxy]) {
        return object[this.__SymReactiveProxy];
      }

      let listener = new qx.svelte.reactivevar.ReactiveVar(object);
      let proxy = ObservableSlim.create(object, changeData => listener.fireDataEvent("changeValue", object, object));
      proxy[this.__SymReactiveProxy] = listener;
      return proxy;
    },
    /**
     * 
     * @param {Object} object 
     * @returns {qx.svelte.reactivevar.ReactiveVar}
     */
    getNotifier(object) {
      return object[this.__SymReactiveProxy];
    },
    is(object) {
      return !!(object?.[this.__SymReactiveProxy]);
    }
  }
});