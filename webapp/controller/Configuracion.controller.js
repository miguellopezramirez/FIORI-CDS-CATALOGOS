sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/MessageToast",
    "sap/ui/core/UIComponent",

], function (Controller, MessageToast, UIComponent) { // NUEVO: Usar ThemeManager
    "use strict";

    return Controller.extend("com.cat.sapfioricatalogs.controller.Configuracion", {

        onInit: function () {
            // Obtenemos el modelo 'config' global
            var oConfigModel = this.getOwnerComponent().getModel("config");
            var sSelectedDB = oConfigModel.getProperty("/selectedDB");
            var sSelectedTheme = oConfigModel.getProperty("/selectedTheme");

            // Seteamos el valor guardado en el Select de BD
            this.byId("dbSelectionList").setSelectedKey(sSelectedDB);
            
            // Seteamos el valor guardado en el Select de Tema
            this.byId("themeSelectionList").setSelectedKey(sSelectedTheme);
        },

        onDbSelectionChange: function (oEvent) {
            const oSelectedItem = oEvent.getParameter("selectedItem");
            const sSelectedKey = oSelectedItem.getKey();
            
            var oConfigModel = this.getOwnerComponent().getModel("config");

            oConfigModel.setProperty("/selectedDB", sSelectedKey);

            MessageToast.show(`Base de datos seleccionada: ${sSelectedKey}`);
            
            this.getOwnerComponent().getEventBus().publish("configChannel", "dbChanged");
        },

        /**
         * Manejador para el evento 'change' del Select de Tema.
         * Usa ThemeManager.applyTheme para evitar el método obsoleto.
         */
        onThemeSelectionChange: function (oEvent) {
            const sSelectedTheme = oEvent.getParameter("selectedItem").getKey();
            
            var oConfigModel = this.getOwnerComponent().getModel("config");

            // 1. Guardamos el nuevo valor en el modelo global
            oConfigModel.setProperty("/selectedTheme", sSelectedTheme);

            // 2. Aplicamos el tema a toda la aplicación. (Método compatible con tu versión)
            sap.ui.getCore().applyTheme(sSelectedTheme);

            MessageToast.show(`Tema seleccionado: ${sSelectedTheme === 'sap_horizon_dark' ? 'Oscuro' : 'Claro'}`);
        },

        /**
         * Manejador para el evento 'change' del Select.
         * ACTUALIZA el modelo global.
         */
        onDbSelectionChange: function (oEvent) {
            const oSelectedItem = oEvent.getParameter("selectedItem");
            const sSelectedKey = oSelectedItem.getKey();
            
            // Obtenemos el modelo 'config' global
            var oConfigModel = this.getOwnerComponent().getModel("config");

            // Guardamos el nuevo valor en el modelo global
            oConfigModel.setProperty("/selectedDB", sSelectedKey);

            MessageToast.show(`Base de datos seleccionada: ${sSelectedKey}`);
            
            // Publica un evento global.
            // "configChannel" es el nombre del canal, "dbChanged" es el nombre del evento.
            this.getOwnerComponent().getEventBus().publish("configChannel", "dbChanged");
        }
    });
});