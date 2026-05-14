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

                            lt.date AS TransactionDate,
                            l.number AS LoanNumber,
                            
                            case when 
                            lt.type='writeoff'
                            then 'Cancelacion'
                            end
                            TransactionType,
                            ltr.type AS RowType, 
                            ltr.amount AS RowAmount,
                            par.name Nombre
                        FROM export_loan l
                        INNER JOIN export_loan_transaction lt 
                            ON l.id = lt.loan_id
                        INNER JOIN export_loan_transaction_row ltr 
                            ON lt.id = ltr.transaction_id
                        LEFT JOIN export_loan_transaction_accounttransaction lta 
                            ON lt.id = lta.transaction_id
                        LEFT JOIN export_account_transaction at 
                            ON lta.accounttransaction_id = at.id
                        LEFT JOIN export_account a 
                            ON at.account_id = a.id

                            inner join export_loan_terms lte on lte.loan_id=l.id
                            inner join export_loan_party lpar on lpar.terms_id=lte.id
                            inner join export_party par on par.id=lpar.party_id


                            where   ltr.amount< 0 and lt.type ='writeoff'

                ORDER BY lt.date DESC;

      
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