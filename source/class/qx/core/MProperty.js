/* ************************************************************************

   qooxdoo - the new era of web development

   http://qooxdoo.org

   Copyright:
     2004-2011 1&1 Internet AG, Germany, http://www.1und1.de

   License:
     MIT: https://opensource.org/licenses/MIT
     See the LICENSE file in the project's top-level directory for details.

   Authors:
     * Martin Wittemann (martinwittemann)

************************************************************************ */

/**
 * This mixin offers the basic property features which include generic
 * setter, getter and resetter.
 */
qx.Mixin.define("qx.core.MProperty", {
  members: {
    /**
     * Sets either multiple properties at once by using a property list or
     * sets one property and its value by the first and second argument.
     * As a fallback, if no generated property setter could be found, a
     * handwritten setter will be searched and invoked if available.
     *
     * @param data {Object | String} a map of property values. The key is the name of the property.
     * @param value {var?} the value, only used when <code>data</code> is a string.
     * @return {Object} Returns this instance if <code>data</code> is a map
     *   or a non-generated setter is called; otherwise returns <code>value</code>.
     * @throws {Error} if a property defined does not exist
     */
    set(data, value) {
      const setValueImpl = (propName, value) => {
        let upname = qx.Bootstrap.firstUp(propName);
        let setterName = "set" + upname;

        if (!this[setterName]) {
          throw new Error(
            `No such property: ${propName} in ${this.classname} (${this})`
          );
        }

        return this[setterName](value);
      };

      if (qx.Bootstrap.isString(data)) {
        return setValueImpl(data, value);
      }

      for (var propName in data) {
        if (data[propName] !== undefined) {
          setValueImpl(propName, data[propName]);
        }
      }
      return this;
    },

    /**
     * Sets either multiple properties at once by using a property list or
     * sets one property and its value by the first and second argument.
     * As a fallback, if no generated property setter could be found, a
     * handwritten setter will be searched and invoked if available.
     *
     * @param data {Object | String} a map of property values. The key is the name of the property.
     * @param value {var?} the value, only used when <code>data</code> is a string.
     * @return {Promise<*>} Returns this instance if <code>data</code> is a map
     *   or a non-generated setter is called; otherwise returns <code>value</code>.
     * @throws {Error} if a property defined does not exist
     */
    async setAsync(data, value) {
      const setValueImpl = async (propName, value) => {
        let upname = qx.Bootstrap.firstUp(propName);
        let setterName = "set" + upname + "Async";

        if (qx.core.Environment.get("qx.debug")) {
          if (!this[setterName]) {
            throw new Error(
              `No such property: ${propName} in ${this.classname} (${this})`
            );
          }
        }

        return await this[setterName](value);
      };

      if (qx.Bootstrap.isString(data)) {
        return await setValueImpl(data, value);
      }

      for (let propName in data) {
        await setValueImpl(propName, data[propName]);
      }
      return this;
    },

    /**
     * Returns the value of the given property. If no generated getter could be
     * found, a fallback tries to access a handwritten getter.
     *
     * @param prop {String} Name of the property.
     * @return {var} The value of the value
     * @throws {Error} if a property defined does not exist
     */
    get(prop) {
      var getter = qx.core.Property.$$method.get;

      if (!this[getter[prop]]) {
        if (this["get" + qx.Bootstrap.firstUp(prop)] != undefined) {
          return this["get" + qx.Bootstrap.firstUp(prop)]();
        }

        throw new Error(
          "No such property: " +
            prop +
            " in " +
            this.classname +
            " (" +
            this +
            ")"
        );
      }

      return this[getter[prop]]();
    },

    /**
     * Resets the value of the given property. If no generated resetter could be
     * found, a handwritten resetter will be invoked, if available.
     *
     * @param prop {String} Name of the property.
     * @throws {Error} if a property defined does not exist
     */
    reset(prop) {
      var resetter = qx.core.Property.$$method.reset;

      if (!this[resetter[prop]]) {
        if (this["reset" + qx.Bootstrap.firstUp(prop)] != undefined) {
          this["reset" + qx.Bootstrap.firstUp(prop)]();
          return;
        }

        throw new Error(
          "No such property: " +
            prop +
            " in " +
            this.classname +
            " (" +
            this +
            ")"
        );
      }

      this[resetter[prop]]();
    },

    /**
     * Checks if the property is initialized, i.e. has a defined init value or
     * has got a value by a setter method.
     *
     * @param prop {String} Name of the property
     * @return {Boolean} If the property is initialized
     * @throws {Error} If the property defined does not exist
     */
    isPropertyInitialized(prop) {
      if (qx.core.Environment.get("qx.debug")) {
        qx.core.Assert.assertString(prop);

        if (!this["get" + qx.Bootstrap.firstUp(prop)]) {
          throw new Error(
            "No such property: " +
              prop +
              " in " +
              this.classname +
              " (" +
              this +
              ")"
          );
        }
      }

      return (
        this["$$user_" + prop] !== undefined ||
        this["$$init_" + prop] !== undefined
      );
    }
  }
});
