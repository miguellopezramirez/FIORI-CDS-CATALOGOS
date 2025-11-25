sap.ui.define([], function () {
    "use strict";

    return {
        /**
         * Obtiene la descripción del CEDI basándose en el idcedi
         * @param {string} idcedi - ID del CEDI a buscar
         * @param {object} oController - Referencia al controlador para acceder al modelo
         * @returns {string} Descripción del CEDI o el ID original si no se encuentra
         */
        getCediDescription: function (idcedi, oController) {
            // Caso especial: si es "0", retornar "Todos los CEDI"
            if (String(idcedi) === "0") {
                return "Todos los CEDI";
            }

            // Si no hay valor, retornar vacío
            if (!idcedi) {
                return "";
            }

            if (!oController) {
                return idcedi;
            }

            const dataModel = oController.getView().getModel();
            const aLabels = dataModel.getProperty("/labels") || [];

            // Buscar el catálogo de CEDI
            const oCediLabel = aLabels.find(label => label.idetiqueta === "CEDI");

            if (!oCediLabel || !oCediLabel.children) {
                return idcedi; // Si no existe el catálogo, retornar el ID original
            }

            // Normalizar el idcedi eliminando ceros a la izquierda para comparación
            const normalizedIdCedi = String(idcedi).replace(/^0+/, '') || '0';

            // Buscar el valor en los hijos del catálogo CEDI
            const oCediValue = oCediLabel.children.find(child => {
                const normalizedChildId = String(child.idvalor).replace(/^0+/, '') || '0';
                return normalizedChildId === normalizedIdCedi;
            });

            // Si se encuentra, retornar el VALOR, sino retornar el ID original
            return oCediValue ? oCediValue.valor : idcedi;
        },

        /**
         * Obtiene la descripción de la SOCIEDAD basándose en el idsociedad
         * @param {string} idsociedad - ID de la SOCIEDAD a buscar
         * @param {object} oController - Referencia al controlador para acceder al modelo
         * @returns {string} Descripción de la SOCIEDAD o el ID original si no se encuentra
         */
        getSociedadDescription: function (idsociedad, oController) {
            // Caso especial: si es "0", retornar "Todas las Sociedades"
            if (String(idsociedad) === "0") {
                return "Todas las Sociedades";
            }

            // Si no hay valor, retornar vacío
            if (!idsociedad) {
                return "";
            }

            if (!oController) {
                return idsociedad;
            }

            const dataModel = oController.getView().getModel();
            const aLabels = dataModel.getProperty("/labels") || [];

            // Buscar el catálogo de SOCIEDAD
            const oSociedadLabel = aLabels.find(label => label.idetiqueta === "SOCIEDAD");

            if (!oSociedadLabel || !oSociedadLabel.children) {
                return idsociedad; // Si no existe el catálogo, retornar el ID original
            }

            // Normalizar el idsociedad eliminando ceros a la izquierda para comparación
            const normalizedIdSociedad = String(idsociedad).replace(/^0+/, '') || '0';

            // Buscar el valor en los hijos del catálogo SOCIEDAD
            const oSociedadValue = oSociedadLabel.children.find(child => {
                const normalizedChildId = String(child.idvalor).replace(/^0+/, '') || '0';
                return normalizedChildId === normalizedIdSociedad;
            });

            // Si se encuentra, retornar el VALOR, sino retornar el ID original
            return oSociedadValue ? oSociedadValue.valor : idsociedad;
        },

        /**
         * Obtiene la descripción del VALOR PADRE basándose en el idvalorpa
         * Busca en TODOS los valores de todas las etiquetas
         * @param {string} idvalorpa - ID del Valor Padre a buscar
         * @param {object} oController - Referencia al controlador para acceder al modelo
         * @returns {string} Descripción del Valor Padre o el ID original si no se encuentra
         */
        getValorPadreDescription: function (idvalorpa, oController) {
            // Caso especial: si es "0", null o vacío, retornar vacío
            if (!idvalorpa || String(idvalorpa) === "0") {
                return "";
            }

            if (!oController) {
                return idvalorpa;
            }

            const dataModel = oController.getView().getModel();
            const aLabels = dataModel.getProperty("/labels") || [];

            // Normalizar el idvalorpa eliminando ceros a la izquierda para comparación
            const normalizedIdValorPa = String(idvalorpa).replace(/^0+/, '') || '0';

            // Buscar en todas las etiquetas y sus hijos
            for (const label of aLabels) {
                if (label.children) {
                    const foundChild = label.children.find(child => {
                        const normalizedChildId = String(child.idvalor).replace(/^0+/, '') || '0';
                        return normalizedChildId === normalizedIdValorPa;
                    });

                    if (foundChild) {
                        return foundChild.valor;
                    }
                }
            }

            // Si no se encuentra, retornar el ID original
            return idvalorpa;
        }
    };
});
