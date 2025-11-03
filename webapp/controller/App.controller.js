sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel"
], function (Controller, JSONModel) {
    "use strict";

    return Controller.extend("com.cat.sapfioricatalogs.controller.App", {
        
        onInit: function () {
            // (Paso 9 del tutorial)
            var oModel = new JSONModel();
            // Usamos un path genérico para el modelo del menú
            oModel.loadData("./model/menuItems.json"); 
            this.getView().setModel(oModel, "sideMenuModel");
        },

        // (Paso 5 del tutorial)
        onMenuButtonPress: function () {
            var oToolPage = this.byId("toolPage");
            oToolPage.setSideExpanded(!oToolPage.getSideExpanded());
        },

        // (Paso 6 del tutorial - Lógica de ruteo)
        onItemSelect: function (oEvent) {
            var sKey = oEvent.getParameter("item").getKey();
            // Aquí tu compañero Sebas conectará el router
            // Por ahora, solo navegamos al "key" (que debe coincidir con un "name" de tus rutas)
            this.getOwnerComponent().getRouter().navTo(sKey);
        }
    });
});
