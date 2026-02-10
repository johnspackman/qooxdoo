/* ************************************************************************

   qooxdoo - the new era of web development

   http://qooxdoo.org

   Copyright:
     2007-2008 1&1 Internet AG, Germany, http://www.1und1.de

   License:
     MIT: https://opensource.org/licenses/MIT
     See the LICENSE file in the project's top-level directory for details.

   Authors:
     * Sebastian Werner (wpbasti)
     * Fabian Jakobs (fjakobs)
     * Christian Hagendorn (chris_schmidt)
     * John Spackman (johnspackman)

************************************************************************ */

/**
 * Focus statics, this separates the constants from UI-specific code so that
 * it can be used on the server side.
 */
qx.Class.define("qx.event.handler.FocusCharacteristics", {
  statics: {
    /**
     * @type {Map} See: http://msdn.microsoft.com/en-us/library/ms534654(VS.85).aspx
     */
    FOCUSABLE_ELEMENTS: qx.core.Environment.select("engine.name", {
      mshtml: {
        a: 1,
        body: 1,
        button: 1,
        frame: 1,
        iframe: 1,
        img: 1,
        input: 1,
        object: 1,
        select: 1,
        textarea: 1
      },

      gecko: {
        a: 1,
        body: 1,
        button: 1,
        frame: 1,
        iframe: 1,
        img: 1,
        input: 1,
        object: 1,
        select: 1,
        textarea: 1
      },

      opera: {
        button: 1,
        input: 1,
        select: 1,
        textarea: 1
      },

      webkit: {
        button: 1,
        input: 1,
        select: 1,
        textarea: 1
      }
    })
  }
});
