/* ************************************************************************

   qooxdoo - the new era of web development

   http://qooxdoo.org

   Copyright:
     2020 Zenesis Ltd, https://www.zenesis.com

   License:
     MIT: https://opensource.org/licenses/MIT
     See the LICENSE file in the project's top-level directory for details.

   Authors:
     * John Spackman (https://githuib.com/johnspackman, john.spackman@zenesis.com)

************************************************************************ */

/**
 * Implementation of a Text column
 */
qx.Class.define("qx.ui.list.column.TextColumn", {
  extend: qx.ui.list.column.AbstractWidgetColumn,

  members: {
    /**
     * @Override
     */
    _createCellWidget(row) {
      return new qx.ui.form.TextField();
    },

    /**
     * @override
     */
    _compareValueForSort(a, b) {
      a = "" + (a || "");
      b = "" + (b || "");
      return a == b ? 0 : a < b ? -1 : 1;
    }
  }
});
