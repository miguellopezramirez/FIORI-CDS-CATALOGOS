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
              // Resolvemos array vacío para no romper flujo
              resolve([]);
            }
          },
          error: (error) => {
            console.error("Error fetching labels:", error);
            // Resolvemos array vacío
            resolve([]);
          },
        });
      });
    },

    // --- NUEVO: Obtener operaciones para la vista ---
    getOperations: function () {
      return this._operations;
    },

    // --- MODIFICADO: addOperation (Smart Merge + Tracking ID) ---
    addOperation: function (newOp) {
      // 1. Determinar la clave de rastreo (Tracking ID)
      // Si es CREATE, el ID viene en el payload directo (ej: IDETIQUETA)
      // Si es UPDATE/DELETE, el ID viene en payload.id (que es el ID ORIGINAL antes de editar)
      
      let sTrackingId = newOp.payload.id; 
      
      if (!sTrackingId && newOp.action === 'CREATE') {
          // Para CREATE, usamos el ID nuevo como rastreo inicial
          sTrackingId = newOp.payload.IDETIQUETA || newOp.payload.IDVALOR;
      }

      const sCollection = newOp.collection;

      // Buscamos si ya existe una operación pendiente para este ID ORIGINAL
      const existingOpIndex = this._operations.findIndex(op => {
          // Extraemos el ID de rastreo de la operación guardada
          let storedId = op.payload.id;
          if (!storedId && op.action === 'CREATE') {
             storedId = op.payload.IDETIQUETA || op.payload.IDVALOR;
          }
          return storedId === sTrackingId && op.collection === sCollection;
      });

      // CASO 1: No existe operación previa -> Agregamos la nueva
      if (existingOpIndex === -1) {
          // Guardamos el ID visualmente para la lista (puede ser el nuevo si se editó)
          // Pero mantenemos el payload intacto para el rastreo lógico
          let displayId = sTrackingId;
          
          // Si es un UPDATE que cambia el ID, el ID nuevo está dentro de 'updates'
          if(newOp.action === 'UPDATE' && newOp.payload.updates) {
              if(newOp.payload.updates.IDETIQUETA) displayId = newOp.payload.updates.IDETIQUETA;
              if(newOp.payload.updates.IDVALOR) displayId = newOp.payload.updates.IDVALOR;
          }

          this._operations.push(this._enrichOpForDisplay(newOp, displayId));
          return;
      }

      const existingOp = this._operations[existingOpIndex];

      // CASO 2: Ya existía. Analizamos la combinación:

      // A) Si la nueva es DELETE...
      if (newOp.action === 'DELETE') {
          if (existingOp.action === 'CREATE') {
              // Si estaba pendiente de CREAR y lo borramos -> Se cancelan mutuamente.
              // Lo quitamos de la lista como si nunca hubiera existido.
              this._operations.splice(existingOpIndex, 1);
          } else {
              // Si era UPDATE, lo sobrescribimos con DELETE (el borrado gana)
              // Usamos el ID original para asegurar que el backend sepa cuál borrar
              this._operations[existingOpIndex] = this._enrichOpForDisplay(newOp, sTrackingId);
          }
      }
      // B) Si la nueva es UPDATE...
      else if (newOp.action === 'UPDATE') {
          if (existingOp.action === 'CREATE') {
              // REGLA: Crear + Modificar = Crear (con datos nuevos)
              // Fusionamos los cambios del update en el payload del create
              const mergedPayload = { ...existingOp.payload, ...newOp.payload.updates };
              existingOp.payload = mergedPayload;
              
              // Actualizamos el ID visual en la lista por si cambió
              const newId = mergedPayload.IDETIQUETA || mergedPayload.IDVALOR;
              existingOp.id = newId; 
              
              // La acción se mantiene como CREATE (Sigue verde en la tabla)
          } else if (existingOp.action === 'UPDATE') {
              // Modificar + Modificar = Modificar (últimos datos ganan)
              const mergedUpdates = { ...existingOp.payload.updates, ...newOp.payload.updates };
              existingOp.payload.updates = mergedUpdates;
              
              // Actualizamos el ID visual
              if(mergedUpdates.IDETIQUETA) existingOp.id = mergedUpdates.IDETIQUETA;
              if(mergedUpdates.IDVALOR) existingOp.id = mergedUpdates.IDVALOR;
          }
      }
    },

    // Helper visual para la modal
    _enrichOpForDisplay: function (op, id) {
      op.id = id; // Este es solo para mostrar en la modal (puede ser el ID nuevo)
      op.type = op.collection === 'labels' ? 'Catálogo' : 'Valor';
      return op;
    },

    // --- NUEVO: DESHACER OPERACIÓN ---
    removeOperation: function (iIndex) {
      if (iIndex > -1 && iIndex < this._operations.length) {
        this._operations.splice(iIndex, 1);
      }
    },

    // Guarda las operaciones pendientes.
    saveChanges: function () {
      if (this._operations.length === 0) {
        return Promise.resolve({
          success: true,
          message: "No hay cambios que guardar.",
        });
      }

      // PASO DE LIMPIEZA (SANITIZACIÓN) - IMPORTANTE:
      // Quitamos las propiedades 'id' y 'type' que agregamos solo para la interfaz visual (la modal).
      // El backend no espera recibir estos campos y pueden causar error 400.
      const sanitizedOperations = this._operations.map(op => {
        const cleanOp = Object.assign({}, op);
        delete cleanOp.id;   // Borramos campos visuales
        delete cleanOp.type; 
        return cleanOp;
      });

      // CONSOLE LOG SOLICITADO: Ver qué se manda al backend
      console.log("🚀 [PAYLOAD A ENVIAR AL BACKEND]:", JSON.stringify({ operations: sanitizedOperations }, null, 2));

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
          data: JSON.stringify({ operations: sanitizedOperations }),
          success: (result) => {
            this._operations = [];
            resolve({
              success: true,
              message: "Cambios guardados exitosamente.",
              data: result,
            });
          },
          error: (xhr, status, error) => {
            console.error("Error saving changes:", error);

            const response = xhr.responseJSON;
            let sMsg = "Error desconocido";
            let aBackendErrors = [];
            
            // Set para evitar duplicados en la modal rosa
            const seenErrors = new Set();

            // 1. Intentar obtener mensaje principal
            if (response && response.error) {
              sMsg = response.error.message;
              
              if (response.error.innererror && response.error.innererror.messageUSR) {
                sMsg = response.error.innererror.messageUSR;
              }
            }

            // 2. PARSING DETALLADO PARA LA MODAL (Estructura innererror)
            if (response && response.error && response.error.innererror && Array.isArray(response.error.innererror.data)) {
              
              response.error.innererror.data.forEach(group => {
                if (group.dataRes && Array.isArray(group.dataRes)) {
                  group.dataRes.forEach(item => {
                    // Buscamos solo los items que fallaron
                    if (item.status === "ERROR" && item.error) {
                      
                      const uniqueKey = (item.id || "unknown") + "_" + (item.error.code || "err");
                      
                      if (!seenErrors.has(uniqueKey)) {
                        seenErrors.add(uniqueKey);
                        
                        aBackendErrors.push({
                          operation: item.operation,
                          collection: item.collection,
                          id: item.id,
                          code: item.error.code,
                          message: item.error.message
                        });
                      }
                    }
                  });
                }
              });
            }

            // CAMBIO: Resolvemos success: false con los detalles
            resolve({
              success: false,
              message: sMsg,
              errorDetails: aBackendErrors
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