/**
 * A ReactiveVar which tracks the value of a property path on a source object.
 */
qx.Class.define("qx.data.reactivevar.PropertyPath", {
  extend: qx.data.reactivevar.ReactiveVar,
  /**
   * 
   * @param {qx.core.Object} source 
   * @param {string} propertyPath 
   */
  construct(source, propertyPath) {
    super();
    this.__source = source;
    this.__propertyPath = propertyPath;
    this.__binding = source.bind(propertyPath, this, "value");
  },
  destruct() {
    this.__binding.dispose();
  },
  members: {
    /**
     * @type {qx.core.Object}
     */
    __source: null,
    /**
     * @type {string}
     */
    __propertyPath: null,
    /**
     * @type {qx.data.SingleValueBinding}
     */
    __binding: null
  }
});