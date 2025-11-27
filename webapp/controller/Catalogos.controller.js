sap.ui.define(
  [
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "com/cat/sapfioricatalogs/service/labelService",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/ui/core/Fragment",
    "sap/m/Token",
    "com/cat/sapfioricatalogs/util/formatter",
  ],
  function (
    Controller,
    JSONModel,
    LabelService,
    MessageBox,
    MessageToast,
    Fragment,
    Token,
    formatter
  ) {
    "use strict";

    return Controller.extend("com.cat.sapfioricatalogs.controller.Catalogos", {
      onInit: function () {
        const viewModel = new JSONModel({
          selectedLabel: null,
          saveMessage: "",
          totalRows: 0,
          busy: false,
          selectionCount: 0,
        });
        this.getView().setModel(viewModel, "view");

        const dataModel = new JSONModel({
          labels: [],
        });
        this.getView().setModel(dataModel);

        // --- NUEVO: Modelo para controlar el botón de Operaciones Pendientes ---
        const pendingModel = new JSONModel({
            operations: [],
            count: 0
        });
        this.getView().setModel(pendingModel, "pending");
        // -----------------------------------------------------------------------

        var oConfigModel = this.getOwnerComponent().getModel("config");

        this._labelService = new LabelService();
        this._labelService.setConfigModel(oConfigModel);

        this._loadLabels();

        var oEventBus = this.getOwnerComponent().getEventBus();
        oEventBus.subscribe(
          "configChannel",
          "dbChanged",
          this._loadLabels,
          this
        );
      },

      _loadLabels: function () {
        const viewModel = this.getView().getModel("view");
        viewModel.setProperty("/busy", true);

            this._labelService.fetchLabels()
                .then((data) => {
                    const dataModel = this.getView().getModel();
                    dataModel.setProperty("/labels", data);
                    // Guardamos copia maestra para el buscador recursivo
                    dataModel.setProperty("/masterLabels", JSON.parse(JSON.stringify(data)));

            // --- LÓGICA MODIFICADA PARA COMBOS EN CASCADA ---
            const oSociedadLabel = data.find(
              (d) => d.idetiqueta === "SOCIEDAD"
            );
            const aSociedades = oSociedadLabel ? oSociedadLabel.children : [];

            const oCediLabel = data.find((d) => d.idetiqueta === "CEDI");
            const aCedis = oCediLabel ? oCediLabel.children : [];

            // Guardamos 'allCedis' como maestra y 'cedis' como la lista filtrada (inicialmente vacía)
            const oCatalogsModel = new JSONModel({
              sociedades: aSociedades,
              allCedis: aCedis, // Lista completa para filtrar después
              cedis: [], // Lista que se mostrará en el combo (filtrada)
              cedisEnabled: false, // Controla si el combo CEDI está habilitado
            });
            this.getView().setModel(oCatalogsModel, "catalogs");
            // -------------------------------------------------

            // Actualizar estados visuales por si había operaciones pendientes en memoria (caso raro pero posible)
            this._refreshUiStates();

            let totalRows = data.length;
            data.forEach((parent) => {
              if (parent.children) {
                totalRows += parent.children.length;
              }
            });
            viewModel.setProperty("/totalRows", totalRows);

            MessageToast.show("Datos cargados correctamente");
          })
          .catch((error) => {
            // Ahora solo captura errores de sintaxis críticos, no de red (manejados en service)
            MessageBox.error("Error al cargar los datos: " + error.message);
          })
          .finally(() => {
            viewModel.setProperty("/busy", false);
          });
      },

      // --- NUEVA FUNCIÓN CLAVE: Recalcular colores (Status) y Contador ---
      _refreshUiStates: function() {
            const oModel = this.getView().getModel();
            const aLabels = oModel.getProperty("/labels"); // Datos actuales de la tabla
            const aOps = this._labelService.getOperations(); // Operaciones pendientes del servicio
            
            // 1. Crear un mapa rápido para búsquedas:  "ID" -> "ACTION"
            // Esto evita loops anidados ineficientes
            const opMap = {};
            aOps.forEach(op => {
                const sId = op.id; 
                opMap[sId] = op.action;
            });

            // 2. Función recursiva para actualizar la propiedad uiState en cada fila
            const updateRowState = (row) => {
                const sId = row.idetiqueta || row.idvalor;
                
                // Reseteamos estado por defecto
                row.uiState = "None"; 

                // Si este ID tiene una operación pendiente, asignamos color
                if (opMap[sId]) {
                    const action = opMap[sId];
                    if (action === 'CREATE') row.uiState = "Success";      // Verde
                    else if (action === 'UPDATE') row.uiState = "Warning"; // Naranja
                    else if (action === 'DELETE') row.uiState = "Error";   // Rojo
                }

                // Recursividad para hijos
                if (row.children && row.children.length > 0) {
                    row.children.forEach(updateRowState);
                }
            };

            // 3. Ejecutar en toda la data y refrescar modelo
            // Usamos JSON parse/stringify para asegurar que la tabla detecte el cambio profundo en objetos
            const aNewLabels = JSON.parse(JSON.stringify(aLabels));
            aNewLabels.forEach(updateRowState);
            
            oModel.setProperty("/labels", aNewLabels);
            
            // 4. Actualizar modelo de pendientes (Esto controla si el botón se ve o no)
            const pendingModel = this.getView().getModel("pending");
            pendingModel.setProperty("/operations", aOps);
            pendingModel.setProperty("/count", aOps.length);
      },

      // --- NUEVAS FUNCIONES PARA LA MODAL DE PENDIENTES (Deshacer) ---

      onOpenPendingOps: function() {
            if (!this._pPendingDialog) {
                this._pPendingDialog = this.loadFragment({
                    name: "com.cat.sapfioricatalogs.view.fragments.PendingOperations"
                }).then((oDialog) => {
                    this.getView().addDependent(oDialog);
                    return oDialog;
                });
            }
            this._pPendingDialog.then((oDialog) => {
                // Nos aseguramos de tener los datos frescos
                this._refreshUiStates(); 
                oDialog.open();
            });
      },

      onUndoOperation: function(oEvent) {
            // Obtener el item que se clickeó en la lista
            const oItem = oEvent.getSource().getParent().getParent();
            const sPath = oItem.getBindingContext("pending").getPath();
            const iIndex = parseInt(sPath.split("/").pop()); // Obtener índice del array

            const aOps = this._labelService.getOperations();
            const opToRemove = aOps[iIndex];

            // 1. Eliminar del servicio
            this._labelService.removeOperation(iIndex);

            // 2. Lógica visual de "Revertir":
            // Si era un CREATE, tenemos que quitar la fila de la tabla visualmente ya que no existe en BD.
            if (opToRemove.action === 'CREATE') {
                this._removeRowFromTable(opToRemove.id);
            }

            // 3. Recalcular estados (quita colores rojos/naranjas) y actualiza el contador
            this._refreshUiStates();
            
            // Si ya no hay operaciones, cerramos la modal automáticamente
            if (this._labelService.getOperations().length === 0) {
                this.onClosePendingOps();
            }
      },

      _removeRowFromTable: function(sId) {
            const oModel = this.getView().getModel();
            let aLabels = oModel.getProperty("/labels");
            
            // Filtro recursivo para eliminar el ID de la estructura de árbol
            const filterOut = (list) => {
                return list.filter(item => {
                    const itemId = item.idetiqueta || item.idvalor;
                    if (itemId === sId) return false; // Lo sacamos
                    if (item.children) {
                        item.children = filterOut(item.children); // Filtramos hijos
                        // Actualizamos subRows para compatibilidad
                        item.subRows = item.children; 
                    }
                    return true;
                });
            };
            
            const filteredLabels = filterOut(aLabels);
            oModel.setProperty("/labels", filteredLabels);
            
            // Actualizar contador de filas total
            let iTotalRows = 0;
            filteredLabels.forEach(parent => {
                iTotalRows++;
                if (parent.children) iTotalRows += parent.children.length;
            });
            this.getView().getModel("view").setProperty("/totalRows", iTotalRows);
      },

      onClosePendingOps: function() {
            if (this._pPendingDialog) {
                this._pPendingDialog.then((oDialog) => oDialog.close());
            }
      },

      // ------------------------------------------------------------------

      getCediDescription: function (idcedi) {
        return formatter.getCediDescription(idcedi, this);
      },

      getSociedadDescription: function (idsociedad) {
        return formatter.getSociedadDescription(idsociedad, this);
      },

      getValorPadreDescription: function (idvalorpa) {
        return formatter.getValorPadreDescription(idvalorpa, this);
      },

      onSociedadChange: function (oEvent) {
        const sSelectedSociedadKey = oEvent.getParameter("selectedKey");
        this._filterCedis(sSelectedSociedadKey);

        const sSourceId = oEvent.getSource().getId();

        // Detectar si es el diálogo de Nuevo o Modificar para limpiar el input correcto
        if (sSourceId.includes("updateInputIdSociedad")) {
          this.byId("updateInputIdCedi").setSelectedKey(null);
        } else {
          this.byId("inputIdCedi").setSelectedKey(null);
        }
      },

      // Helper para filtrar CEDIs
      _filterCedis: function (sParentKey) {
        const oCatalogsModel = this.getView().getModel("catalogs");
        const aAllCedis = oCatalogsModel.getProperty("/allCedis");

        if (!sParentKey) {
          oCatalogsModel.setProperty("/cedis", []);
          oCatalogsModel.setProperty("/cedisEnabled", false);
          return;
        }

        const aFilteredCedis = aAllCedis.filter(
          (cedi) => String(cedi.idvalorpa) === String(sParentKey)
        );

        oCatalogsModel.setProperty("/cedis", aFilteredCedis);
        oCatalogsModel.setProperty("/cedisEnabled", true);
      },

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
            if (!aTokens.find((t) => t.key === oToken.getKey())) {
              aTokens.push({
                key: oToken.getKey(),
                text: oToken.getText(),
              });
            }
          });
        } else if (sType === "removed") {
          const aRemovedTokens = oEvent.getParameter("removedTokens");
          const aRemovedKeys = aRemovedTokens.map((t) => t.getKey());
          aTokens = aTokens.filter(function (oToken) {
            return !aRemovedKeys.includes(oToken.key);
          });
        }
        oModel.setProperty(sBindingPath + "/indice", aTokens);
      },

      onNewCatalogo: function () {
        if (!this._pNewCatalogoDialog) {
          this._pNewCatalogoDialog = this.loadFragment({
            name: "com.cat.sapfioricatalogs.view.fragments.NewCatalogo",
          }).then((oDialog) => {
            this.getView().addDependent(oDialog);
            return oDialog;
          });
        }

        // Al abrir nuevo, limpiamos filtros
        const oCatalogsModel = this.getView().getModel("catalogs");
        if (oCatalogsModel) {
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
          MessageBox.error(
            "Por favor, seleccione una única fila para modificar."
          );
          return;
        }
        const oContext = oTable.getContextByIndex(aSelectedIndices[0]);
        const oSelectedData = oContext.getObject();
        const oUpdateData = JSON.parse(JSON.stringify(oSelectedData));

        // --- VALIDACIÓN DE CONFLICTO (Borrado vs Edición) ---
            // Si el estado es "Error" (Rojo), significa que está pendiente de DELETE.
            if (oSelectedData.uiState === "Error") {
                MessageBox.warning(
                    "No puede modificar este registro porque está marcado para eliminarse.\n\n" +
                    "Si desea conservarlo, vaya a 'Operaciones Pendientes' y deshaga la eliminación primero."
                );
                return; // DETENEMOS LA EJECUCIÓN AQUÍ
            }

        if (oUpdateData.idsociedad) {
          this._filterCedis(oUpdateData.idsociedad);
        } else {
          const oCatalogsModel = this.getView().getModel("catalogs");
          if (oCatalogsModel) {
            oCatalogsModel.setProperty("/cedis", []);
            oCatalogsModel.setProperty("/cedisEnabled", false);
          }
        }

        if (!this._pUpdateDialog) {
          this._pUpdateDialog = this.loadFragment({
            name: "com.cat.sapfioricatalogs.view.fragments.UpdateCatalogo",
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

          const oClearButton = this.byId("valClearButton_2");
          if (oClearButton) {
            oClearButton.setVisible(!!oUpdateData.idvalorpa);
          }
        });
      },

      // --- MODIFICADO: Usar _refreshUiStates para DELETE ---
      onDelete: function () {
        const oTable = this.byId("treeTable");
        const aSelectedIndices = oTable.getSelectedIndices();

        if (aSelectedIndices.length === 0) {
          MessageBox.warning(
            "Por favor, seleccione al menos un registro para eliminar."
          );
          return;
        }

        const aContexts = aSelectedIndices.map((iIndex) =>
          oTable.getContextByIndex(iIndex)
        );

        MessageBox.confirm(
          `¿Está seguro de que desea marcar ${aSelectedIndices.length} registro(s) para eliminación?`,
          {
            title: "Confirmar eliminación",
            onClose: (oAction) => {
              if (oAction === MessageBox.Action.OK) {
                const oModel = this.getView().getModel();
                aContexts.forEach((oContext) => {
                  if (!oContext) return;
                  const oRecord = oContext.getObject();
                  const sPath = oContext.getPath();
                  
                  // Agregar operación al servicio
                  this._deleteRecord(oRecord);
                  
                  // YA NO seteamos manualmente el estado 'Error' aquí
                  // oModel.setProperty(sPath + "/uiState", "Error"); 
                });
                
                // Refrescamos los estados centralmente (esto pintará de rojo)
                this._refreshUiStates();

                oTable.clearSelection();
                this.getView().getModel("view").setProperty("/selectionCount", 0);
                this.getView().getModel("view").setProperty("/selectedLabel", null);
                MessageToast.show(
                  "Registros marcados para eliminar. Presione 'Guardar Cambios' para confirmar."
                );
              }
            },
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
            id: sId,
          },
        };
        this._labelService.addOperation(operation);
      },

      onValorPadreChange: function (oEvent) {
        const sValue = oEvent.getParameter("value");
        const oSelectedItem = oEvent.getParameter("selectedItem");
        const oDialog = oEvent.getSource().getParent().getParent().getParent();
        const oValorModel = oDialog.getModel("newValor");
        oValorModel.setProperty("/idvalorpa", sValue);
      },

      _prepareValueHelpData: function (aLabels) {
        const aFlatItems = [];
        const aGroupedItems = [];
        aLabels.forEach((oLabel) => {
          const aChildren = oLabel.children || oLabel.subRows || [];
          if (aChildren.length > 0) {
            aGroupedItems.push({
              isGroup: true,
              etiqueta: oLabel.etiqueta,
              idetiqueta: oLabel.idetiqueta,
            });
            aChildren.forEach((oChild) => {
              const oItem = {
                idvalor: oChild.idvalor,
                valor: oChild.valor,
                etiqueta: oLabel.etiqueta,
                idetiqueta: oLabel.idetiqueta,
                isGroup: false,
                selected: false,
              };
              aFlatItems.push(oItem);
              aGroupedItems.push(oItem);
            });
          }
        });
        return {
          flatItems: aFlatItems,
          groupedItems: aGroupedItems,
        };
      },

      onNewValor: function () {
        const oViewModel = this.getView().getModel("view");
        const oSelectedObject = oViewModel.getProperty("/selectedLabel");

        if (!oSelectedObject) {
          MessageBox.error(
            "Por favor, seleccione un catálogo (fila padre) primero."
          );
          return;
        }
        if (oSelectedObject.parent !== true) {
          MessageBox.error(
            "Solo puede agregar valores a un catálogo (fila padre)."
          );
          return;
        }
        if (!this._pNewValorDialog) {
          this._pNewValorDialog = this.loadFragment({
            name: "com.cat.sapfioricatalogs.view.fragments.NewValor",
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
            idvalorpaDisplay: "",
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

      _getParentDialog: function (oControl) {
        let oParent = oControl.getParent();
        while (oParent) {
          if (oParent.isA("sap.m.Dialog")) {
            return oParent;
          }
          oParent = oParent.getParent();
        }
        return null;
      },

      onValorPadreComboChange: function (oEvent) {
        const oSelectedItem = oEvent.getParameter("selectedItem");
        const oComboBox = oEvent.getSource();
        const sComboBoxId = oComboBox.getId();

        if (oSelectedItem) {
          const sIdValor = oSelectedItem.getKey();
          const oDialog = this._getParentDialog(oComboBox);

          if (!oDialog) return;

          let sModelName = "newValor";
          let sClearBtnId = "valClearButton";

          if (sComboBoxId.includes("valComboBoxIdValorPa_2")) {
            sModelName = "update";
            sClearBtnId = "valClearButton_2";
          }

          const oValorModel = oDialog.getModel(sModelName);
          if (oValorModel) {
            oValorModel.setProperty("/idvalorpa", sIdValor);
            oValorModel.setProperty(
              "/idvalorpaDisplay",
              oSelectedItem.getText()
            );
          }

          const oClearButton = this.byId(sClearBtnId);
          if (oClearButton) {
            oClearButton.setVisible(true);
          }
        }
      },

      onOpenValorPadreDialog: function (oEvent) {
        const oButton = oEvent.getSource();
        const oParentDialog = this._getParentDialog(oButton);

        if (!oParentDialog) {
          console.error("No se pudo encontrar el diálogo padre");
          return;
        }

        const oValueHelpModel = oParentDialog.getModel("valueHelp");

        let sModelName = "newValor";
        if (oParentDialog.getTitle() === "Modificar Registro") {
          sModelName = "update";
        }

        const oValorModel = oParentDialog.getModel(sModelName);
        if (!oValorModel) {
          console.error("No se encontró el modelo " + sModelName);
          return;
        }

        const sCurrentValue = oValorModel.getProperty("/idvalorpa");

        const aGroupedItems = oValueHelpModel.getProperty("/groupedItems");
        aGroupedItems.forEach((item) => {
          if (!item.isGroup) {
            item.selected = item.idvalor === sCurrentValue;
          }
        });
        oValueHelpModel.setProperty("/groupedItems", aGroupedItems);

        if (!this._pValorPadreDialog) {
          this._pValorPadreDialog = this.loadFragment({
            name: "com.cat.sapfioricatalogs.view.fragments.ValorPadreDialog",
          }).then((oDialog) => {
            this.getView().addDependent(oDialog);
            return oDialog;
          });
        }
        this._pValorPadreDialog.then((oDialog) => {
          oDialog.setModel(oValueHelpModel, "valueHelp");
          const oSearchField = Fragment.byId(
            this.getView().getId(),
            "valorPadreSearchField"
          );
          if (oSearchField) {
            oSearchField.setValue("");
          }
          oDialog.open();
        });
      },

      onSearchValorPadre: function (oEvent) {
        const sQuery = oEvent.getParameter("newValue");
        const oList = Fragment.byId(this.getView().getId(), "valorPadreList");
        const oBinding = oList.getBinding("items");

        if (!oBinding) return;

        const aFilters = [];
        if (sQuery) {
          aFilters.push(
            new sap.ui.model.Filter({
              filters: [
                new sap.ui.model.Filter(
                  "valor",
                  sap.ui.model.FilterOperator.Contains,
                  sQuery
                ),
                new sap.ui.model.Filter(
                  "etiqueta",
                  sap.ui.model.FilterOperator.Contains,
                  sQuery
                ),
              ],
              and: false,
            })
          );
        }
        oBinding.filter(aFilters);
      },

      onSelectValorPadreFromDialog: function (oEvent) {
        const oSelectedItem = oEvent.getParameter("listItem");
        if (oSelectedItem) {
          const oContext = oSelectedItem.getBindingContext("valueHelp");
          const oData = oContext.getObject();
          const sIdValor = oData.idvalor;
          const sValor = oData.valor;

          const aDialogs = this.getView().getDependents();
          let oParentDialog = null;
          let sModelName = "newValor";
          let sComboBoxId = "valComboBoxIdValorPa";
          let sClearBtnId = "valClearButton";

          for (let i = 0; i < aDialogs.length; i++) {
            const oDlg = aDialogs[i];
            if (
              oDlg.getMetadata().getName() === "sap.m.Dialog" &&
              oDlg.isOpen()
            ) {
              if (oDlg.getTitle() === "Nuevo Valor") {
                oParentDialog = oDlg;
                sModelName = "newValor";
                sComboBoxId = "valComboBoxIdValorPa";
                sClearBtnId = "valClearButton";
                break;
              } else if (oDlg.getTitle() === "Modificar Registro") {
                oParentDialog = oDlg;
                sModelName = "update";
                sComboBoxId = "valComboBoxIdValorPa_2";
                sClearBtnId = "valClearButton_2";
                break;
              }
            }
          }

          if (oParentDialog) {
            const oValorModel = oParentDialog.getModel(sModelName);
            if (oValorModel) {
              oValorModel.setProperty("/idvalorpa", sIdValor);
              oValorModel.setProperty("/idvalorpaDisplay", sValor);
            }

            const oComboBox = this.byId(sComboBoxId);
            if (oComboBox) {
              oComboBox.setSelectedKey(sIdValor);
            }
            const oClearButton = this.byId(sClearBtnId);
            if (oClearButton) {
              oClearButton.setVisible(true);
            }
          }
          this.onCloseValorPadreDialog();
        }
      },

      onClearValorPadreFromDialog: function () {
        const aDialogs = this.getView().getDependents();
        let oParentDialog = null;
        let sModelName = "newValor";
        let sComboBoxId = "valComboBoxIdValorPa";
        let sClearBtnId = "valClearButton";

        for (let i = 0; i < aDialogs.length; i++) {
          const oDlg = aDialogs[i];
          if (
            oDlg.getMetadata().getName() === "sap.m.Dialog" &&
            oDlg.isOpen()
          ) {
            if (oDlg.getTitle() === "Nuevo Valor") {
              oParentDialog = oDlg;
              sModelName = "newValor";
              sComboBoxId = "valComboBoxIdValorPa";
              sClearBtnId = "valClearButton";
              break;
            } else if (oDlg.getTitle() === "Modificar Registro") {
              oParentDialog = oDlg;
              sModelName = "update";
              sComboBoxId = "valComboBoxIdValorPa_2";
              sClearBtnId = "valClearButton_2";
              break;
            }
          }
        }

        if (oParentDialog) {
          const oValorModel = oParentDialog.getModel(sModelName);
          if (oValorModel) {
            oValorModel.setProperty("/idvalorpa", null);
            oValorModel.setProperty("/idvalorpaDisplay", "");
          }

          const oComboBox = this.byId(sComboBoxId);
          if (oComboBox) {
            oComboBox.setSelectedKey(null);
          }
          const oClearButton = this.byId(sClearBtnId);
          if (oClearButton) {
            oClearButton.setVisible(false);
          }
        }
        this.onCloseValorPadreDialog();
      },

      onCloseValorPadreDialog: function () {
        if (this._pValorPadreDialog) {
          this._pValorPadreDialog.then((oDialog) => {
            oDialog.close();
          });
        }
      },

      onClearValorPadre: function (oEvent) {
        const oButton = oEvent.getSource();
        const sButtonId = oButton.getId();
        const oDialog = oButton.getParent().getParent().getParent().getParent(); // Dialog

        let sModelName = "newValor";
        let sComboBoxId = "valComboBoxIdValorPa";

        if (sButtonId.includes("valClearButton_2")) {
          sModelName = "update";
          sComboBoxId = "valComboBoxIdValorPa_2";
        }

        const oValorModel = oDialog.getModel(sModelName);
        if (oValorModel) {
          oValorModel.setProperty("/idvalorpa", null);
          oValorModel.setProperty("/idvalorpaDisplay", "");
        }

        const oComboBox = this.byId(sComboBoxId);
        if (oComboBox) {
          oComboBox.setSelectedKey(null);
        }
        oButton.setVisible(false);
      },

      // --- MODIFICADO: Usar _refreshUiStates para CREATE ---
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

        // RECOLECTAR ERRORES CON FORMATO { field, msg }
        const aErrors = [];
        if (!sIdValor || sIdValor.trim() === "") {
          aErrors.push({ field: "ID Valor", msg: "El ID del valor es requerido." });
        }
        if (!sValor || sValor.trim() === "") {
          aErrors.push({ field: "Valor", msg: "El texto del valor es requerido." });
        }

        // LLAMADA AL DIALOGO SI HAY ERRORES
        if (aErrors.length > 0) {
          this._showErrorDialog("Errores en el formulario de Valor:", aErrors);
          return;
        }

        const newLocalData = {
          idsociedad: sSociedad,
          idcedi: sCedi,
          idvalor: sIdValor,
          valor: sValor,
          idvalorpa: sIdValorPa || null,
          secuencia: parseInt(
            oView.byId("valInputSecuencia").getValue() || "0",
            10
          ),
          imagen: oView.byId("valInputImagen").getValue(),
          ruta: oView.byId("valInputRuta").getValue(),
          descripcion: oView.byId("valTextAreaDescripcion").getValue(),
          parent: false,
          // uiState: "Success", // YA NO LO PONEMOS MANUALMENTE
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
          DESCRIPCION: newLocalData.descripcion,
        };

        const operation = {
          collection: "values",
          action: "CREATE",
          payload: apiPayload,
        };

        this._labelService.addOperation(operation);

        const dataModel = this.getView().getModel();
        const aLabels = dataModel.getProperty("/labels");

        const aUpdatedLabels = aLabels.map((label) => {
          if (label.idetiqueta === sParentKey) {
            const aChildren = label.children || [];
            // Validamos duplicados visuales (opcional, pero buena práctica)
            if (!aChildren.find(c => c.idvalor === newLocalData.idvalor)) {
                return {
                    ...label,
                    children: [...aChildren, newLocalData],
                };
            }
          }
          return label;
        });
        dataModel.setProperty("/labels", aUpdatedLabels);
        
        // Refrescar estados visuales (aquí se pintará de verde)
        this._refreshUiStates();

        const oTable = this.byId("treeTable");
        if (oTable) {
          const iParentIndex = aLabels.findIndex(
            (label) => label.idetiqueta === sParentKey
          );
          if (iParentIndex >= 0 && !oTable.isExpanded(iParentIndex)) {
            oTable.expand(iParentIndex);
          }
        }
        let iTotalRows = 0;
        aUpdatedLabels.forEach((parent) => {
          iTotalRows++;
          if (parent.children) {
            iTotalRows += parent.children.length;
          }
        });
        dataModel.setProperty("/totalRows", iTotalRows);
        MessageToast.show(
          "Valor agregado a la tabla. Presione 'Guardar Cambios' para confirmar."
        );
        this.onCloseNewValor();
      },

      _clearNewValorForm: function () {
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
        this._pPendingDialog = null;
      },

      onSaveChanges: function () {
        const viewModel = this.getView().getModel("view");
        viewModel.setProperty("/busy", true);

        this._labelService
          .saveChanges()
          .then((result) => {
            if (result.success) {
              viewModel.setProperty("/saveMessage", result.message);

              setTimeout(() => {
                viewModel.setProperty("/saveMessage", "");
              }, 3000);

              this._loadLabels();
              
              // Limpiamos contador de operaciones en el modelo visual
              const pendingModel = this.getView().getModel("pending");
              pendingModel.setProperty("/operations", []);
              pendingModel.setProperty("/count", 0);

            } else {
              // AQUÍ VERIFICAMOS SI HAY ERRORES DETALLADOS DEL BACKEND
              if (result.errorDetails && result.errorDetails.length > 0) {
                this._showErrorDialog(result.message, result.errorDetails);
              } else {
                // Si solo hay mensaje genérico, usamos el MessageBox estándar
                MessageBox.error(result.message);
              }
            }
          })
          .catch((error) => {
            MessageBox.error("Error al guardar los cambios: " + error.message);
          })
          .finally(() => {
            viewModel.setProperty("/busy", false);
          });
      },

      _showErrorDialog: function (sMainMsg, aDetails) {
        // Procesar detalles para el modelo de la vista
        const aProcessedDetails = aDetails.map((err) => {
          
          // CASO A: Error completo del Backend (con operation, code, etc.)
          if (err.code && err.operation) {
              return {
                  isBackend: true,
                  title: `Operación: ${err.operation} en ${err.collection}`,
                  id: err.id,
                  message: err.message,
                  code: err.code
              };
          }
          
          // CASO B: Error simple de validación Frontend ({ field, msg })
          // O fallback si el backend manda texto plano
          let sTitle = err.field || "Error";
          let sMsg = err.msg || err.message || err;

          if (typeof err === 'string') {
             if (err.includes("ID")) sTitle = "ID";
             else if (err.includes("requerido")) sTitle = "Campo Requerido";
          }

          return {
              isBackend: false, 
              title: sTitle,
              message: sMsg,
              id: "-", 
              code: "VALIDATION"
          };
        });

        if (!this._pErrorDialog) {
          this._pErrorDialog = this.loadFragment({
            name: "com.cat.sapfioricatalogs.view.fragments.ErrorDialog",
          }).then((oDialog) => {
            this.getView().addDependent(oDialog);
            return oDialog;
          });
        }

        this._pErrorDialog.then((oDialog) => {
          const oErrorModel = new JSONModel({
            dialogTitle: "Errores al Guardar Cambios",
            count: aProcessedDetails.length,
            details: aProcessedDetails,
          });
          oDialog.setModel(oErrorModel, "errors");
          oDialog.open();
        });
      },

      onCloseErrorDialog: function () {
        if (this._pErrorDialog) {
          this._pErrorDialog.then((oDialog) => {
            oDialog.close();
          });
        }
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
            text: sValue.trim(),
          });
          oMultiInput.addToken(oNewToken);
        }
        oMultiInput.setValue("");
      },

      _initValidationModel: function () {
        const oView = this.getView();
        const oModel = oView.getModel();
        oModel.setProperty("/validationState", {
          idSociedad: "None",
          idCedi: "None",
          idEtiqueta: "None",
          etiqueta: "None",
        });
      },

      _validateRequiredFields: function () {
        const oView = this.getView();
        const oModel = oView.getModel();

        let isValid = true;
        const validationState = {
          idSociedad: "None",
          idCedi: "None",
          idEtiqueta: "None",
          etiqueta: "None",
        };

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

      _clearValidationStates: function () {
        const oModel = this.getView().getModel();
        oModel.setProperty("/validationState", {
          idSociedad: "None",
          idCedi: "None",
          idEtiqueta: "None",
          etiqueta: "None",
        });
      },

      // --- MODIFICADO: Usar _refreshUiStates para CREATE ---
      onSaveNewCatalogo: function () {
        const oView = this.getView();
        const oModel = oView.getModel();
        // Obtenemos la lista actual de etiquetas para verificar duplicados
        const aCurrentLabels = oModel.getProperty("/labels") || [];
        
        const aValidationErrors = [];
        const validationState = {
            idSociedad: "None", idCedi: "None", idEtiqueta: "None", etiqueta: "None"
        };

        // Validar ID Etiqueta (Requerido + Duplicado Local)
        const sIdEtiqueta = oView.byId("inputIdEtiqueta").getValue();
        if (!sIdEtiqueta || sIdEtiqueta.trim() === "") {
            validationState.idEtiqueta = "Error";
            aValidationErrors.push({ field: "ID Etiqueta", msg: "IDETIQUETA es requerido." });
        } else {
            // BLINDAJE LOCAL CONTRA DUPLICADOS
            const bDuplicate = aCurrentLabels.some(label => 
                label.idetiqueta.toUpperCase() === sIdEtiqueta.toUpperCase()
            );
            if (bDuplicate) {
                validationState.idEtiqueta = "Error";
                aValidationErrors.push({ 
                    field: "ID Etiqueta", 
                    msg: `El ID '${sIdEtiqueta}' ya existe en el catálogo.` 
                });
            }
        }

        // Validar Etiqueta
        const sEtiqueta = oView.byId("inputEtiqueta").getValue();
        if (!sEtiqueta || sEtiqueta.trim() === "") {
            validationState.etiqueta = "Error";
            aValidationErrors.push({ field: "Etiqueta", msg: "ETIQUETA es requerido." });
        }

        // Validar Indice
        const oMultiInput = oView.byId("fragmentInputIndice");
        const aTokens = oMultiInput.getTokens();

        // Validar Colección
        const sColeccion = oView.byId("inputColeccion").getValue();
        if (!sColeccion || sColeccion.trim() === "") {
             aValidationErrors.push({ field: "Colección", msg: "COLECCION es requerido." });
        }
        
        // Validar Sección
        const sSeccion = oView.byId("inputSeccion").getValue();
        if (!sSeccion || sSeccion.trim() === "") {
             aValidationErrors.push({ field: "Sección", msg: "SECCION es requerido." });
        }

        oView.getModel().setProperty("/validationState", validationState);

        // SI HAY ERRORES, LLAMAMOS AL NUEVO DIALOGO
        if (aValidationErrors.length > 0) {
            this._showErrorDialog("Se encontraron errores en el formulario:", aValidationErrors);
            return; 
        }

        const sSociedad = oView.byId("inputIdSociedad").getSelectedKey() || "";
        const sCedi = oView.byId("inputIdCedi").getSelectedKey() || "";

        const aIndiceAsObjects = aTokens.map((oToken) => ({
          key: oToken.getKey(),
          text: oToken.getText(),
        }));

        const sIndiceForAPI = aTokens
          .map((oToken) => oToken.getKey())
          .join(",");

        const newData = {
          idsociedad: sSociedad,
          idcedi: sCedi,
          idetiqueta: sIdEtiqueta,
          etiqueta: sEtiqueta,
          indice: aIndiceAsObjects,
          coleccion: sColeccion,
          seccion: sSeccion,
          secuencia: parseInt(
            oView.byId("inputSecuencia").getValue() || "0",
            10
          ),
          imagen: oView.byId("inputImagen").getValue(),
          ruta: oView.byId("inputRuta").getValue(),
          descripcion: oView.byId("textAreaDescripcion").getValue(),
          parent: true,
          // uiState: "Success", // YA NO
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
          DESCRIPCION: newData.descripcion,
        };

        const operation = {
          collection: "labels",
          action: "CREATE",
          payload: apiPayload,
        };

        this._labelService.addOperation(operation);

        const aLabels = oModel.getProperty("/labels");
        aLabels.unshift(newData);
        oModel.setProperty("/labels", aLabels);

        // Refrescamos estados (pintar de verde)
        this._refreshUiStates();

        const oViewModel = this.getView().getModel("view");
        oViewModel.setProperty("/totalRows", aLabels.length);

        MessageToast.show(
          "Catálogo agregado a la tabla. Presione 'Guardar Cambios' para confirmar."
        );
        this.onCloseNewCatalogo();
      },

      onCloseNewCatalogo: function () {
        this.byId("inputIdSociedad")?.setSelectedKey("");
        this.byId("inputIdCedi")?.setSelectedKey("");

        const oCatalogsModel = this.getView().getModel("catalogs");
        if (oCatalogsModel) {
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

      // --- MODIFICADO: Usar _refreshUiStates para UPDATE ---
      onSaveUpdate: function (oEvent) {
        const oDialog =
          oEvent?.getSource()?.getParent?.() || this._updateDialog;
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
              .map((t) => (typeof t === "string" ? t : t.key || t.text || ""))
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
        } else {
          if (!updatedData.valor || updatedData.valor.trim() === "") {
            MessageBox.error("El campo 'Valor' no puede estar vacío.");
            return;
          }
        }

        // updatedData.uiState = "Warning"; // YA NO

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
            DESCRIPCION: updatedData.descripcion || "",
          };

          operation = {
            collection: "labels",
            action: "UPDATE",
            payload: {
              id: updatedData.idetiqueta,
              updates: updates,
            },
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
            IDVALORPA: updatedData.idvalorpa || undefined,
          };

          operation = {
            collection: "values",
            action: "UPDATE",
            payload: {
              id: updatedData.idvalor,
              updates: updates,
            },
          };
        }

        this._labelService.addOperation(operation);

        const dataModel = this.getView().getModel();
        const labels = dataModel.getProperty("/labels");

        if (updatedData.parent) {
          const updatedLabels = labels.map((label) =>
            label.idetiqueta === updatedData.idetiqueta ? updatedData : label
          );
          dataModel.setProperty("/labels", updatedLabels);
        } else {
          const updatedLabels = labels.map((label) => {
            if (
              label.idetiqueta === (updatedData.parentKey || label.idetiqueta)
            ) {
              return {
                ...label,
                children: (label.children || []).map((child) =>
                  child.idvalor === updatedData.idvalor
                    ? { ...updatedData }
                    : child
                ),
              };
            }
            return label;
          });
          dataModel.setProperty("/labels", updatedLabels);
        }
        
        // Refrescar estados visuales (pintar de naranja)
        this._refreshUiStates();

        oDialog.close();
        MessageToast.show(
          "Cambios guardados localmente. La fila se marcó como Warning."
        );
        MessageToast.show(
          "Cambios guardados. No olvide confirmar los cambios."
        );
      },

        // --- BUSCADOR RECURSIVO (Google Style) y Colapso ---
        onSearch: function (oEvent) {
            const sQuery = (oEvent.getParameter("newValue") || oEvent.getParameter("query") || "").toLowerCase();
            const dataModel = this.getView().getModel();
            
            // Obtenemos la copia maestra (segura) de los datos
            const aMasterData = dataModel.getProperty("/masterLabels");

            // Si no hay búsqueda, restauramos todo tal cual
            if (!sQuery) {
                dataModel.setProperty("/labels", JSON.parse(JSON.stringify(aMasterData)));
                // IMPORTANTE: Re-aplicar colores de estado si había operaciones pendientes
                this._refreshUiStates();
                
                // Actualizamos contador de filas
                this._updateTotalRows(aMasterData);
                
                // Opcional: Colapsar todo al limpiar la búsqueda también
                const oTable = this.byId("treeTable");
                if(oTable) oTable.collapseAll();

                return;
            }

            // Función auxiliar para buscar texto en un objeto (fila)
            const _matches = (obj) => {
                // Lista de campos donde queremos buscar
                const fieldsToCheck = [
                    "idetiqueta", "etiqueta", "descripcion", "idsociedad", 
                    "idcedi", "coleccion", "seccion", "ruta", "imagen",
                    "idvalor", "valor", "alias", "idvalorpa" // Campos de hijos
                ];

                return fieldsToCheck.some(key => {
                    const val = obj[key];
                    return val && String(val).toLowerCase().includes(sQuery);
                });
            };

            // LÓGICA RECURSIVA:
            const aFilteredData = [];

            aMasterData.forEach(parent => {
                const parentMatches = _matches(parent);
                
                let childrenMatches = [];
                if (parent.children && parent.children.length > 0) {
                    // Filtramos los hijos que coinciden
                    childrenMatches = parent.children.filter(child => _matches(child));
                }

                // CASO 1: El Padre coincide. 
                // Estrategia: Mostramos el padre y TODOS sus hijos (contexto completo)
                if (parentMatches) {
                    // Clonamos para no modificar la master
                    const parentClone = JSON.parse(JSON.stringify(parent));
                    aFilteredData.push(parentClone);
                }
                // CASO 2: El Padre NO coincide, pero tiene HIJOS que sí.
                // Estrategia: Mostramos el padre (para que se vea el árbol) pero SOLO los hijos filtrados
                else if (childrenMatches.length > 0) {
                    const parentClone = JSON.parse(JSON.stringify(parent));
                    parentClone.children = childrenMatches; // Reemplazamos hijos por solo los que coinciden
                    aFilteredData.push(parentClone);
                }
                // CASO 3: Ni padre ni hijos coinciden -> Se omite.
            });

            // Actualizamos el modelo directamente
            dataModel.setProperty("/labels", aFilteredData);
            
            // Aseguramos que los resultados filtrados también tengan sus colores correctos
            this._refreshUiStates();
            
            // CAMBIO: Forzamos que se cierren todos los nodos (collapseAll) en lugar de expandirlos
            const oTable = this.byId("treeTable");
            if(oTable) {
                oTable.collapseAll(); 
            }
            
            // Actualizar contador
            this._updateTotalRows(aFilteredData);
        },
            
        // Función auxiliar para recalcular el contador de filas (Total Rows)
        _updateTotalRows: function(data) {
            let totalRows = data.length;
            data.forEach(parent => {
                if (parent.children) {
                    totalRows += parent.children.length;
                }
            });
            this.getView().getModel("view").setProperty("/totalRows", totalRows);
        }

    });
  }
);