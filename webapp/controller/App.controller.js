sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel"
], function (Controller, JSONModel) {
    "use strict";

    return Controller.extend("com.cat.sapfioricatalogs.controller.App", {
        
        onInit: function () {
            var oModel = new JSONModel();

            oModel.loadData("./model/menuItems.json"); 
            this.getView().setModel(oModel, "sideMenuModel");
        },

        onMenuButtonPress: function () {
            var oToolPage = this.byId("toolPage");
            oToolPage.setSideExpanded(!oToolPage.getSideExpanded());
        },

        onItemSelect: function (oEvent) {
            var sKey = oEvent.getParameter("item").getKey();
            // Rífate, Sebas
            this.getOwnerComponent().getRouter().navTo(sKey);
        }
    });
});
