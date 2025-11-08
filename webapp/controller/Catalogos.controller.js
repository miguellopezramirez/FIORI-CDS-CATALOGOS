sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "com/cat/sapfioricatalogs/service/labelService",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/m/Token"
], function (Controller, JSONModel, LabelService, MessageBox, MessageToast, Token) {
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

        //Se dispara cuando el usuario agrega (Enter) o elimina un token del MultiInput.
        onTokenUpdate: function (oEvent) {
            const sType = oEvent.getParameter("type"); // "added" o "removed"
            const oSource = oEvent.getSource(); // El MultiInput

            // Obtenemos el contexto (la fila) que se está editando
            const oBindingContext = oSource.getBindingContext();
            if (!oBindingContext) return;

            const sBindingPath = oBindingContext.getPath(); // ej: "/labels/0" o "/labels/0/children/1"
            const oModel = this.getView().getModel();

            // 1. Obtener el array actual de tokens del modelo
            let aTokens = oModel.getProperty(sBindingPath + "/indice") || [];

            if (sType === "added") {
                // 2. Si se agregó un token, lo añadimos al array del modelo
                const aAddedTokens = oEvent.getParameter("addedTokens");
                aAddedTokens.forEach(function (oToken) {
                    // Verificamos que no esté duplicado antes de añadir
                    if (!aTokens.find(t => t.key === oToken.getKey())) {
                        aTokens.push({
                            key: oToken.getKey(),
                            text: oToken.getText()
                        });
                    }
                });
            } else if (sType === "removed") {
                // 3. Si se eliminó, lo quitamos del array del modelo
                const aRemovedTokens = oEvent.getParameter("removedTokens");
                const aRemovedKeys = aRemovedTokens.map(t => t.getKey());

                aTokens = aTokens.filter(function (oToken) {
                    return !aRemovedKeys.includes(oToken.key);
                });
            }

            // 4. Actualizar el modelo con el nuevo array
            oModel.setProperty(sBindingPath + "/indice", aTokens);
        },

        onNewCatalogo: function () {
            if (!this._pNewCatalogoDialog) {
                this._pNewCatalogoDialog = this.loadFragment({
                    name: "com.cat.sapfioricatalogs.view.fragments.NewCatalogo"
                }).then((oDialog) => {
                    this.getView().addDependent(oDialog);
                    return oDialog;
                });
            }

            this._pNewCatalogoDialog.then(function (oDialog) {
                oDialog.open();
            });
        },

        onNewValor: function () {
            const selectedContext = this.getView().byId("treeTable").getBinding().getSelection();
            if (!selectedContext || selectedContext.length === 0) {
                MessageBox.error("Por favor, seleccione un catálogo (fila padre) primero.");
                return;
            }
            const oSelectedObject = selectedContext[0].getObject();
            if (!oSelectedObject.parent) {
                MessageBox.error("Solo puede agregar valores a un catálogo (fila padre).");
                return;
            }

            if (!this._pNewValorDialog) {
                this._pNewValorDialog = this.loadFragment({
                    name: "com.cat.sapfioricatalogs.view.fragments.NewValor"
                }).then((oDialog) => {
                    this.getView().addDependent(oDialog);
                    return oDialog;
                });
            }

            this._pNewValorDialog.then((oDialog) => {
                const oValorModel = new JSONModel({
                    parentKey: oSelectedObject.idetiqueta,
                    idsociedad: oSelectedObject.idsociedad,
                    idcedi: oSelectedObject.idcedi
                });
                oDialog.setModel(oValorModel, "newValor");
                oDialog.open();
            });
        },

        onUpdate: function () {
            const oTable = this.byId("treeTable");
            const aSelectedIndices = oTable.getSelectedIndices();

            if (aSelectedIndices.length !== 1) {
                MessageBox.error("Por favor, seleccione una única fila para modificar.");
                return;
            }
            const oContext = oTable.getContextByIndex(aSelectedIndices[0]);
            const oSelectedData = oContext.getObject();
            const oUpdateData = JSON.parse(JSON.stringify(oSelectedData));

            if (!this._pUpdateDialog) {
                this._pUpdateDialog = this.loadFragment({
                    name: "com.cat.sapfioricatalogs.view.fragments.UpdateCatalogo"
                }).then((oDialog) => {
                    this.getView().addDependent(oDialog);
                    return oDialog;
                });
            }

            this._pUpdateDialog.then((oDialog) => {
                oDialog.setModel(new JSONModel(oUpdateData), "update");
                oDialog.open();
            });
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
            // --- Limpiamos los campos ---
            this.byId("inputIdSociedad")?.setValue("");
            this.byId("inputIdCedi")?.setValue("");
            this.byId("inputIdEtiqueta")?.setValue("");
            this.byId("inputEtiqueta")?.setValue("");
            this.byId("fragmentInputIndice")?.setTokens([]); // Limpiamos el MultiInput
            this.byId("inputColeccion")?.setValue("");
            this.byId("inputSeccion")?.setValue("");
            this.byId("inputSecuencia")?.setValue("0");
            this.byId("inputImagen")?.setValue("");
            this.byId("inputRuta")?.setValue("");
            this.byId("textAreaDescripcion")?.setValue("");
            if (this._pNewCatalogoDialog) {
                this._pNewCatalogoDialog.then(function (oDialog) {
                    oDialog.close();
                });
            }
        },

        onCloseNewValor: function () {
            if (this._pNewValorDialog) {
                this._pNewValorDialog.then(function (oDialog) {
                    oDialog.close();
                });
            }
        },

        onCloseUpdate: function () {
            if (this._pUpdateDialog) {
                this._pUpdateDialog.then(function (oDialog) {
                    oDialog.close();
                });
            }
        },

        /**
         * Se dispara cuando el usuario presiona Enter en el MultiInput del fragmento.
         */
        onFragmentSubmit: function (oEvent) {
            const oMultiInput = oEvent.getSource();
            const sValue = oEvent.getParameter("value"); // Texto que el usuario escribió

            if (sValue && sValue.trim() !== "") {
                // 1. Crear un nuevo Token
                const oNewToken = new Token({
                    key: sValue.trim(),
                    text: sValue.trim()
                });

                // 2. Añadir el token al MultiInput
                oMultiInput.addToken(oNewToken);
            }

            // 3. Limpiar el campo de texto del MultiInput
            oMultiInput.setValue("");
        },

        onSaveNewCatalogo: function () {
            // 1. Leer todos los valores del formulario del fragmento
            const oView = this.getView();
            const sSociedad = oView.byId("inputIdSociedad").getValue();
            const sCedi = oView.byId("inputIdCedi").getValue();
            const sIdEtiqueta = oView.byId("inputIdEtiqueta").getValue();
            const sEtiqueta = oView.byId("inputEtiqueta").getValue();

            // --- 2. Leer los Tokens del MultiInput ---
            const oMultiInput = oView.byId("fragmentInputIndice");
            const aTokens = oMultiInput.getTokens();

            // 3. Convertir los tokens en un string separado por comas
            const sIndice = aTokens.map(oToken => oToken.getKey()).join(',');
            // -------------------------------------------

            const sColeccion = oView.byId("inputColeccion").getValue();
            const sSeccion = oView.byId("inputSeccion").getValue();
            const iSecuencia = parseInt(oView.byId("inputSecuencia").getValue() || "0", 10);
            const sImagen = oView.byId("inputImagen").getValue();
            const sRuta = oView.byId("inputRuta").getValue();
            const sDescripcion = oView.byId("textAreaDescripcion").getValue();

            // 4. Validar campos requeridos (ejemplo)
            if (!sSociedad || !sCedi || !sIdEtiqueta || !sEtiqueta) {
                MessageBox.error("Por favor, complete todos los campos requeridos.");
                return;
            }

            // 5. Construir el objeto de datos
            const newData = {
                idsociedad: sSociedad,
                idcedi: sCedi,
                idetiqueta: sIdEtiqueta,
                etiqueta: sEtiqueta,
                indice: sIndice, // Aquí va nuestro string de tokens
                coleccion: sColeccion,
                seccion: sSeccion,
                secuencia: iSecuencia,
                imagen: sImagen,
                ruta: sRuta,
                descripcion: sDescripcion,
                parent: true // Asumimos que un "Nuevo Catálogo" es un 'parent'
            };

            // 6. Crear la operación
            const operation = {
                action: "CREATE",
                type: "LABEL", // 'LABEL' para catálogos, 'VALUE' para valores
                data: newData
            };

            // 7. Añadir al servicio y cerrar
            this._labelService.addOperation(operation);

            MessageToast.show("Catálogo agregado. No olvide 'Guardar Cambios'.");

            // Usamos la función de cerrar (que ahora también limpia los campos)
            this.onCloseNewCatalogo();
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
        },

        /**
         * Se llama cuando la vista es destruida.
         * Limpiamos las promesas de los diálogos.
         * Los diálogos en sí se destruirán automáticamente 
         * porque usamos addDependent().
         */
        onExit: function () {
            this._pNewCatalogoDialog = null;
            this._pNewValorDialog = null;
            this._pUpdateDialog = null;
        }

    });
});