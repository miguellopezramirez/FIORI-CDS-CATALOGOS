sap.ui.define([
    "sap/ui/core/UIComponent",
    "com/cat/sapfioricatalogs/model/models",
    "sap/ui/model/json/JSONModel"
    // ELIMINAR: "sap/ui/core/ThemeManager"
], (UIComponent, models, JSONModel) => {
// ELIMINAR: , ThemeManager
    "use strict";

    return UIComponent.extend("com.cat.sapfioricatalogs.Component", {
        metadata: {
            manifest: "json",
            interfaces: [
                "sap.ui.core.IAsyncContentCreation"
            ]
        },

        init() {
            // call the base component's init function
            UIComponent.prototype.init.apply(this, arguments);

            // set the device model
            this.setModel(models.createDeviceModel(), "device");

            // Modelo global para la configuración
            var oConfigModel = new JSONModel({
                selectedDB: "MongoDB", // Valor por defecto
                selectedTheme: "sap_horizon" 
            });
            this.setModel(oConfigModel, "config");

            // REVERTIDO: Aplicar el tema inicial usando el método compatible (aunque obsoleto)
            sap.ui.getCore().applyTheme(oConfigModel.getProperty("/selectedTheme"));

            // enable routing
            this.getRouter().initialize();
        }
    });
});