sap.ui.define(["sap/ui/base/Object"], function (BaseObject) {
  "use strict";

  /**
 * Convierte un string de índices (separados por comas) en un array de Tokens.
 * @param {string} sIndice El string de índices, ej: "Marca,Vehiculo"
 * @returns {Array<object>} Un array de objetos para el MultiInput, ej: [{key: "Marca", text: "Marca"}, ...]
 */
  function _transformIndiceToArray(sIndice) {
    if (!sIndice || sIndice.trim() === "") {
      return []; // Devuelve array vacío si no hay índice
    }

    // Asumimos que tus etiquetas en el string están separadas por comas
    const aTags = sIndice.split(',');

    return aTags.map(function (sTag) {
      const sTrimmedTag = sTag.trim();
      if (sTrimmedTag) {
        return { key: sTrimmedTag, text: sTrimmedTag };
      }
    }).filter(Boolean); // Filtra posibles valores vacíos (ej. si había "tag1,,tag2")
  }

  return BaseObject.extend("com.cat.sapfioricatalogs.service.labelService", {
    _baseUrl: "http://localhost:3034/api/cat/",
    _operations: [],
    _oConfigModel: null, // Variable para guardar el modelo

    // Esta función la llama el controlador
    setConfigModel: function (oModel) {
      this._oConfigModel = oModel;
    },

    // Helper para obtener el valor de la DB
    _getDBServer: function () {
      if (this._oConfigModel) {
        return this._oConfigModel.getProperty("/selectedDB");
      }
      // Valor por defecto si algo falla
      return "MongoDB"; 
    },

    transformData: function (labels) {
      return labels.map(function (label) {
        const subRows = (label.valores || []).map(function (valor) {
          return {
            idsociedad: valor.IDSOCIEDAD || "",
            idcedi: valor.IDCEDI || "",
            idetiqueta: valor.IDETIQUETA,
            idvalor: valor.IDVALOR,
            idvalorpa: valor.IDVALORPA,
            valor: valor.VALOR,
            alias: valor.ALIAS,
            secuencia: valor.SECUENCIA,
            imagen: valor.IMAGEN,
            ruta: valor.ROUTE,
            descripcion: valor.DESCRIPCION,
            indice: _transformIndiceToArray(label.INDICE) || "", // Los hijos heredan/usan el índice del padre
            coleccion: label.COLECCION || "",
            seccion: label.SECCION || "",
            parent: false,
            parentKey: label.IDETIQUETA,
          };
        });

        return {
          parent: true,
          idsociedad: label.IDSOCIEDAD || "",
          idcedi: label.IDCEDI || "",
          idetiqueta: label.IDETIQUETA,
          etiqueta: label.ETIQUETA,
          indice: _transformIndiceToArray(label.INDICE) || "",
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


    //Obtiene todas las etiquetas y valores desde el backend.
    fetchLabels: function () {
      // Obtenemos el valor de la DB dinámicamente
      const sDBServer = this._getDBServer();
      const url =
        this._baseUrl +
        "crudLabelsValues?ProcessType=GetAll&LoggedUser=MIGUELLOPEZ&DBServer=" + sDBServer;

      return new Promise((resolve, reject) => {
        jQuery.ajax({
          url: url,
          type: "POST",
          contentType: "application/json",
          data: JSON.stringify({}),
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


    // Guarda las operaciones pendientes.
    saveChanges: function () {
      if (this._operations.length === 0) {
        return Promise.resolve({
          success: true,
          message: "No hay cambios que guardar.",
        });
      }

      // Obtenemos el valor de la DB dinámicamente
      const sDBServer = this._getDBServer();
      const url =
        this._baseUrl +
        "crudLabelsValues?ProcessType=CRUD&LoggedUser=MIGUELLOPEZ&DBServer=" + sDBServer;

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
