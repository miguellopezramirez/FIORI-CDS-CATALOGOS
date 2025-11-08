sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/MessageToast"
], function (Controller, MessageToast) {
    "use strict";

    return Controller.extend("com.cat.sapfioricatalogs.controller.Configuracion", {

        /**
         * Se llama cuando la vista es inicializada.
         * Sincroniza el Select con el valor del modelo global.
         */
        onInit: function () {
            // Obtenemos el modelo 'config' global
            var oConfigModel = this.getOwnerComponent().getModel("config");
            var sSelectedDB = oConfigModel.getProperty("/selectedDB");

            // Seteamos el valor guardado en el Select
            this.byId("dbSelectionList").setSelectedKey(sSelectedDB);
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