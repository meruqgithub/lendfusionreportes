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
        WITH 
-- Información del préstamo y sus términos activos
prestamos AS (
    SELECT
        l.id AS loan_id,
        l.number AS numero_prestamo,
        l.issued AS fecha_emision,
        t.principal AS capital_sin_interes,
        t.interest_rate AS porcentaje_interes,
        t.id AS terms_id
    FROM export_loan l
    INNER JOIN export_loan_terms t ON l.current_terms_id = t.id
    WHERE l.status = 'issued'   -- Solo préstamos emitidos
),
-- Cliente (prestatario) a través de export_loan_party
cliente AS (
    SELECT
        lp.terms_id,
        p.name AS nombre_cliente
    FROM export_loan_party lp
    INNER JOIN export_party p ON lp.party_id = p.id
    WHERE lp.role = 'borrower' AND lp.status = 'active'
),
-- Analista asignado (a través de la solicitud)
analista AS (
    SELECT
        la.loan_id,
        a.name AS nombre_analista
    FROM export_loan_application la
    INNER JOIN export_application app ON la.application_id = app.id
    LEFT JOIN export_admin a ON app.analyst_manager_id = a.id
),
-- Totales de la tabla de amortización
totales_cuotas AS (
    SELECT
        terms_id,
        SUM(interest) AS total_interes,
        SUM(principal + interest) AS total_capital_mas_interes,
        COUNT(*) AS numero_cuotas
    FROM export_loan_schedule_item
    GROUP BY terms_id
),
-- Primera cuota de cada préstamo
primera_cuota AS (
    SELECT
        terms_id,
        principal AS capital_cuota_mes,
        interest AS interes_cuota_mes,
        (principal + interest) AS total_cuota_mes,
        ROW_NUMBER() OVER (PARTITION BY terms_id ORDER BY duedate) AS rn
    FROM export_loan_schedule_item
)
SELECT
    p.fecha_emision,
    p.numero_prestamo,
    c.nombre_cliente,
    a.nombre_analista,
    p.capital_sin_interes,
    p.porcentaje_interes,
    t.total_interes,
    t.total_capital_mas_interes,
    t.numero_cuotas,
    pc.capital_cuota_mes,
    pc.interes_cuota_mes,
    pc.total_cuota_mes
FROM prestamos p
LEFT JOIN cliente c ON p.terms_id = c.terms_id
LEFT JOIN analista a ON p.loan_id = a.loan_id
INNER JOIN totales_cuotas t ON p.terms_id = t.terms_id
INNER JOIN primera_cuota pc ON p.terms_id = pc.terms_id AND pc.rn = 1
ORDER BY p.fecha_emision;
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