sap.ui.define(["sap/ui/base/Object"], function (BaseObject) {
  "use strict";

  return BaseObject.extend("com.cat.sapfioricatalogs.service.labelService", {
    _baseUrl: "http://localhost:3034/api/cat/",
    _operations: [],

    transformData: function (labels) {
      return labels.map(function (label) {
        const subRows = (label.valores || []).map(function (valor) {
          return {
            idsociedad: valor.IDSOCIEDAD.toString(),
            idcedi: valor.IDCEDI.toString(),
            idetiqueta: valor.IDETIQUETA,
            idvalor: valor.IDVALOR,
            idvalorpa: valor.IDVALORPA,
            valor: valor.VALOR,
            alias: valor.ALIAS,
            secuencia: valor.SECUENCIA,
            imagen: valor.IMAGEN,
            ruta: valor.ROUTE,
            descripcion: valor.DESCRIPCION,
            indice: label.INDICE || "",
            coleccion: label.COLECCION || "",
            seccion: label.SECCION || "",
            parent: false,
            parentKey: label.IDETIQUETA,
          };
        });

        return {
          parent: true,
          idsociedad: label.IDSOCIEDAD.toString(),
          idcedi: label.IDCEDI.toString(),
          idetiqueta: label.IDETIQUETA,
          etiqueta: label.ETIQUETA,
          indice: label.INDICE || "",
          coleccion: label.COLECCION || "",
          seccion: label.SECCION || "",
          secuencia: label.SECUENCIA,
          imagen: label.IMAGEN,
          ruta: label.ROUTE,
          descripcion: label.DESCRIPCION,
          subRows: subRows,
          children: subRows,
        };
      });
    },

    /**
     * Obtiene todas las etiquetas y valores desde el backend.
     * Ahora los parámetros van en la query string (params)
     * y el body va vacío, igual que en el servicio React.
     */
    fetchLabels: function () {
      const url =
        this._baseUrl +
        "crudLabelsValues?ProcessType=GetAll&LoggedUser=MIGUELLOPEZ&DBServer=MongoDB";

      return new Promise((resolve, reject) => {
        jQuery.ajax({
          url: url,
          type: "POST",
          contentType: "application/json",
          data: JSON.stringify({}), // sin body de datos
          success: (result) => {
            try {
              const apiData = result.data?.[0]?.dataRes || [];
              const transformedData = this.transformData(apiData);
              resolve(transformedData);
            } catch (error) {
              console.error("Error transforming data:", error);
              reject(error);
            }
          },
          error: (error) => {
            console.error("Error fetching labels:", error);
            reject(error);
          },
        });
      });
    },

    addOperation: function (operation) {
      this._operations.push(operation);
    },

    /**
     * Guarda las operaciones pendientes.
     * Se mandan los parámetros en la query string
     * y los datos (operations) en el body JSON.
     */
    saveChanges: function () {
      if (this._operations.length === 0) {
        return Promise.resolve({
          success: true,
          message: "No hay cambios que guardar.",
        });
      }

      const url =
        this._baseUrl +
        "crudLabelsValues?ProcessType=CRUD&LoggedUser=MIGUELLOPEZ&DBServer=MongoDB";

      return new Promise((resolve, reject) => {
        jQuery.ajax({
          url: url,
          type: "POST",
          contentType: "application/json",
          data: JSON.stringify({ operations: this._operations }),
          success: (result) => {
            this._operations = [];
            resolve({
              success: true,
              message: "Cambios guardados exitosamente.",
              data: result,
            });
          },
          error: (error) => {
            console.error("Error saving changes:", error);
            reject({
              success: false,
              message: "Error al guardar los cambios.",
            });
          },
        });
      });
    },

    clearOperations: function () {
      this._operations = [];
    },
  });
});
