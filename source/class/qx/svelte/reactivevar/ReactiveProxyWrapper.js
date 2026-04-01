qx.Class.define("qx.svelte.reactivevar.ReactiveProxyWrapper", {
  extend: qx.svelte.reactivevar.ReactiveVar,
  destruct() {
    if (this.__binding) {
      this.__binding.dispose();
      this.__binding = null;
    }
  },
  members: {
    __binding: null,
    /** @override */
    _applyValue(value, oldValue) {
      const ReactiveProxy = qx.svelte.ReactiveProxy;
      super._applyValue(value, oldValue);      

      if (value) {
        if (qx.core.Environment.get("qx.debug")) {
          if (!ReactiveProxy.is(value)) {
            throw new Error("Value must be a ReactiveProxy");
          }
        }
        this.__binding = ReactiveProxy.getNotifier(value).bind("value", this, "value");
      }
      if (oldValue) {
        this.__binding.dispose();
        this.__binding = null;
      }
    }
  }
});