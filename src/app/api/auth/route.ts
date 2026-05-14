import { NextRequest, NextResponse } from 'next/server';
import sql from 'mssql';

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

export async function POST(request: NextRequest) {
  let pool;
  try {
    const body = await request.json();
    const { user, password } = body;

    if (!user || !password) {
      return NextResponse.json({ success: false, error: 'Usuario y contraseña requeridos' }, { status: 400 });
    }

    pool = await sql.connect(config);
    const result = await pool.request()
      .input('user', sql.VarChar, user)
      .input('password', sql.VarChar, password)
      .query(`SELECT [user] FROM [dbo].[usuarios_sistema] WHERE [user] = @user AND [password] = @password`);
    
    await pool.close();

    if (result.recordset.length > 0) {
      return NextResponse.json({ success: true, user: result.recordset[0].user });
    } else {
      return NextResponse.json({ success: false, error: 'Usuario o contraseña incorrectos' }, { status: 401 });
    }

  } catch (error: any) {
    console.error('Error en auth API:', error);
    if (pool) {
      try { await pool.close(); } catch (e) {}
    }
    return NextResponse.json({ success: false, error: 'Error del servidor al autenticar' }, { status: 500 });
  }
}
