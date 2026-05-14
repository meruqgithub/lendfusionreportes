import { NextRequest, NextResponse } from 'next/server';
import sql from 'mssql';

export const maxDuration = 300; 
export const dynamic = 'force-dynamic';

const config = {
  server: '207.244.236.74\\saint',
  user: 'sa',
  password: 'Rsistems86',
  database: 'lendfusion',
  options: {
    encrypt: false,
    trustServerCertificate: true,
    connectionTimeout: 30000, 
    requestTimeout: 300000     
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  }
};

// Función para esperar entre reintentos
const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

export async function GET(request: NextRequest) {
  let pool;
  const maxRetries = 10;
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Intento de conexión ${attempt} de ${maxRetries}...`);
      
      pool = await sql.connect(config);
      
      const query = `select * from estado_cuenta `;
      const queryAssets = `
        SELECT 
            l.number AS [Numero_prestamo], 
            SUM(ltr.amount) AS [Activo]
        FROM export_loan l
        INNER JOIN export_loan_transaction trans 
            ON l.id = trans.loan_id
        INNER JOIN export_loan_transaction_row ltr 
            ON trans.id = ltr.transaction_id
        WHERE 
            ltr.[group] = 'asset' 
        GROUP BY 
            l.number;
      `;
      
      const result = await pool.request().query(query);
      const assetsResult = await pool.request().query(queryAssets);
      await pool.close();
      
      return NextResponse.json({
        success: true,
        data: result.recordset,
        assets: assetsResult.recordset,
        total: result.recordset.length,
        attempts: attempt
      });

    } catch (error: any) {
      lastError = error;
      console.error(`Error en intento ${attempt}:`, error.message);
      
      if (pool) await pool.close();

      // Si no es el último intento, esperamos 2 segundos antes de volver a probar
      if (attempt < maxRetries) {
        await delay(2000); 
      }
    }
  }

  // Si llega aquí, es porque agotó los 3 intentos
  return NextResponse.json({
    success: false,
    error: 'Agotados los 3 intentos de conexión',
    details: lastError?.toString()
  }, { status: 503 });
}