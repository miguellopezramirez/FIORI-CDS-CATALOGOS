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
            const viewModel = new JSONModel({
                selectedLabel: null,
                saveMessage: "",
                totalRows: 0,
                busy: false,
                selectionCount: 0
            });
            this.getView().setModel(viewModel, "view");

            const dataModel = new JSONModel({
                labels: []
            });
            this.getView().setModel(dataModel);

            var oConfigModel = this.getOwnerComponent().getModel("config");

            this._labelService = new LabelService();
            this._labelService.setConfigModel(oConfigModel); 

            this._loadLabels();

            var oEventBus = this.getOwnerComponent().getEventBus();
            oEventBus.subscribe("configChannel", "dbChanged", this._loadLabels, this);
        },

        _loadLabels: function () {
            const viewModel = this.getView().getModel("view");
            viewModel.setProperty("/busy", true);

            this._labelService.fetchLabels()
                .then((data) => {
                    const dataModel = this.getView().getModel();
                    dataModel.setProperty("/labels", data);

                    // --- LÓGICA MODIFICADA PARA COMBOS EN CASCADA ---
                    const oSociedadLabel = data.find(d => d.idetiqueta === "SOCIEDAD");
                    const aSociedades = oSociedadLabel ? oSociedadLabel.children : [];

                    const oCediLabel = data.find(d => d.idetiqueta === "CEDI");
                    const aCedis = oCediLabel ? oCediLabel.children : [];

                    // Guardamos 'allCedis' como maestra y 'cedis' como la lista filtrada (inicialmente vacía)
                    const oCatalogsModel = new JSONModel({
                        sociedades: aSociedades,
                        allCedis: aCedis, // Lista completa para filtrar después
                        cedis: [],        // Lista que se mostrará en el combo (filtrada)
                        cedisEnabled: false // Controla si el combo CEDI está habilitado
                    });
                    this.getView().setModel(oCatalogsModel, "catalogs");
                    // -------------------------------------------------

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

        // --- NUEVA FUNCIÓN: Manejar cambio de sociedad (filtrado en cascada) ---
        onSociedadChange: function(oEvent) {
            const sSelectedSociedadKey = oEvent.getParameter("selectedKey");
            this._filterCedis(sSelectedSociedadKey);
            
            // Limpiar la selección actual del CEDI al cambiar de sociedad
            const sSourceId = oEvent.getSource().getId();
            
            // Detectar si es el diálogo de Nuevo o Modificar para limpiar el input correcto
            if (sSourceId.includes("updateInputIdSociedad")) {
                this.byId("updateInputIdCedi").setSelectedKey(null);
            } else {
                this.byId("inputIdCedi").setSelectedKey(null);
            }
        },

        // --- NUEVA FUNCIÓN HELPER: Filtrar CEDIs por VALOR PADRE ---
// En Catalogos.controller.js

        _filterCedis: function(sParentKey) {
            const oCatalogsModel = this.getView().getModel("catalogs");
            const aAllCedis = oCatalogsModel.getProperty("/allCedis");
            
            if (!sParentKey) {
                oCatalogsModel.setProperty("/cedis", []);
                oCatalogsModel.setProperty("/cedisEnabled", false);
                return;
            }

            // CORRECCIÓN: Convertir ambos lados a String para asegurar que coincidan
            // independientemente de si son números o textos.
            const aFilteredCedis = aAllCedis.filter(cedi => 
                String(cedi.idvalorpa) === String(sParentKey)
            );
            
            console.log("Filtrando CEDIs para Sociedad:", sParentKey); // Para depurar
            console.log("Encontrados:", aFilteredCedis.length);        // Para depurar

            oCatalogsModel.setProperty("/cedis", aFilteredCedis);
            oCatalogsModel.setProperty("/cedisEnabled", true);
        },

        // ... (onRowSelectionChange, onTokenUpdate, onNewCatalogo se mantienen igual) ...

        onRowSelectionChange: function (oEvent) {
            const oTable = this.byId("treeTable");
            const viewModel = this.getView().getModel("view");
            const oBinding = oTable.getBinding("rows");
            let aSelectedIndices = [];
            if (oBinding) {
                aSelectedIndices = oBinding.getSelectedIndices();
            }
            viewModel.setProperty("/selectionCount", aSelectedIndices.length);

            if (aSelectedIndices.length === 1) {
                const iSelectedIndex = aSelectedIndices[0];
                const oContext = oTable.getContextByIndex(iSelectedIndex);
                const selectedRow = oContext.getObject();
                viewModel.setProperty("/selectedLabel", selectedRow);
            } else {
                viewModel.setProperty("/selectedLabel", null);
            }
        },
        
        onTokenUpdate: function (oEvent) {
            const sType = oEvent.getParameter("type");
            const oSource = oEvent.getSource();
            const oBindingContext = oSource.getBindingContext();
            if (!oBindingContext) return;
            const sBindingPath = oBindingContext.getPath();
            const oModel = this.getView().getModel();
            let aTokens = oModel.getProperty(sBindingPath + "/indice") || [];

            if (sType === "added") {
                const aAddedTokens = oEvent.getParameter("addedTokens");
                aAddedTokens.forEach(function (oToken) {
                    if (!aTokens.find(t => t.key === oToken.getKey())) {
                        aTokens.push({
                            key: oToken.getKey(),
                            text: oToken.getText()
                        });
                    }
                });
            } else if (sType === "removed") {
                const aRemovedTokens = oEvent.getParameter("removedTokens");
                const aRemovedKeys = aRemovedTokens.map(t => t.getKey());
                aTokens = aTokens.filter(function (oToken) {
                    return !aRemovedKeys.includes(oToken.key);
                });
            }
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
            
            // Al abrir nuevo, limpiamos filtros
            const oCatalogsModel = this.getView().getModel("catalogs");
            if(oCatalogsModel){
                oCatalogsModel.setProperty("/cedis", []);
                oCatalogsModel.setProperty("/cedisEnabled", false);
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

            // --- MODIFICADO: Precargar CEDIs basados en la sociedad actual ---
            if (oUpdateData.idsociedad) {
                this._filterCedis(oUpdateData.idsociedad);
            } else {
                 // Si no tiene sociedad, limpiar lista
                 const oCatalogsModel = this.getView().getModel("catalogs");
                 if(oCatalogsModel){
                    oCatalogsModel.setProperty("/cedis", []);
                    oCatalogsModel.setProperty("/cedisEnabled", false);
                 }
            }
            // ---------------------------------------------------------------

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

                const oModel = this.getView().getModel();
                const aLabels = oModel.getProperty("/labels");
                const oValueHelpData = this._prepareValueHelpData(aLabels);
                
                const oValueHelpModel = new JSONModel(oValueHelpData);
                oDialog.setModel(oValueHelpModel, "valueHelp");
            });
        },

        // ... (onDelete, _deleteRecord, onValorPadreChange se mantienen igual) ...
         onDelete: function () {
             const oTable = this.byId("treeTable");
            const aSelectedIndices = oTable.getSelectedIndices();

            if (aSelectedIndices.length === 0) {
                MessageBox.warning("Por favor, seleccione al menos un registro para eliminar.");
                return;
            }

            const aContexts = aSelectedIndices.map(iIndex => oTable.getContextByIndex(iIndex));

            MessageBox.confirm(
                `¿Está seguro de que desea marcar ${aSelectedIndices.length} registro(s) para eliminación?`,
                {
                    title: "Confirmar eliminación",
                    onClose: (oAction) => {
                        if (oAction === MessageBox.Action.OK) {
                            const oModel = this.getView().getModel();
                            aContexts.forEach(oContext => {
                                if (!oContext) return;
                                const oRecord = oContext.getObject();
                                const sPath = oContext.getPath();
                                this._deleteRecord(oRecord);
                                oModel.setProperty(sPath + "/uiState", "Error"); 
                            });
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
            const sCollection = record.parent ? "labels" : "values";
            const sId = record.parent ? record.idetiqueta : record.idvalor;

            const operation = {
                collection: sCollection, 
                action: "DELETE",
                payload: {
                    id: sId
                }
            };
            this._labelService.addOperation(operation);
        },

        onValorPadreChange: function(oEvent) {
             const sValue = oEvent.getParameter("value");
            const oSelectedItem = oEvent.getParameter("selectedItem");
            const oDialog = oEvent.getSource().getParent().getParent().getParent();
            const oValorModel = oDialog.getModel("newValor");
            oValorModel.setProperty("/idvalorpa", sValue);
        },

        // ... (_prepareValueHelpData, onNewValor, onValorPadreComboChange etc. igual) ...

        _prepareValueHelpData: function(aLabels) {
            const aFlatItems = [];
            const aGroupedItems = [];
            aLabels.forEach(oLabel => {
                const aChildren = oLabel.children || oLabel.subRows || [];
                if (aChildren.length > 0) {
                    aGroupedItems.push({
                        isGroup: true,
                        etiqueta: oLabel.etiqueta,
                        idetiqueta: oLabel.idetiqueta
                    });
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
                const oValorModel = new JSONModel({
                    parentKey: oSelectedObject.idetiqueta,
                    idsociedad: oSelectedObject.idsociedad,
                    idcedi: oSelectedObject.idcedi,
                    idvalorpa: null,
                    idvalorpaDisplay: ""
                });
                oDialog.setModel(oValorModel, "newValor");
                const oModel = this.getView().getModel();
                const aLabels = oModel.getProperty("/labels");
                const oValueHelpData = this._prepareValueHelpData(aLabels);
                const oValueHelpModel = new JSONModel(oValueHelpData);
                oDialog.setModel(oValueHelpModel, "valueHelp");
                this._clearNewValorForm();
                oDialog.open();
            });
        },

        onValorPadreComboChange: function(oEvent) {
             const oSelectedItem = oEvent.getParameter("selectedItem");
            if (oSelectedItem) {
                const sIdValor = oSelectedItem.getKey();
                const oDialog = oEvent.getSource().getParent().getParent().getParent().getParent();
                const oValorModel = oDialog.getModel("newValor");
                oValorModel.setProperty("/idvalorpa", sIdValor);
                oValorModel.setProperty("/idvalorpaDisplay", oSelectedItem.getText());
                this.byId("valClearButton").setVisible(true);
            }
        },
        
        onOpenValorPadreDialog: function(oEvent) {
            const oParentDialog = oEvent.getSource().getParent().getParent().getParent().getParent();
            const oValueHelpModel = oParentDialog.getModel("valueHelp");
            const oValorModel = oParentDialog.getModel("newValor");
            const sCurrentValue = oValorModel.getProperty("/idvalorpa");
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
                oDialog.setModel(oValueHelpModel, "valueHelp");
                const oSearchField = Fragment.byId(this.getView().getId(), "valorPadreSearchField");
                if (oSearchField) {
                    oSearchField.setValue("");
                }
                oDialog.open();
            });
        },

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
                const sIdValor = oData.idvalor;
                const sValor = oData.valor;
                
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
                    const oComboBox = this.byId("valComboBoxIdValorPa");
                    if (oComboBox) {
                        oComboBox.setSelectedKey(sIdValor);
                    }
                    const oClearButton = this.byId("valClearButton");
                    if (oClearButton) {
                        oClearButton.setVisible(true);
                    }
                }
                this.onCloseValorPadreDialog();
            }
        },

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
                const oComboBox = this.byId("valComboBoxIdValorPa");
                if (oComboBox) {
                    oComboBox.setSelectedKey("");
                }
                this.byId("valClearButton").setVisible(false);
            }
            this.onCloseValorPadreDialog();
        },

        onCloseValorPadreDialog: function() {
             if (this._pValorPadreDialog) {
                this._pValorPadreDialog.then((oDialog) => {
                    oDialog.close();
                });
            }
        },

        onClearValorPadre: function(oEvent) {
            const oDialog = oEvent.getSource().getParent().getParent().getParent().getParent();
            const oValorModel = oDialog.getModel("newValor");
            oValorModel.setProperty("/idvalorpa", null);
            oValorModel.setProperty("/idvalorpaDisplay", "");
            const oComboBox = this.byId("valComboBoxIdValorPa");
            if (oComboBox) {
                oComboBox.setSelectedKey("");
            }
            oEvent.getSource().setVisible(false);
        },

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
            const sIdValorPa = oValorModel.getProperty("/idvalorpa"); 

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
                idvalorpa: sIdValorPa || null, 
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
                    const aChildren = label.children || [];
                    return {
                        ...label,
                        children: [...aChildren, newLocalData] 
                    };
                }
                return label;  
            });
            dataModel.setProperty("/labels", aUpdatedLabels);
            const oTable = this.byId("treeTable");
            if (oTable) {
                const iParentIndex = aLabels.findIndex(label => label.idetiqueta === sParentKey);
                if (iParentIndex >= 0 && !oTable.isExpanded(iParentIndex)) {
                    oTable.expand(iParentIndex); 
                }
            }
            let iTotalRows = 0;
            aUpdatedLabels.forEach(parent => {
                iTotalRows++; 
                if (parent.children) {
                    iTotalRows += parent.children.length; 
                }
            });
            dataModel.setProperty("/totalRows", iTotalRows);
            MessageToast.show("Valor agregado a la tabla. Presione 'Guardar Cambios' para confirmar.");
            this.onCloseNewValor();
        },

        _clearNewValorForm: function() {
            this.byId("valInputIdValor")?.setValue("");
            this.byId("valInputValor")?.setValue("");
            this.byId("valComboBoxIdValorPa")?.setSelectedKey(""); 
            this.byId("valClearButton")?.setVisible(false); 
            this.byId("valInputSecuencia")?.setValue("0");
            this.byId("valInputImagen")?.setValue("");
            this.byId("valInputRuta")?.setValue("");
            this.byId("valTextAreaDescripcion")?.setValue("");
        },

        onExit: function () {
            this._pNewCatalogoDialog = null;
            this._pNewValorDialog = null;
            this._pUpdateDialog = null;
            this._pValorPadreDialog = null; 
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
                oBinding.filter([]); 
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

        onFragmentSubmit: function (oEvent) {
             const oMultiInput = oEvent.getSource();
            const sValue = oEvent.getParameter("value"); 

            if (sValue && sValue.trim() !== "") {
                const oNewToken = new Token({
                    key: sValue.trim(),
                    text: sValue.trim()
                });
                oMultiInput.addToken(oNewToken);
            }
            oMultiInput.setValue("");
        },

        _initValidationModel: function() {
             const oView = this.getView();
            const oModel = oView.getModel();
            oModel.setProperty("/validationState", {
                idSociedad: "None",
                idCedi: "None",
                idEtiqueta: "None",
                etiqueta: "None"
            });
        },

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
            
            // --- MODIFICADO: Eliminadas las validaciones de Sociedad y CEDI ---
            // Ya no son obligatorios
            // -----------------------------------------------------------------
            
            const sIdEtiqueta = oView.byId("inputIdEtiqueta").getValue();
            if (!sIdEtiqueta || sIdEtiqueta.trim() === "") {
                validationState.idEtiqueta = "Error";
                isValid = false;
            }
            
            const sEtiqueta = oView.byId("inputEtiqueta").getValue();
            if (!sEtiqueta || sEtiqueta.trim() === "") {
                validationState.etiqueta = "Error";
                isValid = false;
            }
            
            oModel.setProperty("/validationState", validationState);
            
            return isValid;
        },

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
            if (!this._validateRequiredFields()) {
                MessageBox.error(
                    "Por favor, complete todos los campos marcados como obligatorios.",
                    { title: "Campos Incompletos" }
                );
                return;
            }
            
            const oView = this.getView();
            
            // Obtener valores (pueden ser vacíos ahora)
            const sSociedad = oView.byId("inputIdSociedad").getSelectedKey() || "";
            const sCedi = oView.byId("inputIdCedi").getSelectedKey() || "";
            
            const sIdEtiqueta = oView.byId("inputIdEtiqueta").getValue();
            const sEtiqueta = oView.byId("inputEtiqueta").getValue();

            const oMultiInput = oView.byId("fragmentInputIndice");
            const aTokens = oMultiInput.getTokens();

            const aIndiceAsObjects = aTokens.map(oToken => ({
                key: oToken.getKey(),
                text: oToken.getText()
            }));

            const sIndiceForAPI = aTokens.map(oToken => oToken.getKey()).join(',');

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

            const operation = {
                collection: "labels",
                action: "CREATE",
                payload: apiPayload
            };

            this._labelService.addOperation(operation);

            const oModel = this.getView().getModel();
            const aLabels = oModel.getProperty("/labels");

            aLabels.unshift(newData); 

            oModel.setProperty("/labels", aLabels);
            
            const oViewModel = this.getView().getModel("view");
            oViewModel.setProperty("/totalRows", aLabels.length);

            MessageToast.show("Catálogo agregado a la tabla. Presione 'Guardar Cambios' para confirmar.");
            this.onCloseNewCatalogo();
        },

        onCloseNewCatalogo: function () {
            this.byId("inputIdSociedad")?.setSelectedKey("");
            this.byId("inputIdCedi")?.setSelectedKey("");
            
            // Resetear filtro de CEDIs
            const oCatalogsModel = this.getView().getModel("catalogs");
            if(oCatalogsModel) {
                oCatalogsModel.setProperty("/cedis", []);
                oCatalogsModel.setProperty("/cedisEnabled", false);
            }
            
            this.byId("inputIdEtiqueta")?.setValue("");
            this.byId("inputEtiqueta")?.setValue("");
            this.byId("fragmentInputIndice")?.setTokens([]); 
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
                const updates = {
                    IDSOCIEDAD: updatedData.idsociedad,
                    IDCEDI: updatedData.idcedi,
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
                const updates = {
                    IDSOCIEDAD: updatedData.idsociedad,
                    IDCEDI: updatedData.idcedi,
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
                        and: false 
                    })
                );
            }
            oBinding.filter(aFilters);
        },

    });
});