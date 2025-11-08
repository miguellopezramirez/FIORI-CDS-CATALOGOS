sap.ui.define([
    "sap/ui/core/UIComponent",
    "com/cat/sapfioricatalogs/model/models",
    "sap/ui/model/json/JSONModel"
], (UIComponent, models, JSONModel) => {
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
                selectedDB: "MongoDB" // Valor por defecto
            });
            this.setModel(oConfigModel, "config");

            // enable routing
            this.getRouter().initialize();
        }
    });
});