sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "com/cat/sapfioricatalogs/service/labelService",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/ui/core/Fragment",
    "sap/m/Token"
], function (Controller, JSONModel, LabelService, MessageBox, MessageToast, Fragment, Token) {
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

            //Obtener el modelo 'config' global
            var oConfigModel = this.getOwnerComponent().getModel("config");

            // Inicializar el servicio
            this._labelService = new LabelService();
            this._labelService.setConfigModel(oConfigModel); // Inyectamos el modelo

            // Cargar los datos iniciales
            this._loadLabels();

            // Suscribirse al evento de cambio de BD
            var oEventBus = this.getOwnerComponent().getEventBus();
            oEventBus.subscribe(
                "configChannel",  // El canal que definimos en Configuracion
                "dbChanged",      // El evento que definimos en Configuracion
                this._loadLabels, // La función a ejecutar (this._loadLabels)
                this              // El contexto (importante para que 'this' funcione)
            );
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

                // Preparar datos para el Value Help
                const oModel = this.getView().getModel();
                const aLabels = oModel.getProperty("/labels");
                const oValueHelpData = this._prepareValueHelpData(aLabels);
                
                const oValueHelpModel = new JSONModel(oValueHelpData);
                oDialog.setModel(oValueHelpModel, "valueHelp");
            });
            
            
        },

        onDelete: function () {
            const oTable = this.byId("treeTable");
            const aSelectedIndices = oTable.getSelectedIndices();

            if (aSelectedIndices.length === 0) {
                MessageBox.warning("Por favor, seleccione al menos un registro para eliminar.");
                return;
            }

            // Mapear índices a contextos para no perder referencia si la tabla cambia
            const aContexts = aSelectedIndices.map(iIndex => oTable.getContextByIndex(iIndex));

            MessageBox.confirm(
                `¿Está seguro de que desea marcar ${aSelectedIndices.length} registro(s) para eliminación?`,
                {
                    title: "Confirmar eliminación",
                    onClose: (oAction) => {
                        if (oAction === MessageBox.Action.OK) {
                            const oModel = this.getView().getModel();

                            // Iterar sobre los registros seleccionados
                            aContexts.forEach(oContext => {
                                if (!oContext) return;

                                const oRecord = oContext.getObject();
                                const sPath = oContext.getPath();

                                // 1. Encolar operación para el Backend (ADAPTADO A TU SERVICIO)
                                this._deleteRecord(oRecord);

                                // 2. Soft Delete Visual (Frontend)
                                // Marcamos la fila en rojo usando la propiedad 'uiState'
                                oModel.setProperty(sPath + "/uiState", "Error"); 
                                
                                // Opcional: Marcar estado de cambio
                                // oRecord.status = "Deleted"; 
                            });

                            // Limpiar selección y contadores
                            oTable.clearSelection();
                            this.getView().getModel("view").setProperty("/selectionCount", 0);
                            this.getView().getModel("view").setProperty("/selectedLabel", null);

                            MessageToast.show("Registros marcados para eliminar. Presione 'Guardar Cambios' para confirmar.");
                        }
                    }
                }
            );
        },

        _deleteRecord: function (record) {
    // Tu backend espera: collection ("labels" o "values")
    const sCollection = record.parent ? "labels" : "values";
    
    // Tu backend espera el ID dentro de 'payload'
    const sId = record.parent ? record.idetiqueta : record.idvalor;

    const operation = {
        collection: sCollection, 
        action: "DELETE",
        payload: {
            id: sId
        }
    };

    console.log("Encolando DELETE para backend:", operation);
    this._labelService.addOperation(operation);
},


        // Nuevo manejador para el evento change
        onValorPadreChange: function(oEvent) {
            const sValue = oEvent.getParameter("value");
            const oSelectedItem = oEvent.getParameter("selectedItem");
            
            // Obtener el modelo del diálogo
            const oDialog = oEvent.getSource().getParent().getParent().getParent();
            const oValorModel = oDialog.getModel("newValor");
            
            // Actualizar el valor en el modelo
            oValorModel.setProperty("/idvalorpa", sValue);
            
            console.log("Valor padre seleccionado:", sValue, oSelectedItem);
        },


        _prepareValueHelpData: function(aLabels) {
            const aFlatItems = [];
            const aGroupedItems = [];
            
            aLabels.forEach(oLabel => {
                const aChildren = oLabel.children || oLabel.subRows || [];
                
                if (aChildren.length > 0) {
                    // Agregar header de grupo
                    aGroupedItems.push({
                        isGroup: true,
                        etiqueta: oLabel.etiqueta,
                        idetiqueta: oLabel.idetiqueta
                    });
                    
                    // Agregar valores del grupo
                    aChildren.forEach(oChild => {
                        const oItem = {
                            idvalor: oChild.idvalor,
                            valor: oChild.valor,
                            etiqueta: oLabel.etiqueta,
                            idetiqueta: oLabel.idetiqueta,
                            isGroup: false,
                            selected: false
                        };
                        
                        aFlatItems.push(oItem);
                        aGroupedItems.push(oItem);
                    });
                }
            });
            
            return {
                flatItems: aFlatItems,
                groupedItems: aGroupedItems
            };
        },

        /**
         * Abrir el diálogo de Nuevo Valor
         */
        onNewValor: function () {
            const oViewModel = this.getView().getModel("view");
            const oSelectedObject = oViewModel.getProperty("/selectedLabel");

            if (!oSelectedObject) {
                MessageBox.error("Por favor, seleccione un catálogo (fila padre) primero.");
                return;
            }

            if (oSelectedObject.parent !== true) {
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
                // Preparar modelo para el diálogo
                const oValorModel = new JSONModel({
                    parentKey: oSelectedObject.idetiqueta,
                    idsociedad: oSelectedObject.idsociedad,
                    idcedi: oSelectedObject.idcedi,
                    idvalorpa: null,
                    idvalorpaDisplay: ""
                });
                oDialog.setModel(oValorModel, "newValor");
                
                // Preparar datos para el Value Help
                const oModel = this.getView().getModel();
                const aLabels = oModel.getProperty("/labels");
                const oValueHelpData = this._prepareValueHelpData(aLabels);
                
                const oValueHelpModel = new JSONModel(oValueHelpData);
                oDialog.setModel(oValueHelpModel, "valueHelp");
                
                this._clearNewValorForm();
                oDialog.open();
            });
        },

        /**
         * Cuando se selecciona un valor del ComboBox
         */
        onValorPadreComboChange: function(oEvent) {
            const oSelectedItem = oEvent.getParameter("selectedItem");
            
            if (oSelectedItem) {
                const sIdValor = oSelectedItem.getKey();
                
                // Actualizar modelo
                const oDialog = oEvent.getSource().getParent().getParent().getParent().getParent();
                const oValorModel = oDialog.getModel("newValor");
                oValorModel.setProperty("/idvalorpa", sIdValor);
                oValorModel.setProperty("/idvalorpaDisplay", oSelectedItem.getText());
                
                // Mostrar botón de limpiar
                this.byId("valClearButton").setVisible(true);
            }
        },

        /**
         * Abrir el diálogo de Value Help completo
         */
        onOpenValorPadreDialog: function(oEvent) {
            // Obtener el diálogo padre (NewValor)
            const oParentDialog = oEvent.getSource().getParent().getParent().getParent().getParent();
            const oValueHelpModel = oParentDialog.getModel("valueHelp");
            const oValorModel = oParentDialog.getModel("newValor");
            const sCurrentValue = oValorModel.getProperty("/idvalorpa");
            
            // Marcar el valor actual como seleccionado
            const aGroupedItems = oValueHelpModel.getProperty("/groupedItems");
            aGroupedItems.forEach(item => {
                if (!item.isGroup) {
                    item.selected = (item.idvalor === sCurrentValue);
                }
            });
            oValueHelpModel.setProperty("/groupedItems", aGroupedItems);
            
            if (!this._pValorPadreDialog) {
                this._pValorPadreDialog = this.loadFragment({
                    name: "com.cat.sapfioricatalogs.view.fragments.ValorPadreDialog"
                }).then((oDialog) => {
                    this.getView().addDependent(oDialog);
                    return oDialog;
                });
            }
            
            this._pValorPadreDialog.then((oDialog) => {
                // Pasar el modelo al diálogo
                oDialog.setModel(oValueHelpModel, "valueHelp");
                
                // Limpiar búsqueda
                const oSearchField = Fragment.byId(this.getView().getId(), "valorPadreSearchField");
                if (oSearchField) {
                    oSearchField.setValue("");
                }
                
                oDialog.open();
            });
        },

        /**
         * Buscar en el diálogo de Value Help
         */
        onSearchValorPadre: function(oEvent) {
            const sQuery = oEvent.getParameter("newValue");
            const oList = Fragment.byId(this.getView().getId(), "valorPadreList");
            const oBinding = oList.getBinding("items");
            
            if (!oBinding) return;
            
            const aFilters = [];
            if (sQuery) {
                aFilters.push(new sap.ui.model.Filter({
                    filters: [
                        new sap.ui.model.Filter("valor", sap.ui.model.FilterOperator.Contains, sQuery),
                        new sap.ui.model.Filter("etiqueta", sap.ui.model.FilterOperator.Contains, sQuery)
                    ],
                    and: false
                }));
            }
            
            oBinding.filter(aFilters);
        },

        onSelectValorPadreFromDialog: function(oEvent) {
            const oSelectedItem = oEvent.getParameter("listItem");
            
            if (oSelectedItem) {
                const oContext = oSelectedItem.getBindingContext("valueHelp");
                const oData = oContext.getObject();

                // Acceder a las propiedades
                const sIdValor = oData.idvalor;
                const sValor = oData.valor;
                
                // Buscar el diálogo de NewValor entre los dependents de la vista
                const aDialogs = this.getView().getDependents();
                let oParentDialog = null;
                
                for (let i = 0; i < aDialogs.length; i++) {
                    if (aDialogs[i].getMetadata().getName() === "sap.m.Dialog" && 
                        aDialogs[i].getTitle() === "Nuevo Valor") {
                        oParentDialog = aDialogs[i];
                        break;
                    }
                }
                
                if (oParentDialog) {
                    const oValorModel = oParentDialog.getModel("newValor");
                    oValorModel.setProperty("/idvalorpa", sIdValor);
                    oValorModel.setProperty("/idvalorpaDisplay", sValor);
                    
                    // Actualizar ComboBox
                    const oComboBox = this.byId("valComboBoxIdValorPa");
                    if (oComboBox) {
                        oComboBox.setSelectedKey(sIdValor);
                    }
                    
                    // Mostrar botón de limpiar
                    const oClearButton = this.byId("valClearButton");
                    if (oClearButton) {
                        oClearButton.setVisible(true);
                    }
                }
                
                // Cerrar el diálogo de Value Help
                this.onCloseValorPadreDialog();
            }
        },


        /**
         * Limpiar selección desde el diálogo
         */
        onClearValorPadreFromDialog: function() {
            const aDialogs = this.getView().getDependents();
        let oParentDialog = null;

        for (let i = 0; i < aDialogs.length; i++) {
            if (aDialogs[i].getMetadata().getName() === "sap.m.Dialog" && 
                aDialogs[i].getTitle() === "Nuevo Valor") {
                oParentDialog = aDialogs[i];
                break;
            }
        }
            
            if (oParentDialog) {
                const oValorModel = oParentDialog.getModel("newValor");
                oValorModel.setProperty("/idvalorpa", null);
                oValorModel.setProperty("/idvalorpaDisplay", "");
                
                // Actualizar ComboBox
                const oComboBox = this.byId("valComboBoxIdValorPa");
                if (oComboBox) {
                    oComboBox.setSelectedKey("");
                }
                
                // Ocultar botón de limpiar
                this.byId("valClearButton").setVisible(false);
            }
            
            this.onCloseValorPadreDialog();
        },

        /**
         * Cerrar el diálogo de Value Help
         */
        onCloseValorPadreDialog: function() {
            if (this._pValorPadreDialog) {
                this._pValorPadreDialog.then((oDialog) => {
                    oDialog.close();
                });
            }
        },

        /**
         * Limpiar selección desde el botón externo
         */
        onClearValorPadre: function(oEvent) {
            const oDialog = oEvent.getSource().getParent().getParent().getParent().getParent();
            const oValorModel = oDialog.getModel("newValor");
            
            oValorModel.setProperty("/idvalorpa", null);
            oValorModel.setProperty("/idvalorpaDisplay", "");
            
            // Limpiar ComboBox
            const oComboBox = this.byId("valComboBoxIdValorPa");
            if (oComboBox) {
                oComboBox.setSelectedKey("");
            }
            
            // Ocultar botón de limpiar
            oEvent.getSource().setVisible(false);
        },

        /**
         * Modificar onSaveNewValor para usar el valor seleccionado
         */
        onSaveNewValor: function (oEvent) {
            const oDialog = oEvent.getSource().getParent();
            if (!oDialog) {
                MessageBox.error("No se pudo encontrar el diálogo.");
                return;
            }

            const oValorModel = oDialog.getModel("newValor");
            const sParentKey = oValorModel.getProperty("/parentKey");
            const sSociedad = oValorModel.getProperty("/idsociedad");
            const sCedi = oValorModel.getProperty("/idcedi");
            const sIdValorPa = oValorModel.getProperty("/idvalorpa"); // *** VALOR DEL VALUE HELP ***

            const oView = this.getView();
            const sIdValor = oView.byId("valInputIdValor").getValue();
            const sValor = oView.byId("valInputValor").getValue();

            const aErrors = [];
            if (!sIdValor || sIdValor.trim() === "") {
                aErrors.push("El campo 'ID Valor' es requerido.");
            }
            if (!sValor || sValor.trim() === "") {
                aErrors.push("El campo 'Valor' es requerido.");
            }
            if (aErrors.length > 0) {
                MessageBox.error(aErrors.join("\n"));
                return; 
            }

            const newLocalData = {
                idsociedad: sSociedad,
                idcedi: sCedi,
                idvalor: sIdValor,
                valor: sValor,
                idvalorpa: sIdValorPa || null, // *** USAR VALOR DEL VALUE HELP ***
                secuencia: parseInt(oView.byId("valInputSecuencia").getValue() || "0", 10),
                imagen: oView.byId("valInputImagen").getValue(),
                ruta: oView.byId("valInputRuta").getValue(),
                descripcion: oView.byId("valTextAreaDescripcion").getValue(),
                parent: false, 
                uiState: "Success" 
            };

            const apiPayload = {
                IDSOCIEDAD: newLocalData.idsociedad,
                IDCEDI: newLocalData.idcedi,
                IDETIQUETA: sParentKey, 
                IDVALOR: newLocalData.idvalor,
                VALOR: newLocalData.valor,
                IDVALORPA: newLocalData.idvalorpa || undefined, 
                SECUENCIA: newLocalData.secuencia,
                IMAGEN: newLocalData.imagen,
                ROUTE: newLocalData.ruta, 
                DESCRIPCION: newLocalData.descripcion
            };

            const operation = {
                collection: "values", 
                action: "CREATE",
                payload: apiPayload 
            };
            
            
            this._labelService.addOperation(operation);

            const dataModel = this.getView().getModel();
                    const aLabels = dataModel.getProperty("/labels");
                
                    const aUpdatedLabels = aLabels.map(label => {
                    if (label.idetiqueta === sParentKey) {
                // Encontramos el padre
                const aChildren = label.children || [];
                return {
                    ...label,
                    children: [...aChildren, newLocalData]  // Agregar el nuevo valor
                };
            }
            return label;  
        });
            dataModel.setProperty("/labels", aUpdatedLabels);
            const oTable = this.byId("treeTable");
            if (oTable) {
                const iParentIndex = aLabels.findIndex(label => label.idetiqueta === sParentKey);
                if (iParentIndex >= 0 && !oTable.isExpanded(iParentIndex)) {
                    oTable.expand(iParentIndex);  // Mostrar el nuevo valor inmediatamente
                }
            }
            let iTotalRows = 0;
            aUpdatedLabels.forEach(parent => {
                iTotalRows++; // Contar el padre
                if (parent.children) {
                    iTotalRows += parent.children.length; // Contar los hijos
                }
            });
            dataModel.setProperty("/totalRows", iTotalRows);

            // Mostrar mensaje de éxito
            MessageToast.show("Valor agregado a la tabla. Presione 'Guardar Cambios' para confirmar.");
            this.onCloseNewValor();
        },

        /**
         * Modificar _clearNewValorForm para limpiar también el Value Help
         */
        _clearNewValorForm: function() {
            this.byId("valInputIdValor")?.setValue("");
            this.byId("valInputValor")?.setValue("");
            this.byId("valComboBoxIdValorPa")?.setSelectedKey(""); // *** LIMPIAR COMBOBOX ***
            this.byId("valClearButton")?.setVisible(false); // *** OCULTAR BOTÓN ***
            this.byId("valInputSecuencia")?.setValue("0");
            this.byId("valInputImagen")?.setValue("");
            this.byId("valInputRuta")?.setValue("");
            this.byId("valTextAreaDescripcion")?.setValue("");
        },

        // Agregar al onExit para limpiar el diálogo
        onExit: function () {
            this._pNewCatalogoDialog = null;
            this._pNewValorDialog = null;
            this._pUpdateDialog = null;
            this._pValorPadreDialog = null; // *** NUEVO ***
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

        onCloseNewValor: function () {
            this._clearNewValorForm();

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

        // Método para abrir el diálogo (inicializa el estado de validación)


        // Inicializar el modelo de validación
        _initValidationModel: function() {
            const oView = this.getView();
            const oModel = oView.getModel();
            
            // Resetear estados de validación
            oModel.setProperty("/validationState", {
                idSociedad: "None",
                idCedi: "None",
                idEtiqueta: "None",
                etiqueta: "None"
            });
        },

        // Validar todos los campos requeridos
        _validateRequiredFields: function() {
            const oView = this.getView();
            const oModel = oView.getModel();
            
            let isValid = true;
            const validationState = {
                idSociedad: "None",
                idCedi: "None",
                idEtiqueta: "None",
                etiqueta: "None"
            };
            
            // Validar ID Sociedad
            const sSociedad = oView.byId("inputIdSociedad").getValue();
            if (!sSociedad || sSociedad.trim() === "") {
                validationState.idSociedad = "Error";
                isValid = false;
            }
            
            // Validar ID CEDI
            const sCedi = oView.byId("inputIdCedi").getValue();
            if (!sCedi || sCedi.trim() === "") {
                validationState.idCedi = "Error";
                isValid = false;
            }
            
            // Validar ID Etiqueta
            const sIdEtiqueta = oView.byId("inputIdEtiqueta").getValue();
            if (!sIdEtiqueta || sIdEtiqueta.trim() === "") {
                validationState.idEtiqueta = "Error";
                isValid = false;
            }
            
            // Validar Etiqueta
            const sEtiqueta = oView.byId("inputEtiqueta").getValue();
            if (!sEtiqueta || sEtiqueta.trim() === "") {
                validationState.etiqueta = "Error";
                isValid = false;
            }
            
            // Actualizar estados visuales
            oModel.setProperty("/validationState", validationState);
            
            return isValid;
        },

        // Limpiar estados de validación
        _clearValidationStates: function() {
            const oModel = this.getView().getModel();
            oModel.setProperty("/validationState", {
                idSociedad: "None",
                idCedi: "None",
                idEtiqueta: "None",
                etiqueta: "None"
            });
        },

        onSaveNewCatalogo: function () {
            // 1. Validar campos requeridos PRIMERO
            if (!this._validateRequiredFields()) {
                MessageBox.error(
                    "Por favor, complete todos los campos marcados como obligatorios.",
                    {
                        title: "Campos Incompletos"
                    }
                );
                return;
            }
            
            // 2. Leer todos los valores del formulario del fragmento
            const oView = this.getView();
            const sSociedad = oView.byId("inputIdSociedad").getValue();
            const sCedi = oView.byId("inputIdCedi").getValue();
            const sIdEtiqueta = oView.byId("inputIdEtiqueta").getValue();
            const sEtiqueta = oView.byId("inputEtiqueta").getValue();

            // 3. Leer los Tokens del MultiInput
            const oMultiInput = oView.byId("fragmentInputIndice");
            const aTokens = oMultiInput.getTokens();

            // --- PASO 4: Preparar datos para el MODELO LOCAL y la API ---

            // Para el MODELO LOCAL (la tabla):
            const aIndiceAsObjects = aTokens.map(oToken => ({
                key: oToken.getKey(),
                text: oToken.getText()
            }));

            // Para la API (el payload):
            const sIndiceForAPI = aTokens.map(oToken => oToken.getKey()).join(',');

            // 5. Construir el objeto de datos para el MODELO LOCAL (minúsculas)
            const newData = {
                idsociedad: sSociedad,
                idcedi: sCedi,
                idetiqueta: sIdEtiqueta,
                etiqueta: sEtiqueta,
                indice: aIndiceAsObjects,
                coleccion: oView.byId("inputColeccion").getValue(),
                seccion: oView.byId("inputSeccion").getValue(),
                secuencia: parseInt(oView.byId("inputSecuencia").getValue() || "0", 10),
                imagen: oView.byId("inputImagen").getValue(),
                ruta: oView.byId("inputRuta").getValue(),
                descripcion: oView.byId("textAreaDescripcion").getValue(),
                parent: true,
                uiState: "Success" 
            };

            // 6. Construir el PAYLOAD para la API
            const apiPayload = {
                IDSOCIEDAD: newData.idsociedad,
                IDCEDI: newData.idcedi,
                IDETIQUETA: newData.idetiqueta,
                ETIQUETA: newData.etiqueta,
                INDICE: sIndiceForAPI,
                COLECCION: newData.coleccion,
                SECCION: newData.seccion,
                SECUENCIA: newData.secuencia,
                IMAGEN: newData.imagen,
                ROUTE: newData.ruta,
                DESCRIPCION: newData.descripcion
            };

            // 7. Crear la operación
            const operation = {
                collection: "labels",
                action: "CREATE",
                payload: apiPayload
            };

            // 8. Añadir al servicio
            this._labelService.addOperation(operation);

            // --- PASO 9: AÑADIR EL REGISTRO AL MODELO LOCAL ---
            const oModel = this.getView().getModel();
            const aLabels = oModel.getProperty("/labels");

            // Añadimos el nuevo registro al inicio del arreglo
            aLabels.unshift(newData); 

            // Actualizamos el modelo
            oModel.setProperty("/labels", aLabels);
            
            // (Opcional) Actualizar contador total
            const oViewModel = this.getView().getModel("view");
            oViewModel.setProperty("/totalRows", aLabels.length);

            MessageToast.show("Catálogo agregado a la tabla. Presione 'Guardar Cambios' para confirmar.");

            // 10. Cerrar y limpiar
            this.onCloseNewCatalogo();
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
        

        onSaveUpdate: function (oEvent) {
            const oDialog = oEvent?.getSource()?.getParent?.() || this._updateDialog;
            if (!oDialog) {
                MessageBox.error("No se encontró el diálogo de actualización.");
                return;
            }
            const updateModel = oDialog.getModel("update");
            if (!updateModel) {
                MessageBox.error("No se encontró el modelo 'update' en el diálogo.");
                return;
            }
            const updatedData = updateModel.getData();
        
            // Helper: tokens -> string "a,b,c"
            const tokensToString = function (value) {
                if (Array.isArray(value)) {
                    return value
                        .map(t => (typeof t === "string" ? t : (t.key || t.text || "")))
                        .filter(Boolean)
                        .join(",");
                }
                return value || "";
            };

            if (updatedData.parent === true) {
                if (!updatedData.etiqueta || updatedData.etiqueta.trim() === "") {
                    MessageBox.error("El campo 'Etiqueta' no puede estar vacío.");
                    return; 
                }
            } 
            else { 
                if (!updatedData.valor || updatedData.valor.trim() === "") {
                    MessageBox.error("El campo 'Valor' no puede estar vacío.");
                    return;
                }
            }
        
            updatedData.uiState = "Warning";
        
            let operation;
            if (updatedData.parent) {
                // UPDATE de etiqueta (labels)
                const updates = {
                    ETIQUETA: updatedData.etiqueta,
                    INDICE: tokensToString(updatedData.indice),
                    COLECCION: updatedData.coleccion || "",
                    SECCION: updatedData.seccion || "",
                    SECUENCIA: Number(updatedData.secuencia) || 0,
                    IMAGEN: updatedData.imagen || "",
                    ROUTE: updatedData.ruta || "",
                    DESCRIPCION: updatedData.descripcion || ""
                };
        
                operation = {
                    collection: "labels",
                    action: "UPDATE",
                    payload: {
                        id: updatedData.idetiqueta,
                        updates: updates
                    }
                };
            } else {
                // UPDATE de valor (values)
                const updates = {
                    VALOR: updatedData.valor,
                    ALIAS: updatedData.alias || "",
                    SECUENCIA: Number(updatedData.secuencia) || 0,
                    IMAGEN: updatedData.imagen || "",
                    ROUTE: updatedData.ruta || "",
                    DESCRIPCION: updatedData.descripcion || "",
                    IDVALORPA: updatedData.idvalorpa || undefined
                };
        
                operation = {
                    collection: "values",
                    action: "UPDATE",
                    payload: {
                        id: updatedData.idvalor,
                        updates: updates
                    }
                };
            }
        
            this._labelService.addOperation(operation);
        
            // Actualiza modelo local y cierra
            const dataModel = this.getView().getModel();
            const labels = dataModel.getProperty("/labels");
        
            if (updatedData.parent) {
                const updatedLabels = labels.map(label =>
                    label.idetiqueta === updatedData.idetiqueta ? updatedData : label
                );
                dataModel.setProperty("/labels", updatedLabels);
            } else {
                const updatedLabels = labels.map(label => {
                    if (label.idetiqueta === (updatedData.parentKey || label.idetiqueta)) {
                        return {
                            ...label,
                            children: (label.children || []).map(child =>
                                child.idvalor === updatedData.idvalor ? { ...updatedData } : child
                            )
                        };
                    }
                    return label;
                });
                dataModel.setProperty("/labels", updatedLabels);
            }
        
            oDialog.close();
            MessageToast.show("Cambios guardados localmente. La fila se marcó como Warning.");
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

        


    });
});