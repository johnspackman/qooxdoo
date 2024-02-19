/* ************************************************************************

   qooxdoo - the new era of web development

   http://qooxdoo.org

   Copyright:
     2024 Zenesis Limited (https://www.zenesis.com)

   License:
     MIT: https://opensource.org/licenses/MIT
     See the LICENSE file in the project's top-level directory for details.

   Authors:
     * John Spackman (github.com/johnspackman)

************************************************************************ */

/**
 * Implementation of check for class instances
 */
qx.Bootstrap.define("qx.core.check.ClassInstanceCheck", {
  extend: Object,
  implement: qx.core.check.ICheck,

  construct(clazz, nullable) {
    super();
    this.__clazz = clazz;
    this.__nullable = nullable;
  },

  members: {
    /** @type{qx.Class} the class to check against */
    __clazz: null,

    /** @type{Boolean} whether null is allowed */
    __nullable: null,

    /**
     * @override
     */
    matches(value) {
      if (value === undefined) {
        return false;
      }
      if (!this.isNullable() && value === null) {
        return false;
      }
      let tmp = value;
      while (tmp) {
        if (tmp === this.__clazz) {
          return true;
        }
        tmp = tmp.superclass;
      }
      return false;
    },

    /**
     * @override
     */
    isNullable() {
      return this.__nullable;
    },

    /**
     * @override
     */
    isCompatible(check) {
      if (!(check instanceof this.constructor)) {
        return false;
      }
      if (this.isNullable() && !check.isNullable()) {
        return false;
      }
      let tmp = this.__clazz;
      let requiredSuperclass = check.__clazz;
      while (tmp) {
        if (tmp === requiredSuperclass) {
          return true;
        }
        tmp = tmp.superclass;
      }
      return false;
    }
  }
});
