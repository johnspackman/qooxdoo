/**
 * A ReactiveVar which derives its value from other ReactiveVars using a generator function.
 */
qx.Class.define("qx.data.reactivevar.Derived", {
  extend: qx.data.reactivevar.ReactiveVar,
  /**
   * @param {Function} generator The function which returns the output value based on the input values. It must meet the following requirements:
   * - It must call the get() method (not getValue()) of any ReactiveVar which it depends on, in order for the dependencies to be tracked correctly.$$allowconstruct
   * - The `get()` methods must always be called, i.e. not conditionally.
   */
  construct(generator) {
    super();
    this.__generator = generator;
    let sources = (this.__sources = []);
    const ReactiveVar = qx.data.reactivevar.ReactiveVar;
    ReactiveVar.setOnGetCallback(source => sources.push(source));
    let initialValue = generator();
    ReactiveVar.setOnGetCallback(null);
    this.setValue(initialValue);
    sources.forEach(source => source.addListener("changeValue", this.__update, this));  
  },
  destruct() {
    this.__sources.forEach(source => source.removeListener("changeValue", this.__update));
  },
  members: {
    /**
     * @type {Function}
     */
    __generator: null,
    /**
     * @type {qx.data.reactivevar.IReactiveVar[]}
     */
    __sources: null,

    __update() {
      this.setValue(this.__generator());
    }
  }
});