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
                busy: false,
                selectionCount: 0
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
            const viewModel = this.getView().getModel("view");

            // Obtener el binding
            const oBinding = oTable.getBinding("rows");
            let aSelectedIndices = [];
            if (oBinding) {
                // Obtener la lista de todos los índices seleccionados
                aSelectedIndices = oBinding.getSelectedIndices();
            }
            
            // Actualizar el conteo para el botón eliminar
            viewModel.setProperty("/selectionCount", aSelectedIndices.length);

            // Verificar el conteo para los botones "Modificar" y "Nuevo Valor"
            if (aSelectedIndices.length === 1) {
                // Si hay solo uno seleccionado
                // Obtener el índice del arreglo
                const iSelectedIndex = aSelectedIndices[0]; 
                
                // Usamos ese índice para obtener el objeto
                const oContext = oTable.getContextByIndex(iSelectedIndex);
                const selectedRow = oContext.getObject();
                
                // Establecemos el selectedLabel
                viewModel.setProperty("/selectedLabel", selectedRow);
            } else {
                // Si hay 0 o más de 1 seleccionados, limpiar el label.
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
            const oTable = this.byId("treeTable");
            const oBinding = oTable.getBinding("rows");
            let aSelectedIndices = [];
            if (oBinding) {
                aSelectedIndices = oBinding.getSelectedIndices();
            }

            if (aSelectedIndices.length === 0) {
                MessageBox.warning("Por favor, seleccione al menos un registro para eliminar.");
                return;
            }

            // Obtener todos los objetos de registro a eliminar primero
            const aRecordsToDelete = aSelectedIndices.map(iIndex => {
                return oTable.getContextByIndex(iIndex).getObject();
            });

            MessageBox.confirm(
                `¿Está seguro de que desea eliminar ${aRecordsToDelete.length} registro(s)?`,
                {
                    title: "Confirmar eliminación",
                    onClose: (oAction) => {
                        if (oAction === MessageBox.Action.OK) {
                            
                            // Iterar sobre los objetos y los añadimos al servicio
                            aRecordsToDelete.forEach(oRecord => {
                                this._deleteRecord(oRecord); 
                            });

                            // Modificar el modelo
                            const dataModel = this.getView().getModel();
                            let labels = dataModel.getProperty("/labels");

                            // Separar padres e hijos
                            const parentsToDelete = aRecordsToDelete.filter(r => r.parent);
                            const childrenToDelete = aRecordsToDelete.filter(r => !r.parent);

                            let updatedLabels;

                            // Filtrar los padres eliminados
                            if (parentsToDelete.length > 0) {
                                updatedLabels = labels.filter(label => {
                                    return !parentsToDelete.some(p => p.idetiqueta === label.idetiqueta);
                                });
                            } else {
                                updatedLabels = [...labels]; // crear copia
                            }

                            // 5. Filtrar los hijos eliminados
                            if (childrenToDelete.length > 0) {
                                updatedLabels = updatedLabels.map(label => {
                                    if (!label.children) return label;

                                    // Filtra los hijos de este label
                                    const newChildren = label.children.filter(child => {
                                        return !childrenToDelete.some(c => c.idvalor === child.idvalor);
                                    });

                                    return {
                                        ...label,
                                        children: newChildren
                                    };
                                });
                            }

                            // Asignar el nuevo arreglo al modelo
                            dataModel.setProperty("/labels", updatedLabels);
                            
                            // Limpiar la UI
                            MessageToast.show(`${aRecordsToDelete.length} registro(s) marcado(s) para eliminación`);
                            oTable.clearSelection();
                            this.getView().getModel("view").setProperty("/selectionCount", 0);
                            this.getView().getModel("view").setProperty("/selectedLabel", null);
                        }
                    }
                }
            );
        },

        _deleteRecord: function (record) {
            const operation = {
                action: "DELETE",
                type: record.parent ? "LABEL" : "VALUE",
                data: record
            };

            console.log("Adding DELETE operation:", operation);
            this._labelService.addOperation(operation);
            
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
            const oSearchField = this.byId("searchField");
            if (oSearchField) {
                oSearchField.setValue("");
            }

            const oTable = this.byId("treeTable");
            const oBinding = oTable.getBinding("rows");
            if (oBinding) {
                oBinding.filter([]); // 🔄 Limpia filtros
            }
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
        },

        onSearch: function (oEvent) {
            const sQuery = oEvent.getParameter("newValue") || oEvent.getParameter("query") || "";
            const oTable = this.byId("treeTable");
            const oBinding = oTable.getBinding("rows");

            if (!oBinding) return;

            // 🔍 Campos que queremos filtrar
            const aFilters = [];
            if (sQuery) {
                const sLower = sQuery.toLowerCase();
                aFilters.push(
                    new sap.ui.model.Filter({
                        filters: [
                            new sap.ui.model.Filter("etiqueta", sap.ui.model.FilterOperator.Contains, sQuery),
                            new sap.ui.model.Filter("descripcion", sap.ui.model.FilterOperator.Contains, sQuery),
                            new sap.ui.model.Filter("coleccion", sap.ui.model.FilterOperator.Contains, sQuery),
                            new sap.ui.model.Filter("seccion", sap.ui.model.FilterOperator.Contains, sQuery)
                        ],
                        and: false // OR lógico entre los campos
                    })
                );
            }

            oBinding.filter(aFilters);
        }

    });
});