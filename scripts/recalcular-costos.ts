/**
 * Vuelve a calcular el gasto estimado (CostoUsd) de toda la bitacora con los precios
 * actuales de tblPrecios. Para despues de capturar o corregir precios.
 *
 * Uso:  npm run db:recalcular
 * (Lo mismo hace el boton "Recalcular gasto" en Catalogo -> Precios.)
 */
import 'dotenv/config';
import pool from '../lib/db';
import { recalcularCostos } from '../lib/precios';

recalcularCostos()
  .then((r) => {
    console.log(`Revisadas ${r.revisadas} llamadas con tokens: ${r.actualizadas} actualizadas, ${r.sinPrecio} sin precio para su modelo.`);
    return pool.end();
  })
  .catch((error) => {
    console.error('El recalculo fallo:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
