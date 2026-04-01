/**
 * A ReactiveVar which derives its value from other ReactiveVars using a generator function.
 * Note: Currently, only at most one Derived ReactiveVar can listen to another ReactiveVar
 */
qx.Class.define("qx.svelte.reactivevar.Derived", {
  extend: qx.svelte.reactivevar.ReactiveVar,
  /**
   * @param {Function} generator The function which returns the output value based on the input values. It must meet the following requirements:
   * - It must call the get() method (not getValue()) of any ReactiveVar which it depends on, in order for the dependencies to be tracked correctly.$$allowconstruct
   * - The `get()` methods must always be called, i.e. not conditionally.
   */
  construct(generator) {
    super();
    this.__generator = generator;
    let sources = (this.__sources = []);
    const ReactiveVar = qx.svelte.reactivevar.ReactiveVar;
    ReactiveVar.setOnGetCallback(source => sources.push(source));
    let initialValue = generator();
    ReactiveVar.setOnGetCallback(null);
    this.setValue(initialValue);
    sources.forEach(source => {
      if (qx.core.Environment.get("qx.debug")) {
        if (source._isInDerived) {
          throw new Error("A ReactiveVar cannot be used in multiple Derived ReactiveVars");
        }
      }
      source._isInDerived = true;
      source.addListener("changeValue", this.__update, this)
    });  
  },
  destruct() {
    this.__sources.forEach(source => source.dispose());
  },
  members: {
    /**
     * @type {Function}
     */
    __generator: null,
    /**
     * @type {qx.svelte.reactivevar.IReactiveVar[]}
     */
    __sources: null,

    __update() {
      this.setValue(this.__generator());
    }
  }
});