sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "com/cat/sapfioricatalogs/service/labelService",
    "sap/m/MessageBox",
    "sap/m/MessageToast"
], function (Controller, JSONModel, LabelService, MessageBox, MessageToast) {
    "use strict";

    return Controller.extend("com.cat.sapfioricatalogs.controller.Catalogos", {

        onInit: function () {
            // Inicializar el modelo de vista
            const viewModel = new JSONModel({
                selectedLabel: null,
                saveMessage: "",
                totalRows: 0,
                busy: false
            });
            this.getView().setModel(viewModel, "view");

            // Inicializar el modelo de datos
            const dataModel = new JSONModel({
                labels: []
            });
            this.getView().setModel(dataModel);

            // Inicializar el servicio
            this._labelService = new LabelService();

            // Cargar los datos iniciales
            this._loadLabels();
        },

        _loadLabels: function () {
            const viewModel = this.getView().getModel("view");
            viewModel.setProperty("/busy", true);

            this._labelService.fetchLabels()
                .then((data) => {
                    const dataModel = this.getView().getModel();
                    dataModel.setProperty("/labels", data);
                    
                    let totalRows = data.length;
                    data.forEach(parent => {
                        if (parent.children) {
                            totalRows += parent.children.length;
                        }
                    });
                    viewModel.setProperty("/totalRows", totalRows);
                    
                    MessageToast.show("Datos cargados correctamente");
                })
                .catch((error) => {
                    MessageBox.error("Error al cargar los datos: " + error.message);
                })
                .finally(() => {
                    viewModel.setProperty("/busy", false);
                });
        },

        onRowSelectionChange: function (oEvent) {
            const oTable = this.byId("treeTable");
            const iSelectedIndex = oTable.getSelectedIndex();
            const viewModel = this.getView().getModel("view");

            if (iSelectedIndex !== -1) {
                const oContext = oTable.getContextByIndex(iSelectedIndex);
                const selectedRow = oContext.getObject();
                viewModel.setProperty("/selectedLabel", selectedRow);
            } else {
                viewModel.setProperty("/selectedLabel", null);
            }
        },

        onNewCatalogo: function () {
            if (!this._newCatalogoDialog) {
                this.loadFragment({
                    name: "com.cat.sapfioricatalogs.view.fragments.NewCatalogo"
                }).then((oDialog) => {
                    this._newCatalogoDialog = oDialog;
                    this._newCatalogoDialog.open();
                });
            } else {
                this._newCatalogoDialog.open();
            }
        },

        onNewValor: function () {
            const viewModel = this.getView().getModel("view");
            const selectedLabel = viewModel.getProperty("/selectedLabel");

            if (!selectedLabel || !selectedLabel.parent) {
                MessageBox.warning("Por favor, seleccione una etiqueta padre para agregar un valor.");
                return;
            }

            if (!this._newValorDialog) {
                this.loadFragment({
                    name: "com.cat.sapfioricatalogs.view.fragments.NewValor"
                }).then((oDialog) => {
                    this._newValorDialog = oDialog;
                    this._newValorDialog.open();
                });
            } else {
                this._newValorDialog.open();
            }
        },

        onUpdate: function () {
            const viewModel = this.getView().getModel("view");
            const selectedLabel = viewModel.getProperty("/selectedLabel");

            if (!selectedLabel) {
                MessageBox.warning("Por favor, seleccione un registro para modificar.");
                return;
            }

            if (!this._updateDialog) {
                this.loadFragment({
                    name: "com.cat.sapfioricatalogs.view.fragments.UpdateCatalogo"
                }).then((oDialog) => {
                    this._updateDialog = oDialog;
                    const updateModel = new JSONModel(selectedLabel);
                    this._updateDialog.setModel(updateModel, "update");
                    this._updateDialog.open();
                });
            } else {
                const updateModel = new JSONModel(selectedLabel);
                this._updateDialog.setModel(updateModel, "update");
                this._updateDialog.open();
            }
        },

        onDelete: function () {
            const viewModel = this.getView().getModel("view");
            const selectedLabel = viewModel.getProperty("/selectedLabel");

            if (!selectedLabel) {
                MessageBox.warning("Por favor, seleccione un registro para eliminar.");
                return;
            }

            MessageBox.confirm(
                "¿Está seguro de que desea eliminar este registro?",
                {
                    title: "Confirmar eliminación",
                    onClose: (oAction) => {
                        if (oAction === MessageBox.Action.OK) {
                            this._deleteRecord(selectedLabel);
                        }
                    }
                }
            );
        },

        _deleteRecord: function (record) {
            const operation = {
                action: "DELETE",
                data: record
            };

            this._labelService.addOperation(operation);
            
            const dataModel = this.getView().getModel();
            const labels = dataModel.getProperty("/labels");
            
            if (record.parent) {
                const updatedLabels = labels.filter(label => 
                    label.idetiqueta !== record.idetiqueta
                );
                dataModel.setProperty("/labels", updatedLabels);
            } else {
                const updatedLabels = labels.map(label => {
                    if (label.idetiqueta === record.parentKey) {
                        return {
                            ...label,
                            children: label.children.filter(child => 
                                child.idvalor !== record.idvalor
                            )
                        };
                    }
                    return label;
                });
                dataModel.setProperty("/labels", updatedLabels);
            }

            MessageToast.show("Registro marcado para eliminación");
        },

        onSaveChanges: function () {
            const viewModel = this.getView().getModel("view");
            viewModel.setProperty("/busy", true);

            this._labelService.saveChanges()
                .then((result) => {
                    if (result.success) {
                        viewModel.setProperty("/saveMessage", result.message);
                        
                        setTimeout(() => {
                            viewModel.setProperty("/saveMessage", "");
                        }, 3000);

                        this._loadLabels();
                    }
                })
                .catch((error) => {
                    MessageBox.error("Error al guardar los cambios: " + error.message);
                })
                .finally(() => {
                    viewModel.setProperty("/busy", false);
                });
        },

        onRefresh: function () {
            this._loadLabels();
        },

        onCloseNewCatalogo: function () {
            this._newCatalogoDialog.close();
        },

        onCloseNewValor: function () {
            this._newValorDialog.close();
        },

        onCloseUpdate: function () {
            this._updateDialog.close();
        },

        onSaveNewCatalogo: function () {
            // Implementar lógica de guardado
            const newData = {
                // Obtener datos del formulario
            };

            const operation = {
                action: "CREATE",
                type: "LABEL",
                data: newData
            };

            this._labelService.addOperation(operation);
            this._newCatalogoDialog.close();
            MessageToast.show("Catálogo agregado. No olvide guardar los cambios.");
        },

        onSaveNewValor: function () {
            const newData = {
                // Obtener datos del formulario
            };

            const operation = {
                action: "CREATE",
                type: "VALUE",
                data: newData
            };

            this._labelService.addOperation(operation);
            this._newValorDialog.close();
            MessageToast.show("Valor agregado. No olvide guardar los cambios.");
        },

        onSaveUpdate: function () {
            const updateModel = this._updateDialog.getModel("update");
            const updatedData = updateModel.getData();

            const operation = {
                action: "UPDATE",
                data: updatedData
            };

            this._labelService.addOperation(operation);
            
            const dataModel = this.getView().getModel();
            const labels = dataModel.getProperty("/labels");
            
            if (updatedData.parent) {
                const updatedLabels = labels.map(label => 
                    label.idetiqueta === updatedData.idetiqueta ? updatedData : label
                );
                dataModel.setProperty("/labels", updatedLabels);
            } else {
                const updatedLabels = labels.map(label => {
                    if (label.idetiqueta === updatedData.parentKey) {
                        return {
                            ...label,
                            children: label.children.map(child =>
                                child.idvalor === updatedData.idvalor ? updatedData : child
                            )
                        };
                    }
                    return label;
                });
                dataModel.setProperty("/labels", updatedLabels);
            }

            this._updateDialog.close();
            MessageToast.show("Cambios guardados. No olvide confirmar los cambios.");
        }
    });
});