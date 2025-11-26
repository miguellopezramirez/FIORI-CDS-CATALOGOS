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
                    dataModel.setProperty("/masterLabels", JSON.parse(JSON.stringify(data)));

            const oSociedadLabel = data.find(
              (d) => d.idetiqueta === "SOCIEDAD"
            );
            const aSociedades = oSociedadLabel ? oSociedadLabel.children : [];

            const oCediLabel = data.find((d) => d.idetiqueta === "CEDI");
            const aCedis = oCediLabel ? oCediLabel.children : [];

            const oCatalogsModel = new JSONModel({
              sociedades: aSociedades,
              allCedis: aCedis, 
              cedis: [], 
              cedisEnabled: false, 
            });
            this.getView().setModel(oCatalogsModel, "catalogs");

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
            MessageBox.error("Error al cargar los datos: " + error.message);
          })
          .finally(() => {
            viewModel.setProperty("/busy", false);
          });
      },

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

        if (sSourceId.includes("updateInputIdSociedad")) {
          this.byId("updateInputIdCedi").setSelectedKey(null);
        } else {
          this.byId("inputIdCedi").setSelectedKey(null);
        }
      },

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
                  this._deleteRecord(oRecord);
                  oModel.setProperty(sPath + "/uiState", "Error");
                });
                oTable.clearSelection();
                this.getView()
                  .getModel("view")
                  .setProperty("/selectionCount", 0);
                this.getView()
                  .getModel("view")
                  .setProperty("/selectedLabel", null);
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
          secuencia: parseInt(
            oView.byId("valInputSecuencia").getValue() || "0",
            10
          ),
          imagen: oView.byId("valInputImagen").getValue(),
          ruta: oView.byId("valInputRuta").getValue(),
          descripcion: oView.byId("valTextAreaDescripcion").getValue(),
          parent: false,
          uiState: "Success",
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
            return {
              ...label,
              children: [...aChildren, newLocalData],
            };
          }
          return label;
        });
        dataModel.setProperty("/labels", aUpdatedLabels);
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
      },

      // --- MODIFICADO: Maneja errores del Backend en Diálogo ---
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

      // --- NUEVA FUNCIÓN: Abre el Diálogo de Errores Estilizado ---
      _showErrorDialog: function (sMainMsg, aDetails) {
            // 1. Procesar detalles. 
            const aProcessedDetails = aDetails.map(err => {
                // CASO A: Error completo del Backend (con operation, code, etc.)
                if (err.code && err.operation) {
                    return {
                        isBackend: true,
                        // FORMATO EXACTO DE LA IMAGEN:
                        title: `Operación: ${err.operation} en ${err.collection}`,
                        id: err.id,
                        message: err.message,
                        code: err.code
                    };
                }
                
                // CASO B: Error simple de validación Frontend ({ field, msg })
                return {
                    isBackend: false, 
                    title: err.field || "Error de Validación",
                    message: err.msg || err.message || err,
                    id: "-", 
                    code: "VALIDATION"
                };
            });

            if (!this._pErrorDialog) {
                this._pErrorDialog = this.loadFragment({
                    name: "com.cat.sapfioricatalogs.view.fragments.ErrorDialog"
                }).then((oDialog) => {
                    this.getView().addDependent(oDialog);
                    return oDialog;
                });
            }

            this._pErrorDialog.then((oDialog) => {
                const oErrorModel = new JSONModel({
                    dialogTitle: "Errores al Guardar Cambios",
                    count: aProcessedDetails.length,
                    details: aProcessedDetails
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

      onSaveNewCatalogo: function () {
        if (!this._validateRequiredFields()) {
          MessageBox.error(
            "Por favor, complete todos los campos marcados como obligatorios.",
            { title: "Campos Incompletos" }
          );
          return;
        }

        const oView = this.getView();

        const sSociedad = oView.byId("inputIdSociedad").getSelectedKey() || "";
        const sCedi = oView.byId("inputIdCedi").getSelectedKey() || "";

        const sIdEtiqueta = oView.byId("inputIdEtiqueta").getValue();
        const sEtiqueta = oView.byId("inputEtiqueta").getValue();

        const oMultiInput = oView.byId("fragmentInputIndice");
        const aTokens = oMultiInput.getTokens();

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
          coleccion: oView.byId("inputColeccion").getValue(),
          seccion: oView.byId("inputSeccion").getValue(),
          secuencia: parseInt(
            oView.byId("inputSecuencia").getValue() || "0",
            10
          ),
          imagen: oView.byId("inputImagen").getValue(),
          ruta: oView.byId("inputRuta").getValue(),
          descripcion: oView.byId("textAreaDescripcion").getValue(),
          parent: true,
          uiState: "Success",
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

        const oModel = this.getView().getModel();
        const aLabels = oModel.getProperty("/labels");

        aLabels.unshift(newData);

        oModel.setProperty("/labels", aLabels);

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