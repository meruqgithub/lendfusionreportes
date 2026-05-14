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
      
      const query = `
      
     SELECT
    l.number                      AS numero_prestamo,
    p.name                        AS nombre_cliente,
    a.name                        AS analista,
    c.date                        AS fecha_cargo,
    c.description                 AS descripcion_cargo,

    ca.amount                     AS monto

FROM
    export_loan_claim c
    INNER JOIN export_loan l ON c.loan_id = l.id
    LEFT JOIN export_loan_claimarticle ca ON c.id = ca.claim_id
    LEFT JOIN export_loan_application la ON l.id = la.loan_id
    LEFT JOIN export_application app ON la.application_id = app.id
    LEFT JOIN export_admin a ON app.analyst_manager_id = a.id
    LEFT JOIN export_loan_party lp ON l.current_terms_id = lp.terms_id AND lp.role = 'borrower'
    LEFT JOIN export_party p ON lp.party_id = p.id
WHERE
    ca.article NOT IN ('interest', 'principal')
ORDER BY
    c.date DESC, l.number;
`;
      
      const result = await pool.request().query(query);
      await pool.close();
      
      return NextResponse.json({
        success: true,
        data: result.recordset,
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